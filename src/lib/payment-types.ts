import type { DashboardRole, KycStatus } from './trustland-access';

export type PaymentStatus =
  | 'draft'
  | 'payment_pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

export type PaymentPurpose =
  | 'verification_fee'
  | 'due_diligence_fee'
  | 'reservation_deposit'
  | 'escrow_funding'
  | 'service_fee'
  | 'purchase_settlement';

export interface PaymentSession {
  userId: string;
  role: DashboardRole;
  displayName: string | null;
  kycStatus: KycStatus;
}

export interface PaymentRecord {
  id: string;
  transactionId: string;
  parcelId: string;
  payerUserId: string;
  stripePaymentIntentId: string | null;
  amount: number;
  currency: string;
  paymentPurpose: PaymentPurpose;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  failureReason: string | null;
  receiptUrl: string | null;
  ledgerEntryId: string | null;
  workflowTransactionId?: string | null;
  workflowStatus?: string | null;
  nextRequiredWorkflowStep?: string | null;
  verifiedAt?: string | null;
  demoMode?: boolean;
}

export interface PaymentWorkflowSummary {
  nextRequiredWorkflowStep: string | null;
  workflowStatus: string;
  approvalRequired: boolean;
  reserveParcel: boolean;
  advanceToSettlement: boolean;
  ownershipTransferAllowed: boolean;
  paymentVerified: boolean;
}

export interface PaymentCreateIntentRequest {
  transactionId?: string;
  workflowTransactionId?: string;
  parcelId: string;
  paymentPurpose: PaymentPurpose;
  amount?: number;
  currency?: string;
}

export interface PaymentCreateIntentResponse {
  payment: PaymentRecord;
  clientSecret: string | null;
  demoMode: boolean;
  displayAmount: string;
  workflow: PaymentWorkflowSummary;
  safeDisplay: {
    paymentReference: string;
    parcelId: string;
    parcelTitle: string;
    paymentPurposeLabel: string;
    currency: string;
    amount: number;
    nextRequiredWorkflowStep: string | null;
  };
}

export interface PaymentStatusResponse {
  payment: PaymentRecord;
  demoMode: boolean;
  workflow: PaymentWorkflowSummary;
  receiptUrl: string | null;
}

export interface PaymentDashboardStats {
  totalPayments: number;
  byStatus: Record<PaymentStatus, number>;
  byPurpose: Record<PaymentPurpose, number>;
  grossVolume: number;
  processingPayments: number;
  verifiedPayments: number;
  failedPayments: number;
  refundedPayments: number;
  disputedPayments: number;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  draft: 'Draft',
  payment_pending: 'Awaiting payment',
  processing: 'Payment processing',
  paid: 'Payment verified',
  failed: 'Payment failed',
  cancelled: 'Payment cancelled',
  refunded: 'Payment refunded',
  disputed: 'Payment disputed',
};

export const PAYMENT_STATUS_BADGE_STYLES: Record<PaymentStatus, string> = {
  draft: 'border-white/20 text-white/70 bg-white/5',
  payment_pending: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
  processing: 'border-sky-500/40 text-sky-200 bg-sky-500/10',
  paid: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10',
  failed: 'border-red-500/40 text-red-200 bg-red-500/10',
  cancelled: 'border-white/20 text-white/70 bg-white/5',
  refunded: 'border-violet-500/40 text-violet-200 bg-violet-500/10',
  disputed: 'border-orange-500/40 text-orange-200 bg-orange-500/10',
};

export const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  verification_fee: 'Verification fee',
  due_diligence_fee: 'Due diligence fee',
  reservation_deposit: 'Reservation deposit',
  escrow_funding: 'Escrow funding',
  service_fee: 'Service fee',
  purchase_settlement: 'Purchase settlement',
};

export const PAYMENT_PURPOSE_DESCRIPTIONS: Record<PaymentPurpose, string> = {
  verification_fee: 'Covers initial property verification and identity checks.',
  due_diligence_fee: 'Funds deeper review, documentation, and legal checks.',
  reservation_deposit: 'Reserves the selected parcel while the workflow continues.',
  escrow_funding: 'Funds the escrow step without releasing proceeds.',
  service_fee: 'Platform or seller service fee tracked in the finance ledger.',
  purchase_settlement: 'Final approved settlement step after all conditions pass.',
};

export function isTerminalPaymentStatus(status: PaymentStatus) {
  return status === 'paid' || status === 'failed' || status === 'cancelled' || status === 'refunded' || status === 'disputed';
}

export function getPaymentStatusLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_LABELS[status];
}

export function getPaymentPurposeLabel(purpose: PaymentPurpose) {
  return PAYMENT_PURPOSE_LABELS[purpose];
}
