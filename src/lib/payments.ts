import 'server-only';

import { addAuditLedgerEntry, advanceTransactionStage, data, initializeData } from './backend-data';
import { canAdvanceWorkflowAfterPayment, getPaymentWorkflowDirective } from './t3-autonomous-purchase';
import { generateEd25519KeyPair } from './t3-crypto';
import { t3VerifiableLedger } from './t3-ledger';
import { getStripeServerClient, isStripeDemoMode } from './stripe';
import {
  getPaymentPurposeLabel,
  getPaymentStatusLabel,
  type PaymentDashboardStats,
  type PaymentCreateIntentRequest,
  type PaymentCreateIntentResponse,
  type PaymentPurpose,
  type PaymentRecord,
  type PaymentSession,
  type PaymentStatus,
  type PaymentStatusResponse,
  type PaymentWorkflowSummary,
} from './payment-types';

const PAYMENT_SYSTEM_DID = 'did:t3:trustland:payments';
const PAYMENT_RATE_LIMIT_WINDOW_MS = 60_000;
const PAYMENT_RATE_LIMIT_MAX = 5;

type InternalPaymentRecord = PaymentRecord & {
  stripeClientSecret?: string | null;
};

type PaymentStore = {
  paymentsById: Map<string, InternalPaymentRecord>;
  paymentsByStripeIntentId: Map<string, string>;
  paymentsByTransactionPurposeKey: Map<string, string>;
  processedWebhookEventIds: Set<string>;
  processedWebhookEventPayments: Map<string, string>;
  rateLimitBuckets: Map<string, number[]>;
  paymentKeyPair: ReturnType<typeof generateEd25519KeyPair>;
};

export class TrustLandPaymentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'TrustLandPaymentError';
    this.statusCode = statusCode;
  }
}

const globalForPayments = globalThis as unknown as { __trustland_payment_store?: PaymentStore };

function createPaymentStore(): PaymentStore {
  return {
    paymentsById: new Map(),
    paymentsByStripeIntentId: new Map(),
    paymentsByTransactionPurposeKey: new Map(),
    processedWebhookEventIds: new Set(),
    processedWebhookEventPayments: new Map(),
    rateLimitBuckets: new Map(),
    paymentKeyPair: generateEd25519KeyPair(),
  };
}

const paymentStore = globalForPayments.__trustland_payment_store || createPaymentStore();
globalForPayments.__trustland_payment_store = paymentStore;

initializeData();

const CURRENCY_PRECISION: Record<string, number> = {
  USD: 2,
  KES: 2,
  EUR: 2,
  GBP: 2,
};

const PAYMENT_PURPOSE_TARGET_STAGE: Partial<Record<PaymentPurpose, string>> = {
  verification_fee: 'due_diligence',
  due_diligence_fee: 'legal_review',
  reservation_deposit: 'approval',
  escrow_funding: 'transfer',
  purchase_settlement: 'completed',
};

function getCurrencyPrecision(currency: string) {
  return CURRENCY_PRECISION[currency.toUpperCase()] ?? 2;
}

function roundCurrency(amount: number, currency: string) {
  const precision = getCurrencyPrecision(currency);
  const factor = 10 ** precision;
  return Math.round(amount * factor) / factor;
}

function toMinorUnits(amount: number, currency: string) {
  const precision = getCurrencyPrecision(currency);
  return Math.round(amount * 10 ** precision);
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: getCurrencyPrecision(currency),
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(getCurrencyPrecision(currency))}`;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function paymentTransactionKey(transactionId: string, parcelId: string, purpose: PaymentPurpose) {
  return `${transactionId}:${parcelId}:${purpose}`;
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === 'draft'
    || value === 'payment_pending'
    || value === 'processing'
    || value === 'paid'
    || value === 'failed'
    || value === 'cancelled'
    || value === 'refunded'
    || value === 'disputed';
}

function isPaymentPurpose(value: unknown): value is PaymentPurpose {
  return value === 'verification_fee'
    || value === 'due_diligence_fee'
    || value === 'reservation_deposit'
    || value === 'escrow_funding'
    || value === 'service_fee'
    || value === 'purchase_settlement';
}

function sanitizePaymentRecord(record: InternalPaymentRecord): PaymentRecord {
  const { stripeClientSecret: _stripeClientSecret, ...safe } = record;
  return { ...safe };
}

function getPropertyOrThrow(parcelId: string) {
  const property = data.properties.find((item) => item.id === parcelId);
  if (!property) {
    throw new TrustLandPaymentError('Parcel not found', 404);
  }
  return property;
}

function getWorkflowTransactionOrNull(workflowTransactionId?: string | null) {
  if (!workflowTransactionId) return null;
  return data.transactions.find((tx) => tx.id === workflowTransactionId) ?? null;
}

function isRoleAllowedForPurpose(role: PaymentSession['role'], purpose: PaymentPurpose) {
  if (role === 'admin') return true;
  if (role === 'buyer') {
    return purpose !== 'service_fee';
  }
  if (role === 'seller') {
    return purpose === 'service_fee';
  }
  return false;
}

function isSessionAllowedForProperty(session: PaymentSession, property: { ownerDid: string }) {
  if (session.role === 'admin') return true;
  if (session.role === 'seller') return property.ownerDid === session.userId;
  return true;
}

function parseSessionFromHeaders(headers: Headers): PaymentSession {
  const userId = headers.get('x-trustland-user-did')?.trim() || '';
  const role = headers.get('x-trustland-user-role')?.trim() || '';
  const displayName = headers.get('x-trustland-user-name')?.trim() || null;
  const kycStatus = headers.get('x-trustland-kyc-status')?.trim() || '';

  if (!userId) {
    throw new TrustLandPaymentError('Authentication required', 401);
  }
  if (!role || (role !== 'admin' && role !== 'buyer' && role !== 'seller')) {
    throw new TrustLandPaymentError('Invalid or missing dashboard role', 401);
  }
  if (kycStatus !== 'verified' && role !== 'admin') {
    throw new TrustLandPaymentError('KYC verification is required to create or access payments', 403);
  }

  return {
    userId,
    role,
    displayName,
    kycStatus: kycStatus === 'verified' || kycStatus === 'pending' || kycStatus === 'rejected' ? kycStatus : 'unverified',
  };
}

function rateLimitCreateIntent(session: PaymentSession, parcelId: string) {
  const key = `${session.userId}:${parcelId}`;
  const now = Date.now();
  const bucket = paymentStore.rateLimitBuckets.get(key) || [];
  const recent = bucket.filter((ts) => now - ts < PAYMENT_RATE_LIMIT_WINDOW_MS);

  if (recent.length >= PAYMENT_RATE_LIMIT_MAX) {
    throw new TrustLandPaymentError('Too many payment intent requests. Please wait a moment and retry.', 429);
  }

  recent.push(now);
  paymentStore.rateLimitBuckets.set(key, recent);
}

function deriveExpectedAmount(parcelId: string, purpose: PaymentPurpose, workflowTransactionId?: string | null) {
  const property = getPropertyOrThrow(parcelId);
  const basePrice = property.askingPrice;
  const paidReservations = Array.from(paymentStore.paymentsById.values()).filter(
    (payment) =>
      payment.parcelId === parcelId
      && payment.paymentPurpose === 'reservation_deposit'
      && payment.status === 'paid'
      && (!workflowTransactionId || payment.workflowTransactionId === workflowTransactionId)
  );
  const reservationTotal = paidReservations.reduce((sum, payment) => sum + payment.amount, 0);

  let amount: number;
  switch (purpose) {
    case 'verification_fee':
      amount = basePrice * 0.005;
      break;
    case 'due_diligence_fee':
      amount = basePrice * 0.01;
      break;
    case 'reservation_deposit':
      amount = basePrice * 0.1;
      break;
    case 'escrow_funding':
      amount = basePrice * 0.2;
      break;
    case 'service_fee':
      amount = basePrice * 0.025;
      break;
    case 'purchase_settlement':
      amount = Math.max(basePrice - reservationTotal, 0);
      break;
    default:
      amount = basePrice;
  }

  const normalized = roundCurrency(amount, property.currency);
  return {
    property,
    amount: normalized,
    currency: property.currency.toUpperCase(),
  };
}

function getTransactionStageMap() {
  return new Map([
    ['draft', 0],
    ['offer_submitted', 1],
    ['seller_review', 2],
    ['due_diligence', 3],
    ['legal_review', 4],
    ['financing', 5],
    ['approval', 6],
    ['transfer', 7],
    ['completed', 8],
  ]);
}

function buildPaymentWorkflowSummary(record: InternalPaymentRecord, propertyStatus: string, workflowTransactionStatus: string | null): PaymentWorkflowSummary {
  const directive = getPaymentWorkflowDirective(record.paymentPurpose);
  const paymentVerified = record.status === 'paid';
  const workflowStatus = record.workflowStatus || (
    paymentVerified
      ? propertyStatus === 'sold'
        ? 'settled'
        : propertyStatus === 'reserved'
          ? 'reserved'
          : directive.nextRequiredWorkflowStep || 'payment_verified'
      : 'payment_pending'
  );

  return {
    nextRequiredWorkflowStep: record.nextRequiredWorkflowStep || directive.nextRequiredWorkflowStep,
    workflowStatus: workflowTransactionStatus || workflowStatus,
    approvalRequired: directive.approvalRequired,
    reserveParcel: paymentVerified && directive.reserveParcel,
    advanceToSettlement: paymentVerified && directive.advanceToSettlement,
    ownershipTransferAllowed: paymentVerified && directive.ownershipTransferAllowed,
    paymentVerified,
  };
}

function createAuditAndLedgerEntry(record: InternalPaymentRecord, eventType: string, eventData: Record<string, unknown>, shouldPersistLedgerEntry = false) {
  addAuditLedgerEntry(PAYMENT_SYSTEM_DID, 'system', eventType, 'payment', record.id, {
    ...eventData,
    paymentId: record.id,
    transactionId: record.transactionId,
    parcelId: record.parcelId,
    payerUserId: record.payerUserId,
    paymentPurpose: record.paymentPurpose,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
  });

  if (!shouldPersistLedgerEntry) return null;

  const ledgerEntry = t3VerifiableLedger.addEntry(
    eventType,
    PAYMENT_SYSTEM_DID,
    {
      paymentId: record.id,
      transactionId: record.transactionId,
      parcelId: record.parcelId,
      payerUserId: record.payerUserId,
      paymentPurpose: record.paymentPurpose,
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      stripePaymentIntentId: record.stripePaymentIntentId,
    },
    paymentStore.paymentKeyPair.privateKeyBase64,
    paymentStore.paymentKeyPair.publicKeyBase64,
    record.payerUserId,
    record.transactionId,
    null,
    `payment_${record.id}`,
    ['payments:verify']
  );

  record.ledgerEntryId = ledgerEntry.id;
  return ledgerEntry;
}

function getPaymentInternalById(paymentId: string) {
  return paymentStore.paymentsById.get(paymentId) || null;
}

function getPaymentInternalByStripeIntentId(stripePaymentIntentId: string) {
  const paymentId = paymentStore.paymentsByStripeIntentId.get(stripePaymentIntentId);
  if (!paymentId) return null;
  return getPaymentInternalById(paymentId);
}

function storePayment(record: InternalPaymentRecord) {
  paymentStore.paymentsById.set(record.id, record);
  paymentStore.paymentsByTransactionPurposeKey.set(
    paymentTransactionKey(record.transactionId, record.parcelId, record.paymentPurpose),
    record.id
  );
  if (record.stripePaymentIntentId) {
    paymentStore.paymentsByStripeIntentId.set(record.stripePaymentIntentId, record.id);
  }
}

function getOrCreatePaymentRecord(
  session: PaymentSession,
  input: PaymentCreateIntentRequest,
  amount: number,
  currency: string
) {
  const transactionId = input.transactionId?.trim() || crypto.randomUUID();
  const lookupKey = paymentTransactionKey(transactionId, input.parcelId, input.paymentPurpose);
  const existingId = paymentStore.paymentsByTransactionPurposeKey.get(lookupKey);
  const existing = existingId ? paymentStore.paymentsById.get(existingId) || null : null;

  if (existing) {
    if (existing.payerUserId !== session.userId && session.role !== 'admin') {
      throw new TrustLandPaymentError('You do not have access to this payment transaction', 403);
    }

    return existing;
  }

  const record: InternalPaymentRecord = {
    id: crypto.randomUUID(),
    transactionId,
    parcelId: input.parcelId,
    payerUserId: session.userId,
    stripePaymentIntentId: null,
    amount,
    currency,
    paymentPurpose: input.paymentPurpose,
    status: 'payment_pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    paidAt: null,
    failureReason: null,
    receiptUrl: null,
    ledgerEntryId: null,
    workflowTransactionId: input.workflowTransactionId || null,
    workflowStatus: 'payment_pending',
    nextRequiredWorkflowStep: getPaymentWorkflowDirective(input.paymentPurpose).nextRequiredWorkflowStep,
    verifiedAt: null,
    demoMode: isStripeDemoMode(),
  };

  storePayment(record);
  return record;
}

function getWorkflowMutationStage(paymentPurpose: PaymentPurpose) {
  return PAYMENT_PURPOSE_TARGET_STAGE[paymentPurpose] || null;
}

function maybeAdvanceWorkflowTransaction(record: InternalPaymentRecord) {
  const workflowTransaction = getWorkflowTransactionOrNull(record.workflowTransactionId);
  if (!workflowTransaction) return;

  const targetStage = getWorkflowMutationStage(record.paymentPurpose);
  if (!targetStage) return;

  const stageMap = getTransactionStageMap();
  const currentIndex = stageMap.get(workflowTransaction.status) ?? -1;
  const targetIndex = stageMap.get(targetStage) ?? -1;
  if (currentIndex === -1 || targetIndex === -1) return;

  const directive = getPaymentWorkflowDirective(record.paymentPurpose);
  const hasVerifiedIdentity = true;
  const hasCompletedDueDiligence = currentIndex >= (stageMap.get('due_diligence') ?? 3);
  const hasLegalApproval = currentIndex >= (stageMap.get('legal_review') ?? 4);
  const hasEscrowFunding = currentIndex >= (stageMap.get('transfer') ?? 7);

  if (!canAdvanceWorkflowAfterPayment({
    paymentPurpose: record.paymentPurpose,
    hasVerifiedIdentity,
    hasCompletedDueDiligence,
    hasLegalApproval,
    hasEscrowFunding,
  })) {
    return;
  }

  if (currentIndex === targetIndex - 1) {
    const tx = advanceTransactionStage(workflowTransaction.id, record.payerUserId, `Payment verified for ${directive.nextRequiredWorkflowStep || record.paymentPurpose}`);
    if (tx && record.paymentPurpose === 'purchase_settlement' && tx.status === 'completed') {
      record.workflowStatus = 'settlement_verified';
    }
  }
}

function applyVerifiedPaymentEffects(record: InternalPaymentRecord) {
  const property = getPropertyOrThrow(record.parcelId);
  const workflowTransaction = getWorkflowTransactionOrNull(record.workflowTransactionId);
  const stageMap = getTransactionStageMap();
  const currentIndex = workflowTransaction ? (stageMap.get(workflowTransaction.status) ?? -1) : -1;
  const hasVerifiedIdentity = true;
  const hasCompletedDueDiligence = currentIndex >= (stageMap.get('due_diligence') ?? 3);
  const hasLegalApproval = currentIndex >= (stageMap.get('legal_review') ?? 4);
  const hasEscrowFunding = currentIndex >= (stageMap.get('transfer') ?? 7);

  const canAdvance = canAdvanceWorkflowAfterPayment({
    paymentPurpose: record.paymentPurpose,
    hasVerifiedIdentity,
    hasCompletedDueDiligence,
    hasLegalApproval,
    hasEscrowFunding,
  });

  if (record.paymentPurpose === 'verification_fee') {
    record.workflowStatus = canAdvance ? 'due_diligence_ready' : 'payment_verified';
  } else if (record.paymentPurpose === 'due_diligence_fee') {
    record.workflowStatus = canAdvance ? 'legal_review_ready' : 'payment_verified';
  } else if (record.paymentPurpose === 'reservation_deposit') {
    if (canAdvance) {
      property.status = 'reserved';
      record.workflowStatus = 'reserved';
    } else {
      record.workflowStatus = 'approval_pending';
    }
  } else if (record.paymentPurpose === 'escrow_funding') {
    record.workflowStatus = canAdvance ? 'escrow_recorded' : 'payment_verified';
  } else if (record.paymentPurpose === 'service_fee') {
    record.workflowStatus = 'fee_recorded';
  } else if (record.paymentPurpose === 'purchase_settlement') {
    if (canAdvance) {
      record.workflowStatus = 'settlement_verified';
    } else {
      record.workflowStatus = 'settlement_pending';
    }
  }

  if (workflowTransaction) {
    maybeAdvanceWorkflowTransaction(record);
  }
}

function markPaymentState(record: InternalPaymentRecord, status: PaymentStatus, details: Record<string, unknown> = {}) {
  record.status = status;
  record.updatedAt = nowIso();
  if (status === 'paid') {
    record.paidAt = nowIso();
    record.verifiedAt = record.paidAt;
    record.failureReason = null;
    record.receiptUrl = `/payments/${record.id}`;
  } else if (status === 'failed' || status === 'cancelled') {
    record.failureReason = typeof details.failureReason === 'string' ? details.failureReason : record.failureReason || 'Payment did not complete';
  } else if (status === 'refunded') {
    record.failureReason = typeof details.failureReason === 'string' ? details.failureReason : 'Payment refunded';
  } else if (status === 'disputed') {
    record.failureReason = typeof details.failureReason === 'string' ? details.failureReason : 'Payment disputed';
  }
}

function recordLifecycleEvent(record: InternalPaymentRecord, eventType: string, eventData: Record<string, unknown>, shouldAddLedgerEntry = false) {
  const ledgerEntry = createAuditAndLedgerEntry(record, eventType, eventData, shouldAddLedgerEntry);
  return ledgerEntry;
}

export function getPaymentSessionFromHeaders(headers: Headers) {
  return parseSessionFromHeaders(headers);
}

export function getPaymentRecord(paymentId: string, session?: PaymentSession): PaymentRecord | null {
  const record = getPaymentInternalById(paymentId);
  if (!record) return null;

  if (session && !canSessionAccessPayment(session, record)) {
    throw new TrustLandPaymentError('You do not have permission to access this payment', 403);
  }

  return sanitizePaymentRecord(record);
}

export function getPaymentStatusResponse(paymentId: string, session?: PaymentSession): PaymentStatusResponse {
  const record = getPaymentInternalById(paymentId);
  if (!record) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }

  if (session && !canSessionAccessPayment(session, record)) {
    throw new TrustLandPaymentError('You do not have permission to access this payment', 403);
  }

  const property = getPropertyOrThrow(record.parcelId);
  const workflowTransaction = getWorkflowTransactionOrNull(record.workflowTransactionId);
  const workflow = buildPaymentWorkflowSummary(record, property.status, workflowTransaction?.status ?? null);

  return {
    payment: sanitizePaymentRecord(record),
    demoMode: Boolean(record.demoMode),
    workflow,
    receiptUrl: record.receiptUrl,
  };
}

export function getPaymentReceiptViewModel(paymentId: string, session?: PaymentSession) {
  const payment = getPaymentRecord(paymentId, session);
  if (!payment) return null;

  const property = getPropertyOrThrow(payment.parcelId);
  const workflowTransaction = getWorkflowTransactionOrNull(payment.workflowTransactionId);
  const workflow = buildPaymentWorkflowSummary(payment as InternalPaymentRecord, property.status, workflowTransaction?.status ?? null);

  return {
    payment,
    property,
    workflow,
    paymentPurposeLabel: getPaymentPurposeLabel(payment.paymentPurpose),
    paymentStatusLabel: getPaymentStatusLabel(payment.status),
    formattedAmount: formatAmount(payment.amount, payment.currency),
  };
}

export function listPayments(session: PaymentSession) {
  return Array.from(paymentStore.paymentsById.values())
    .filter((payment) => canSessionAccessPayment(session, payment))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(sanitizePaymentRecord);
}

export function getPaymentDashboardStats(): PaymentDashboardStats {
  const payments = Array.from(paymentStore.paymentsById.values());
  const byStatus = payments.reduce<Record<PaymentStatus, number>>((acc, payment) => {
    acc[payment.status] += 1;
    return acc;
  }, {
    draft: 0,
    payment_pending: 0,
    processing: 0,
    paid: 0,
    failed: 0,
    cancelled: 0,
    refunded: 0,
    disputed: 0,
  });

  const byPurpose = payments.reduce<Record<PaymentPurpose, number>>((acc, payment) => {
    acc[payment.paymentPurpose] += 1;
    return acc;
  }, {
    verification_fee: 0,
    due_diligence_fee: 0,
    reservation_deposit: 0,
    escrow_funding: 0,
    service_fee: 0,
    purchase_settlement: 0,
  });

  const grossVolume = payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amount, 0);

  return {
    totalPayments: payments.length,
    byStatus,
    byPurpose,
    grossVolume,
    processingPayments: byStatus.processing,
    verifiedPayments: byStatus.paid,
    failedPayments: byStatus.failed,
    refundedPayments: byStatus.refunded,
    disputedPayments: byStatus.disputed,
  };
}

export function canSessionAccessPayment(session: PaymentSession, payment: InternalPaymentRecord) {
  if (session.role === 'admin') return true;
  if (payment.payerUserId === session.userId) return true;

  const property = data.properties.find((item) => item.id === payment.parcelId);
  if (session.role === 'seller' && property?.ownerDid === session.userId) {
    return true;
  }

  const workflowTransaction = getWorkflowTransactionOrNull(payment.workflowTransactionId);
  if (workflowTransaction) {
    return workflowTransaction.buyerDid === session.userId || workflowTransaction.sellerDid === session.userId;
  }

  return false;
}

export async function createPaymentIntentRecord(
  input: PaymentCreateIntentRequest,
  session: PaymentSession
): Promise<PaymentCreateIntentResponse> {
  if (!input.parcelId?.trim()) {
    throw new TrustLandPaymentError('Parcel ID is required', 400);
  }
  if (!isPaymentPurpose(input.paymentPurpose)) {
    throw new TrustLandPaymentError('Unsupported payment purpose', 400);
  }
  if (!isRoleAllowedForPurpose(session.role, input.paymentPurpose)) {
    throw new TrustLandPaymentError('Your role cannot create this payment purpose', 403);
  }

  rateLimitCreateIntent(session, input.parcelId);

  const { property, amount, currency } = deriveExpectedAmount(
    input.parcelId,
    input.paymentPurpose,
    input.workflowTransactionId
  );
  const workflowTransaction = getWorkflowTransactionOrNull(input.workflowTransactionId);

  const requestedCurrency = (input.currency || currency).toUpperCase();
  if (requestedCurrency !== currency.toUpperCase()) {
    throw new TrustLandPaymentError(`Currency mismatch. Expected ${currency}`, 400);
  }

  const requestedAmount = typeof input.amount === 'number' ? roundCurrency(input.amount, currency) : amount;
  if (requestedAmount !== amount) {
    throw new TrustLandPaymentError(`Amount mismatch. Expected ${formatAmount(amount, currency)}`, 400);
  }

  if (!isSessionAllowedForProperty(session, property)) {
    throw new TrustLandPaymentError('You are not allowed to create a payment for this parcel', 403);
  }

  if (workflowTransaction && workflowTransaction.buyerDid !== session.userId && session.role !== 'admin' && input.paymentPurpose !== 'service_fee') {
    throw new TrustLandPaymentError('You are not authorized to use this workflow transaction', 403);
  }

  const payment = getOrCreatePaymentRecord(session, input, amount, currency);
  payment.workflowTransactionId = input.workflowTransactionId || payment.workflowTransactionId || null;
  payment.nextRequiredWorkflowStep = getPaymentWorkflowDirective(input.paymentPurpose).nextRequiredWorkflowStep;
  payment.demoMode = isStripeDemoMode();
  payment.status = 'payment_pending';
  payment.updatedAt = nowIso();
  payment.failureReason = null;
  payment.receiptUrl = null;
  payment.paidAt = null;
  payment.verifiedAt = null;
  payment.workflowStatus = 'payment_pending';

  const idempotencyKey = `trustland:${payment.transactionId}:${payment.parcelId}:${payment.paymentPurpose}:${payment.amount}:${payment.currency}`;
  const safeMetadata = {
    trustlandTransactionId: payment.transactionId,
    parcelId: payment.parcelId,
    userId: payment.payerUserId,
    paymentPurpose: payment.paymentPurpose,
  };

  const stripe = getStripeServerClient();
  if (stripe && !payment.demoMode) {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: toMinorUnits(amount, currency),
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: safeMetadata,
      },
      {
        idempotencyKey,
      }
    );

    payment.stripePaymentIntentId = paymentIntent.id;
    payment.stripeClientSecret = paymentIntent.client_secret || null;
    payment.status = paymentIntent.status === 'processing' ? 'processing' : 'payment_pending';
    payment.updatedAt = nowIso();
    storePayment(payment);

    return {
      payment: sanitizePaymentRecord(payment),
      clientSecret: paymentIntent.client_secret || null,
      demoMode: false,
      displayAmount: formatAmount(amount, currency),
      workflow: buildPaymentWorkflowSummary(payment, property.status, workflowTransaction?.status ?? null),
      safeDisplay: {
        paymentReference: payment.transactionId,
        parcelId: payment.parcelId,
        parcelTitle: property.title,
        paymentPurposeLabel: getPaymentPurposeLabel(payment.paymentPurpose),
        currency: payment.currency,
        amount: payment.amount,
        nextRequiredWorkflowStep: payment.nextRequiredWorkflowStep || null,
      },
    };
  }

  payment.stripePaymentIntentId = `pi_demo_${payment.transactionId}`;
  payment.stripeClientSecret = null;
  payment.demoMode = true;
  storePayment(payment);

  return {
    payment: sanitizePaymentRecord(payment),
    clientSecret: null,
    demoMode: true,
    displayAmount: formatAmount(amount, currency),
    workflow: buildPaymentWorkflowSummary(payment, property.status, workflowTransaction?.status ?? null),
    safeDisplay: {
      paymentReference: payment.transactionId,
      parcelId: payment.parcelId,
      parcelTitle: property.title,
      paymentPurposeLabel: getPaymentPurposeLabel(payment.paymentPurpose),
      currency: payment.currency,
      amount: payment.amount,
      nextRequiredWorkflowStep: payment.nextRequiredWorkflowStep || null,
    },
  };
}

export function getPaymentByTransactionKey(transactionId: string, parcelId: string, purpose: PaymentPurpose) {
  const paymentId = paymentStore.paymentsByTransactionPurposeKey.get(paymentTransactionKey(transactionId, parcelId, purpose));
  if (!paymentId) return null;
  const payment = getPaymentInternalById(paymentId);
  return payment ? sanitizePaymentRecord(payment) : null;
}

export function listPaymentsForTransactionReference(transactionReference: string) {
  return Array.from(paymentStore.paymentsById.values())
    .filter((payment) => payment.transactionId === transactionReference || payment.workflowTransactionId === transactionReference)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(sanitizePaymentRecord);
}

export function markPaymentProcessing(paymentId: string, stripePaymentIntentId?: string | null) {
  const payment = getPaymentInternalById(paymentId);
  if (!payment) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  if (stripePaymentIntentId) {
    payment.stripePaymentIntentId = stripePaymentIntentId;
    paymentStore.paymentsByStripeIntentId.set(stripePaymentIntentId, payment.id);
  }
  payment.status = 'processing';
  payment.updatedAt = nowIso();
  storePayment(payment);
  return sanitizePaymentRecord(payment);
}

export function markPaymentFailed(paymentId: string, failureReason: string, details: Record<string, unknown> = {}) {
  const payment = getPaymentInternalById(paymentId);
  if (!payment) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  markPaymentState(payment, 'failed', { failureReason, ...details });
  recordLifecycleEvent(payment, 'payment_failed', { failureReason, ...details });
  storePayment(payment);
  return sanitizePaymentRecord(payment);
}

export function markPaymentCancelled(paymentId: string, reason: string, details: Record<string, unknown> = {}) {
  const payment = getPaymentInternalById(paymentId);
  if (!payment) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  markPaymentState(payment, 'cancelled', { failureReason: reason, ...details });
  recordLifecycleEvent(payment, 'payment_cancelled', { reason, ...details });
  storePayment(payment);
  return sanitizePaymentRecord(payment);
}

export function markPaymentRefunded(paymentId: string, details: Record<string, unknown> = {}) {
  const payment = getPaymentInternalById(paymentId);
  if (!payment) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  markPaymentState(payment, 'refunded', { failureReason: typeof details.failureReason === 'string' ? details.failureReason : 'Payment refunded' });
  const property = data.properties.find((item) => item.id === payment.parcelId);
  if (property && property.status === 'reserved' && payment.paymentPurpose === 'reservation_deposit') {
    property.status = 'available';
  }
  recordLifecycleEvent(payment, 'payment_refunded', details);
  storePayment(payment);
  return sanitizePaymentRecord(payment);
}

export function markPaymentDisputed(paymentId: string, details: Record<string, unknown> = {}) {
  const payment = getPaymentInternalById(paymentId);
  if (!payment) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  markPaymentState(payment, 'disputed', { failureReason: typeof details.failureReason === 'string' ? details.failureReason : 'Payment disputed' });
  recordLifecycleEvent(payment, 'payment_disputed', details);
  storePayment(payment);
  return sanitizePaymentRecord(payment);
}

function resolveStripePaymentIntentIdFromEvent(event: { type: string; data: { object: unknown } }) {
  const payload = event.data.object as Record<string, unknown> & {
    payment_intent?: string | { id?: string };
    charge?: string | { id?: string; payment_intent?: string | { id?: string } };
    id?: string;
  };

  if (typeof payload.payment_intent === 'string') return payload.payment_intent;
  if (payload.payment_intent && typeof payload.payment_intent === 'object' && typeof payload.payment_intent.id === 'string') {
    return payload.payment_intent.id;
  }
  if (typeof payload.charge === 'string') return payload.charge;
  if (payload.charge && typeof payload.charge === 'object') {
    if (typeof payload.charge.payment_intent === 'string') return payload.charge.payment_intent;
    if (payload.charge.payment_intent && typeof payload.charge.payment_intent === 'object' && typeof payload.charge.payment_intent.id === 'string') {
      return payload.charge.payment_intent.id;
    }
    if (typeof payload.charge.id === 'string') return payload.charge.id;
  }
  if (typeof payload.id === 'string') return payload.id;
  return null;
}

async function resolveStripeChargePaymentIntentId(stripePaymentIntentId: string) {
  const stripe = getStripeServerClient();
  if (!stripe) return null;
  try {
    const charge = await stripe.charges.retrieve(stripePaymentIntentId);
    if (typeof charge.payment_intent === 'string') return charge.payment_intent;
    if (charge.payment_intent && typeof charge.payment_intent === 'object' && typeof charge.payment_intent.id === 'string') {
      return charge.payment_intent.id;
    }
    return null;
  } catch {
    return null;
  }
}

async function resolvePaymentFromWebhookEvent(event: { type: string; data: { object: unknown } }) {
  let stripePaymentIntentId = resolveStripePaymentIntentIdFromEvent(event);
  if (event.type.startsWith('charge.') && stripePaymentIntentId) {
    const maybePaymentIntentId = await resolveStripeChargePaymentIntentId(stripePaymentIntentId);
    stripePaymentIntentId = maybePaymentIntentId || stripePaymentIntentId;
  }

  const payload = event.data.object as Record<string, unknown> & {
    metadata?: Record<string, string>;
  };

  const metadata = payload.metadata || {};
  const transactionId = metadata.trustlandTransactionId || metadata.transactionId || metadata.trustland_transaction_id;
  const parcelId = metadata.parcelId;
  const paymentPurpose = metadata.paymentPurpose;

  const recordFromMetadata = paymentStore.paymentsByTransactionPurposeKey.get(
    transactionId && parcelId && paymentPurpose && isPaymentPurpose(paymentPurpose)
      ? paymentTransactionKey(transactionId, parcelId, paymentPurpose)
      : ''
  );
  const recordFromStripe = stripePaymentIntentId ? paymentStore.paymentsByStripeIntentId.get(stripePaymentIntentId) : undefined;
  const paymentId = recordFromStripe || recordFromMetadata;
  if (!paymentId) return null;

  return paymentStore.paymentsById.get(paymentId) || null;
}

export async function processStripeWebhookEvent(event: { id: string; type: string; data: { object: unknown } }) {
  if (paymentStore.processedWebhookEventIds.has(event.id)) {
    const paymentId = paymentStore.processedWebhookEventPayments.get(event.id);
    const duplicateRecord = paymentId ? paymentStore.paymentsById.get(paymentId) || null : await resolvePaymentFromWebhookEvent(event);
    return {
      duplicate: true,
      payment: duplicateRecord ? sanitizePaymentRecord(duplicateRecord) : null,
    };
  }

  const payload = event.data.object as Record<string, unknown> & {
    metadata?: Record<string, string>;
    amount?: number;
    currency?: string;
    status?: string;
    last_payment_error?: { message?: string };
    cancellation_reason?: string;
    receipt_url?: string | null;
    livemode?: boolean;
  };

  let stripePaymentIntentId = resolveStripePaymentIntentIdFromEvent(event);
  if (event.type.startsWith('charge.') && stripePaymentIntentId) {
    const maybePaymentIntentId = await resolveStripeChargePaymentIntentId(stripePaymentIntentId);
    stripePaymentIntentId = maybePaymentIntentId || stripePaymentIntentId;
  }

  const metadata = payload.metadata || {};
  const transactionId = metadata.trustlandTransactionId || metadata.transactionId || metadata.trustland_transaction_id;
  const parcelId = metadata.parcelId;
  const paymentPurpose = metadata.paymentPurpose;

  const recordFromMetadata = paymentStore.paymentsByTransactionPurposeKey.get(
    transactionId && parcelId && paymentPurpose && isPaymentPurpose(paymentPurpose)
      ? paymentTransactionKey(transactionId, parcelId, paymentPurpose)
      : ''
  );
  const recordFromStripe = stripePaymentIntentId ? paymentStore.paymentsByStripeIntentId.get(stripePaymentIntentId) : undefined;
  const paymentId = recordFromStripe || recordFromMetadata;
  if (!paymentId) {
    paymentStore.processedWebhookEventIds.add(event.id);
    return {
      duplicate: false,
      payment: null as PaymentRecord | null,
    };
  }

  const record = paymentStore.paymentsById.get(paymentId);
  if (!record) {
    paymentStore.processedWebhookEventIds.add(event.id);
    return {
      duplicate: false,
      payment: null as PaymentRecord | null,
    };
  }

  paymentStore.processedWebhookEventPayments.set(event.id, paymentId);

  const property = getPropertyOrThrow(record.parcelId);
  const expected = deriveExpectedAmount(record.parcelId, record.paymentPurpose, record.workflowTransactionId || undefined);
  const amountMatches = typeof payload.amount === 'number'
    ? toMinorUnits(expected.amount, expected.currency) === payload.amount
    : true;
  const currencyMatches = typeof payload.currency === 'string'
    ? payload.currency.toUpperCase() === expected.currency.toUpperCase()
    : true;

  if (!amountMatches || !currencyMatches) {
    markPaymentFailed(record.id, 'Stripe metadata validation failed', {
      eventId: event.id,
      stripePaymentIntentId,
      reason: 'Amount or currency mismatch',
    });
    paymentStore.processedWebhookEventIds.add(event.id);
    return {
      duplicate: false,
      payment: sanitizePaymentRecord(record),
    };
  }

  const safeEventBase = {
    eventId: event.id,
    stripePaymentIntentId,
    paymentPurpose: record.paymentPurpose,
    parcelId: record.parcelId,
    transactionId: record.transactionId,
  };

  switch (event.type) {
    case 'payment_intent.processing':
      markPaymentProcessing(record.id, stripePaymentIntentId);
      recordLifecycleEvent(record, 'payment_processing', safeEventBase);
      break;
    case 'payment_intent.succeeded':
      record.stripePaymentIntentId = stripePaymentIntentId || record.stripePaymentIntentId;
      record.status = 'paid';
      record.updatedAt = nowIso();
      record.paidAt = nowIso();
      record.verifiedAt = record.paidAt;
      record.failureReason = null;
      record.receiptUrl = `/payments/${record.id}`;
      record.workflowStatus = 'payment_verified';
      record.nextRequiredWorkflowStep = getPaymentWorkflowDirective(record.paymentPurpose).nextRequiredWorkflowStep;
      applyVerifiedPaymentEffects(record);
      recordLifecycleEvent(record, 'payment_verified', {
        ...safeEventBase,
        amount: expected.amount,
        currency: expected.currency,
        safeMetadata: metadata,
      }, true);
      break;
    case 'payment_intent.payment_failed':
      markPaymentFailed(record.id, payload.last_payment_error?.message || 'Stripe reported a failed payment', safeEventBase);
      break;
    case 'payment_intent.canceled':
      markPaymentCancelled(record.id, payload.cancellation_reason || 'Stripe cancelled the payment intent', safeEventBase);
      break;
    case 'charge.refunded':
      markPaymentRefunded(record.id, safeEventBase);
      break;
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
      markPaymentDisputed(record.id, safeEventBase);
      break;
    default:
      recordLifecycleEvent(record, `payment_webhook_${event.type.replace(/\./g, '_')}`, safeEventBase);
      break;
  }

  if (record.stripePaymentIntentId) {
    paymentStore.paymentsByStripeIntentId.set(record.stripePaymentIntentId, record.id);
  }
  storePayment(record);
  paymentStore.processedWebhookEventIds.add(event.id);

  return {
    duplicate: false,
    payment: sanitizePaymentRecord(record),
  };
}

export async function handleDemoPaymentConfirmation(paymentId: string, session: PaymentSession) {
  const record = paymentStore.paymentsById.get(paymentId);
  if (!record) {
    throw new TrustLandPaymentError('Payment not found', 404);
  }
  if (!canSessionAccessPayment(session, record)) {
    throw new TrustLandPaymentError('You do not have permission to confirm this payment', 403);
  }
  if (!record.demoMode) {
    throw new TrustLandPaymentError('Demo confirmation is only available when Stripe keys are not configured', 400);
  }

  record.status = 'processing';
  record.updatedAt = nowIso();
  recordLifecycleEvent(record, 'payment_processing', { source: 'demo' });

  record.status = 'paid';
  record.paidAt = nowIso();
  record.verifiedAt = record.paidAt;
  record.failureReason = null;
  record.receiptUrl = `/payments/${record.id}`;
  record.workflowStatus = 'payment_verified';
  applyVerifiedPaymentEffects(record);
  recordLifecycleEvent(record, 'payment_verified', {
    source: 'demo',
    paymentId: record.id,
    transactionId: record.transactionId,
    parcelId: record.parcelId,
  }, true);

  storePayment(record);
  return sanitizePaymentRecord(record);
}

export function getPaymentRecordByStripeIntentId(stripePaymentIntentId: string) {
  const record = getPaymentInternalByStripeIntentId(stripePaymentIntentId);
  return record ? sanitizePaymentRecord(record) : null;
}

export function getPaymentRecordByPaymentTransaction(transactionId: string, parcelId: string, purpose: PaymentPurpose) {
  const paymentId = paymentStore.paymentsByTransactionPurposeKey.get(paymentTransactionKey(transactionId, parcelId, purpose));
  if (!paymentId) return null;
  const record = paymentStore.paymentsById.get(paymentId);
  return record ? sanitizePaymentRecord(record) : null;
}

export function getSafePaymentSummary(paymentId: string, session?: PaymentSession) {
  const record = getPaymentInternalById(paymentId);
  if (!record) return null;
  if (session && !canSessionAccessPayment(session, record)) {
    throw new TrustLandPaymentError('You do not have permission to access this payment', 403);
  }
  const property = getPropertyOrThrow(record.parcelId);
  const workflowTransaction = getWorkflowTransactionOrNull(record.workflowTransactionId);
  return {
    payment: sanitizePaymentRecord(record),
    safeDisplay: {
      paymentReference: record.transactionId,
      parcelId: record.parcelId,
      parcelTitle: property.title,
      paymentPurposeLabel: getPaymentPurposeLabel(record.paymentPurpose),
      currency: record.currency,
      amount: record.amount,
      nextRequiredWorkflowStep: record.nextRequiredWorkflowStep || getPaymentWorkflowDirective(record.paymentPurpose).nextRequiredWorkflowStep,
    },
    workflow: buildPaymentWorkflowSummary(record, property.status, workflowTransaction?.status ?? null),
    displayAmount: formatAmount(record.amount, record.currency),
  };
}

export function isValidPaymentStatus(value: unknown) {
  return isPaymentStatus(value);
}

export function isValidPaymentPurpose(value: unknown) {
  return isPaymentPurpose(value);
}
