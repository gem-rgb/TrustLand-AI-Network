export const PAYMENT_STATUS_LABELS = {
    draft: 'Draft',
    payment_pending: 'Awaiting payment',
    processing: 'Payment processing',
    paid: 'Payment verified',
    failed: 'Payment failed',
    cancelled: 'Payment cancelled',
    refunded: 'Payment refunded',
    disputed: 'Payment disputed',
};
export const PAYMENT_STATUS_BADGE_STYLES = {
    draft: 'border-white/20 text-white/70 bg-white/5',
    payment_pending: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
    processing: 'border-sky-500/40 text-sky-200 bg-sky-500/10',
    paid: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10',
    failed: 'border-red-500/40 text-red-200 bg-red-500/10',
    cancelled: 'border-white/20 text-white/70 bg-white/5',
    refunded: 'border-violet-500/40 text-violet-200 bg-violet-500/10',
    disputed: 'border-orange-500/40 text-orange-200 bg-orange-500/10',
};
export const PAYMENT_PURPOSE_LABELS = {
    verification_fee: 'Verification fee',
    due_diligence_fee: 'Due diligence fee',
    reservation_deposit: 'Reservation deposit',
    escrow_funding: 'Escrow funding',
    service_fee: 'Service fee',
    purchase_settlement: 'Purchase settlement',
};
export const PAYMENT_PURPOSE_DESCRIPTIONS = {
    verification_fee: 'Covers initial property verification and identity checks.',
    due_diligence_fee: 'Funds deeper review, documentation, and legal checks.',
    reservation_deposit: 'Reserves the selected parcel while the workflow continues.',
    escrow_funding: 'Funds the escrow step without releasing proceeds.',
    service_fee: 'Platform or seller service fee tracked in the finance ledger.',
    purchase_settlement: 'Final approved settlement step after all conditions pass.',
};
export function isTerminalPaymentStatus(status) {
    return status === 'paid' || status === 'failed' || status === 'cancelled' || status === 'refunded' || status === 'disputed';
}
export function getPaymentStatusLabel(status) {
    return PAYMENT_STATUS_LABELS[status];
}
export function getPaymentPurposeLabel(purpose) {
    return PAYMENT_PURPOSE_LABELS[purpose];
}
