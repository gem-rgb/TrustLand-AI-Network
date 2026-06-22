'use client';

import React from 'react';
import { ArrowRight, ReceiptText, ShieldCheck, Landmark } from 'lucide-react';

import PaymentCheckout from '@/components/trustland/PaymentCheckout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useTrustLandStore } from '@/lib/store';
import {
  PAYMENT_PURPOSE_DESCRIPTIONS,
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUS_BADGE_STYLES,
  PAYMENT_STATUS_LABELS,
  type PaymentPurpose,
} from '@/lib/payment-types';

type TransactionPaymentViewProps = {
  parcelId: string;
  transactionId?: string | null;
  workflowTransactionId?: string | null;
  defaultPaymentPurpose?: PaymentPurpose;
  className?: string;
  onVerified?: () => void;
};

const PAYMENT_PURPOSE_OPTIONS: PaymentPurpose[] = [
  'verification_fee',
  'due_diligence_fee',
  'reservation_deposit',
  'escrow_funding',
  'service_fee',
  'purchase_settlement',
];

export default function TransactionPaymentView({
  parcelId,
  transactionId,
  workflowTransactionId,
  defaultPaymentPurpose = 'reservation_deposit',
  className,
  onVerified,
}: TransactionPaymentViewProps) {
  const { properties, transactions, payments, selectedPaymentStatus } = useTrustLandStore();
  const [paymentPurpose, setPaymentPurpose] = React.useState<PaymentPurpose>(defaultPaymentPurpose);

  const property = properties.find((item) => item.id === parcelId) || null;
  const workflowTransaction = workflowTransactionId
    ? transactions.find((item) => item.id === workflowTransactionId) || null
    : transactionId
      ? transactions.find((item) => item.id === transactionId) || null
      : null;

  const latestPayment = payments
    .filter((payment) => payment.parcelId === parcelId && payment.paymentPurpose === paymentPurpose)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
    || (selectedPaymentStatus?.payment?.parcelId === parcelId ? selectedPaymentStatus.payment : null);

  const workflowLabel = workflowTransaction?.status
    ? workflowTransaction.status.replace(/_/g, ' ')
    : property?.status || 'pending';

  return (
    <Card className={cn('overflow-hidden border-white/10 bg-[#081a38] text-white shadow-2xl shadow-orange-950/20', className)}>
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-[#0c2350] to-[#102e63]">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg text-white">Purchase payment step</CardTitle>
          <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-[10px] uppercase tracking-[0.2em]">
            <ShieldCheck className="mr-1 h-3 w-3" /> Auth required
          </Badge>
        </div>
        <CardDescription className="text-white/60">
          Payment stays inside the purchase workflow until the server verifies Stripe or demo mode confirms the local flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Parcel</p>
            <p className="mt-1 text-sm font-medium text-white">{property?.title || 'Selected parcel'}</p>
            <p className="mt-1 text-xs text-white/50">
              {property?.address || 'Parcel details will be pulled from TrustLand property data.'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Workflow status</p>
            <p className="mt-1 text-sm font-medium text-white">{workflowLabel}</p>
            <p className="mt-1 text-xs text-white/50">Transaction reference {transactionId || workflowTransactionId || 'generated on demand'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <Label className="text-xs uppercase tracking-[0.2em] text-white/40">Payment purpose</Label>
          <Select value={paymentPurpose} onValueChange={(value) => setPaymentPurpose(value as PaymentPurpose)}>
            <SelectTrigger className="mt-2 border-white/10 bg-[#06122e] text-white">
              <SelectValue placeholder="Choose a payment purpose" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#06122e] text-white">
              {PAYMENT_PURPOSE_OPTIONS.map((purpose) => (
                <SelectItem key={purpose} value={purpose}>
                  {PAYMENT_PURPOSE_LABELS[purpose]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-sm text-white/60">{PAYMENT_PURPOSE_DESCRIPTIONS[paymentPurpose]}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Payment reference</p>
            <p className="mt-1 font-mono text-sm text-white">{latestPayment?.transactionId || transactionId || 'Will be issued by TrustLand'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ledger reference</p>
            <p className="mt-1 text-sm text-white">{latestPayment?.ledgerEntryId || 'Pending verification'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Payment status</p>
            <p className="mt-1 text-sm text-white">{latestPayment ? PAYMENT_STATUS_LABELS[latestPayment.status] : 'Awaiting payment'}</p>
          </div>
        </div>

        {latestPayment && (
          <div className="rounded-2xl border border-white/10 bg-[#06122e] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={cn('border text-[10px] uppercase tracking-[0.2em]', PAYMENT_STATUS_BADGE_STYLES[latestPayment.status])}>
                {PAYMENT_STATUS_LABELS[latestPayment.status]}
              </Badge>
              <span className="text-xs text-white/50">
                Verified at {latestPayment.verifiedAt || latestPayment.paidAt || 'pending'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Amount</p>
                <p className="mt-1 text-sm text-white">
                  {latestPayment.currency} {latestPayment.amount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Next workflow step</p>
                <p className="mt-1 text-sm text-white">{latestPayment.nextRequiredWorkflowStep || 'Pending verification'}</p>
              </div>
            </div>
          </div>
        )}

        <Separator className="bg-white/10" />

        <PaymentCheckout
          parcelId={parcelId}
          parcelTitle={property?.title || 'Selected parcel'}
          paymentPurpose={paymentPurpose}
          transactionId={transactionId || workflowTransactionId || null}
          workflowTransactionId={workflowTransactionId || transactionId || null}
          description="Stripe Payment Element is rendered directly in this step. The TrustLand server verifies the payment before the workflow advances."
          onVerified={() => {
            onVerified?.();
          }}
        />

        <div className="flex items-center gap-2 text-xs text-white/50">
          <ReceiptText className="h-3.5 w-3.5" />
          <span>Receipt and ledger confirmation appear only after the server processes a verified payment event.</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span>Ownership transfer still waits for the workflow rules to complete.</span>
        </div>
      </CardContent>
    </Card>
  );
}
