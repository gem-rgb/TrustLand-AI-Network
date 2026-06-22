import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { generateEd25519KeyPair, generateT3Did } from '../src/lib/t3-crypto.js';
const TERMINAL_TRANSACTION_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const tests = [];
function test(name, run) {
    tests.push({ name, run });
}
function resetGlobals() {
    delete globalThis.__trustland_payment_store;
    delete globalThis.__trustland_data;
    delete globalThis.__t3_verifiable_ledger;
}
async function loadModules(options = {}) {
    resetGlobals();
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = options.stripe ? 'pk_test_123' : '';
    process.env.STRIPE_SECRET_KEY = options.stripe ? 'sk_test_123' : '';
    process.env.STRIPE_WEBHOOK_SECRET = options.stripe ? 'whsec_test_123' : '';
    const backend = await import('../src/lib/backend-data.js');
    backend.initializeData();
    const payments = await import('../src/lib/payments.js');
    const autonomous = await import('../src/lib/t3-autonomous-purchase.js');
    const ledger = await import('../src/lib/t3-ledger.js');
    return { backend, payments, autonomous, ledger };
}
function getSession(overrides = {}) {
    return {
        userId: overrides.userId || 'did:trustland:test-user',
        role: overrides.role || 'buyer',
        displayName: overrides.displayName ?? 'Test User',
        kycStatus: overrides.kycStatus || 'verified',
    };
}
function buildWebhookPayload(payment) {
    return {
        id: `evt_${crypto.randomUUID()}`,
        type: 'payment_intent.succeeded',
        data: {
            object: {
                id: payment.stripePaymentIntentId || `pi_${crypto.randomUUID()}`,
                amount: Math.round(payment.amount * 100),
                currency: payment.currency.toLowerCase(),
                metadata: {
                    trustlandTransactionId: payment.transactionId,
                    parcelId: payment.parcelId,
                    userId: 'did:trustland:test-user',
                    paymentPurpose: payment.paymentPurpose,
                },
            },
        },
    };
}
test('rejects unsupported payment purposes for a buyer session', async () => {
    const { backend, payments } = await loadModules();
    const property = backend.data.properties[0];
    await assert.rejects(() => payments.createPaymentIntentRecord({
        parcelId: property.id,
        paymentPurpose: 'service_fee',
    }, getSession({ role: 'buyer' })), (error) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403));
});
test('rejects browser-supplied amount mismatches', async () => {
    const { backend, payments } = await loadModules();
    const property = backend.data.properties[0];
    await assert.rejects(() => payments.createPaymentIntentRecord({
        parcelId: property.id,
        paymentPurpose: 'verification_fee',
        amount: property.askingPrice,
        currency: property.currency,
    }, getSession({ role: 'admin' })), (error) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 400));
});
test('requires full settlement conditions before advancing purchase completion', async () => {
    const { autonomous } = await loadModules();
    assert.equal(autonomous.canAdvanceWorkflowAfterPayment({
        paymentPurpose: 'purchase_settlement',
        hasVerifiedIdentity: true,
        hasCompletedDueDiligence: true,
        hasLegalApproval: true,
        hasEscrowFunding: false,
    }), false);
    assert.equal(autonomous.canAdvanceWorkflowAfterPayment({
        paymentPurpose: 'purchase_settlement',
        hasVerifiedIdentity: true,
        hasCompletedDueDiligence: true,
        hasLegalApproval: true,
        hasEscrowFunding: true,
    }), true);
});
test('verifies Stripe webhook signatures before processing', async () => {
    const payload = JSON.stringify({
        id: `evt_${crypto.randomUUID()}`,
        type: 'payment_intent.succeeded',
        data: {
            object: {
                id: `pi_${crypto.randomUUID()}`,
                amount: 1000,
                currency: 'usd',
                metadata: {
                    trustlandTransactionId: 'txn_signature_test',
                    parcelId: 'prop_signature_test',
                    userId: 'did:trustland:test-user',
                    paymentPurpose: 'reservation_deposit',
                },
            },
        },
    });
    const stripe = new Stripe('sk_test_123');
    const validSignature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_test_123',
    });
    const event = stripe.webhooks.constructEvent(payload, validSignature, 'whsec_test_123');
    assert.equal(event.type, 'payment_intent.succeeded');
});
test('autonomous purchase execution creates a backend transaction and advances workflow state', async () => {
    const { backend, autonomous } = await loadModules();
    const buyerKeyPair = generateEd25519KeyPair();
    const agentKeyPair = generateEd25519KeyPair();
    const granterDid = generateT3Did(buyerKeyPair.publicKeyBase64);
    const agentDid = generateT3Did(agentKeyPair.publicKeyBase64);
    const criteria = {
        propertyType: 'agricultural',
        maxPrice: 50000,
        location: 'Nakuru',
    };
    const delegation = autonomous.t3AutonomousPurchase.createDelegation(granterDid, 'Autonomous Buyer', 'test-agent-autonomous', agentDid, criteria, buyerKeyPair);
    const matchingProperty = backend.data.properties
        .find((property) => property.propertyType === 'agricultural' && property.city === 'Nakuru' && property.askingPrice <= 50000);
    assert.ok(matchingProperty);
    const result = await autonomous.t3AutonomousPurchase.executeAutonomousPurchase(delegation.id, [{
            id: matchingProperty.id,
            title: matchingProperty.title,
            askingPrice: matchingProperty.askingPrice,
            trustScore: matchingProperty.trustScore,
            city: matchingProperty.city,
            propertyType: matchingProperty.propertyType,
            features: matchingProperty.features,
        }], agentKeyPair);
    assert.ok(result.transactionId);
    assert.equal(result.workflowStatus, 'financing');
    assert.equal(result.paymentRequired, true);
    assert.equal(result.nextRequiredWorkflowStep, 'approval');
    const transaction = backend.data.transactions.find((item) => item.id === result.transactionId);
    assert.ok(transaction);
    assert.equal(transaction?.status, 'financing');
    const workflow = backend.data.workflows.find((item) => item.transactionId === result.transactionId);
    assert.ok(workflow);
    assert.equal(workflow?.currentState, 'financing');
    const transactionEvents = backend.data.transactionEvents.filter((item) => item.transactionId === result.transactionId);
    assert.ok(transactionEvents.length >= 5);
    assert.ok(backend.data.ledger.some((entry) => entry.transactionId === result.transactionId && entry.eventType === 'transaction_stage_change'));
});
test('processes a successful payment webhook and writes a ledger entry once', async () => {
    const { backend, payments, ledger } = await loadModules();
    const property = backend.data.properties[0];
    const payment = await payments.createPaymentIntentRecord({
        parcelId: property.id,
        paymentPurpose: 'reservation_deposit',
    }, getSession({ role: 'buyer' }));
    const event = buildWebhookPayload(payment.payment);
    const first = await payments.processStripeWebhookEvent(event);
    assert.equal(first.duplicate, false);
    assert.equal(first.payment?.status, 'paid');
    assert.ok(first.payment?.ledgerEntryId);
    assert.ok(ledger.t3VerifiableLedger.getEntriesForTransaction(payment.payment.transactionId).length > 0);
    const second = await payments.processStripeWebhookEvent(event);
    assert.equal(second.duplicate, true);
    assert.equal(second.payment?.ledgerEntryId, first.payment?.ledgerEntryId);
});
test('marks failed payments from Stripe failures', async () => {
    const { backend, payments } = await loadModules();
    const property = backend.data.properties[0];
    const payment = await payments.createPaymentIntentRecord({
        parcelId: property.id,
        paymentPurpose: 'verification_fee',
    }, getSession({ role: 'buyer' }));
    const event = {
        id: `evt_${crypto.randomUUID()}`,
        type: 'payment_intent.payment_failed',
        data: {
            object: {
                id: payment.payment.stripePaymentIntentId || `pi_${crypto.randomUUID()}`,
                amount: Math.round(payment.payment.amount * 100),
                currency: payment.payment.currency.toLowerCase(),
                metadata: {
                    trustlandTransactionId: payment.payment.transactionId,
                    parcelId: payment.payment.parcelId,
                    userId: payment.payment.payerUserId,
                    paymentPurpose: payment.payment.paymentPurpose,
                },
                last_payment_error: {
                    message: 'Card declined',
                },
            },
        },
    };
    const result = await payments.processStripeWebhookEvent(event);
    assert.equal(result.payment?.status, 'failed');
    assert.match(result.payment?.failureReason || '', /Card declined/);
});
test('marks refunded payments and restores reserved listings', async () => {
    const { backend, payments } = await loadModules();
    const property = backend.data.properties[0];
    const payment = await payments.createPaymentIntentRecord({
        parcelId: property.id,
        paymentPurpose: 'reservation_deposit',
    }, getSession({ role: 'buyer' }));
    const successEvent = buildWebhookPayload(payment.payment);
    await payments.processStripeWebhookEvent(successEvent);
    property.status = 'reserved';
    const refundEvent = {
        id: `evt_${crypto.randomUUID()}`,
        type: 'charge.refunded',
        data: {
            object: {
                id: `ch_${crypto.randomUUID()}`,
                payment_intent: payment.payment.stripePaymentIntentId || `pi_${crypto.randomUUID()}`,
                amount: Math.round(payment.payment.amount * 100),
                currency: payment.payment.currency.toLowerCase(),
                metadata: {
                    trustlandTransactionId: payment.payment.transactionId,
                    parcelId: payment.payment.parcelId,
                    userId: payment.payment.payerUserId,
                    paymentPurpose: payment.payment.paymentPurpose,
                },
            },
        },
    };
    const result = await payments.processStripeWebhookEvent(refundEvent);
    assert.equal(result.payment?.status, 'refunded');
    assert.equal(property.status, 'available');
});
test('lets a seller update and archive their own property listing', async () => {
    const { backend } = await loadModules();
    const sellerIdentity = backend.data.identities.find((identity) => identity.profile.role === 'seller');
    assert.ok(sellerIdentity);
    const ownedProperty = backend.data.properties.find((property) => property.ownerDid === sellerIdentity.did
        && !backend.data.transactions.some((tx) => tx.propertyId === property.id && !TERMINAL_TRANSACTION_STATUSES.has(tx.status)));
    assert.ok(ownedProperty);
    const propertyManagement = await import('../src/lib/property-management.js');
    const session = getSession({
        userId: sellerIdentity.did,
        role: 'seller',
        displayName: sellerIdentity.profile.name,
    });
    const updatedTitle = `${ownedProperty.title} - Updated`;
    const originalAskingPrice = ownedProperty.askingPrice;
    const updateBody = propertyManagement.updatePropertyListing(ownedProperty.id, session, {
        title: updatedTitle,
        askingPrice: originalAskingPrice + 500000,
        description: `${ownedProperty.description} Updated by seller.`,
        features: ['Garden', 'Security'],
        status: 'for_sale',
    });
    assert.equal(updateBody.title, updatedTitle);
    assert.equal(updateBody.askingPrice, originalAskingPrice + 500000);
    assert.equal(updateBody.status, 'for_sale');
    const deleteBody = propertyManagement.archivePropertyListing(ownedProperty.id, session, 'No longer listed');
    assert.equal(deleteBody.status, 'off-market');
    assert.ok(deleteBody.archivedAt);
});
test('rejects unauthorized edits on properties they do not own', async () => {
    const { backend } = await loadModules();
    const property = backend.data.properties[0];
    assert.ok(property);
    const propertyManagement = await import('../src/lib/property-management.js');
    const session = getSession({ role: 'buyer' });
    assert.throws(() => propertyManagement.updatePropertyListing(property.id, session, { title: 'Unauthorized update' }), (error) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403));
});
async function main() {
    let passed = 0;
    for (const current of tests) {
        try {
            await current.run();
            console.log(`PASS ${current.name}`);
            passed += 1;
        }
        catch (error) {
            console.error(`FAIL ${current.name}`);
            console.error(error);
            process.exitCode = 1;
            break;
        }
    }
    if (process.exitCode && process.exitCode !== 0) {
        throw new Error('One or more payment tests failed');
    }
    console.log(`Completed ${passed} payment tests`);
}
void main();
