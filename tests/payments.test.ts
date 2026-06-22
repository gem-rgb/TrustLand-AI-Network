import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { generateEd25519KeyPair, generateT3Did } from '../src/lib/t3-crypto';

type LoadedModules = {
  backend: typeof import('../src/lib/backend-data');
  payments: typeof import('../src/lib/payments');
  autonomous: typeof import('../src/lib/t3-autonomous-purchase');
  ledger: typeof import('../src/lib/t3-ledger');
};

type SessionRole = 'admin' | 'buyer' | 'seller';

type PaymentSessionLike = {
  userId: string;
  role: SessionRole;
  displayName: string | null;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
};

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const tests: TestCase[] = [];

function test(name: string, run: () => Promise<void>) {
  tests.push({ name, run });
}

function resetGlobals() {
  delete (globalThis as Record<string, unknown>).__trustland_payment_store;
  delete (globalThis as Record<string, unknown>).__trustland_data;
  delete (globalThis as Record<string, unknown>).__t3_verifiable_ledger;
}

async function loadModules(options: { stripe?: boolean } = {}): Promise<LoadedModules> {
  resetGlobals();

  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = options.stripe ? 'pk_test_123' : '';
  process.env.STRIPE_SECRET_KEY = options.stripe ? 'sk_test_123' : '';
  process.env.STRIPE_WEBHOOK_SECRET = options.stripe ? 'whsec_test_123' : '';

  const backend = await import('../src/lib/backend-data');
  backend.initializeData();
  const payments = await import('../src/lib/payments');
  const autonomous = await import('../src/lib/t3-autonomous-purchase');
  const ledger = await import('../src/lib/t3-ledger');

  return { backend, payments, autonomous, ledger };
}

function getSession(overrides: Partial<PaymentSessionLike> = {}): PaymentSessionLike {
  return {
    userId: overrides.userId || 'did:trustland:test-user',
    role: overrides.role || 'buyer',
    displayName: overrides.displayName ?? 'Test User',
    kycStatus: overrides.kycStatus || 'verified',
  };
}

function buildWebhookPayload(payment: {
  transactionId: string;
  parcelId: string;
  paymentPurpose: string;
  amount: number;
  currency: string;
  stripePaymentIntentId: string | null;
}) {
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

  await assert.rejects(
    () =>
      payments.createPaymentIntentRecord(
        {
          parcelId: property.id,
          paymentPurpose: 'service_fee',
        },
        getSession({ role: 'buyer' })
      ),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 403)
  );
});

test('rejects browser-supplied amount mismatches', async () => {
  const { backend, payments } = await loadModules();
  const property = backend.data.properties[0];

  await assert.rejects(
    () =>
      payments.createPaymentIntentRecord(
        {
          parcelId: property.id,
          paymentPurpose: 'verification_fee',
          amount: property.askingPrice,
          currency: property.currency,
        },
        getSession({ role: 'admin' })
      ),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 400)
  );
});

test('requires full settlement conditions before advancing purchase completion', async () => {
  const { autonomous } = await loadModules();

  assert.equal(
    autonomous.canAdvanceWorkflowAfterPayment({
      paymentPurpose: 'purchase_settlement',
      hasVerifiedIdentity: true,
      hasCompletedDueDiligence: true,
      hasLegalApproval: true,
      hasEscrowFunding: false,
    }),
    false
  );

  assert.equal(
    autonomous.canAdvanceWorkflowAfterPayment({
      paymentPurpose: 'purchase_settlement',
      hasVerifiedIdentity: true,
      hasCompletedDueDiligence: true,
      hasLegalApproval: true,
      hasEscrowFunding: true,
    }),
    true
  );
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

  const delegation = autonomous.t3AutonomousPurchase.createDelegation(
    granterDid,
    'Autonomous Buyer',
    'test-agent-autonomous',
    agentDid,
    criteria,
    buyerKeyPair
  );

  const matchingProperty = backend.data.properties
    .find((property) => property.propertyType === 'agricultural' && property.city === 'Nakuru' && property.askingPrice <= 50000);

  assert.ok(matchingProperty);

  const result = await autonomous.t3AutonomousPurchase.executeAutonomousPurchase(
    delegation.id,
    [{
      id: matchingProperty!.id,
      title: matchingProperty!.title,
      askingPrice: matchingProperty!.askingPrice,
      trustScore: matchingProperty!.trustScore,
      city: matchingProperty!.city,
      propertyType: matchingProperty!.propertyType,
      features: matchingProperty!.features,
    }],
    agentKeyPair
  );

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
  const payment = await payments.createPaymentIntentRecord(
    {
      parcelId: property.id,
      paymentPurpose: 'reservation_deposit',
    },
    getSession({ role: 'buyer' })
  );

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
  const payment = await payments.createPaymentIntentRecord(
    {
      parcelId: property.id,
      paymentPurpose: 'verification_fee',
    },
    getSession({ role: 'buyer' })
  );

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
  } as const;

  const result = await payments.processStripeWebhookEvent(event);
  assert.equal(result.payment?.status, 'failed');
  assert.match(result.payment?.failureReason || '', /Card declined/);
});

test('marks refunded payments and restores reserved listings', async () => {
  const { backend, payments } = await loadModules();
  const property = backend.data.properties[0];
  const payment = await payments.createPaymentIntentRecord(
    {
      parcelId: property.id,
      paymentPurpose: 'reservation_deposit',
    },
    getSession({ role: 'buyer' })
  );

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
  } as const;

  const result = await payments.processStripeWebhookEvent(refundEvent);
  assert.equal(result.payment?.status, 'refunded');
  assert.equal(property.status, 'available');
});

async function main() {
  let passed = 0;
  for (const current of tests) {
    try {
      await current.run();
      console.log(`PASS ${current.name}`);
      passed += 1;
    } catch (error) {
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
