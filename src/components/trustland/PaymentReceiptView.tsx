'use client';

import React from 'react';
import { CheckCircle2, FileText, Landmark, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useTrustLandStore } from '@/lib/store';
import {
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUS_BADGE_STYLES,
  PAYMENT_STATUS_LABELS,
} from '@/lib/payment-types';

type PaymentReceiptViewProps = {
  paymentId: string;
};

export default function PaymentReceiptView({ paymentId }: PaymentReceiptViewProps) {
  const { fetchPaymentStatus, selectedPaymentStatus, setCurrentView, dashboardRole } = useTrustLandStore();
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await fetchPaymentStatus(paymentId);
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load payment receipt');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [fetchPaymentStatus, paymentId]);

  const status = selectedPaymentStatus?.payment ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a1f44] text-white p-6">
        <Card className="mx-auto max-w-3xl border-white/10 bg-[#081a38] text-white">
          <CardHeader>
            <CardTitle className="text-white">Loading receipt</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
            Verifying the payment record with TrustLand...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-[#0a1f44] text-white p-6">
        <Card className="mx-auto max-w-3xl border-red-500/30 bg-red-500/10 text-white">
          <CardHeader>
            <CardTitle className="text-white">Receipt unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-red-100/80">{error || 'The payment could not be found.'}</p>
            <Button
              onClick={() => setCurrentView(dashboardRole === 'buyer' ? 'autonomous-purchase' : 'dashboard')}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
            >
              Back to app
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusStyle = PAYMENT_STATUS_BADGE_STYLES[status.status];

  return (
    <div className="min-h-screen bg-[#0a1f44] text-white p-6">
      <Card className="mx-auto max-w-4xl overflow-hidden border-white/10 bg-[#081a38] text-white shadow-2xl shadow-orange-950/20">
        <CardHeader className="border-b border-white/10 bg-gradient-to-r from-[#0c2350] to-[#102e63]">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl text-white">Verified payment receipt</CardTitle>
            <Badge className={cn('border text-[10px] uppercase tracking-[0.2em]', statusStyle)}>
              {PAYMENT_STATUS_LABELS[status.status]}
            </Badge>
          </div>
          <p className="text-sm text-white/60">Server verified payment and ledger confirmation for TrustLand.</p>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Payment reference</p>
              <p className="mt-1 font-mono text-sm text-white">{status.id}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Transaction ID</p>
              <p className="mt-1 font-mono text-sm text-white">{status.transactionId}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Purpose</p>
              <p className="mt-1 text-sm text-white">{PAYMENT_PURPOSE_LABELS[status.paymentPurpose]}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Amount</p>
              <p className="mt-1 text-sm text-white">{status.currency} {status.amount.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Verified timestamp</p>
              <p className="mt-1 text-sm text-white">{status.verifiedAt || status.paidAt || 'Pending'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ledger entry</p>
              <p className="mt-1 text-sm text-white">{status.ledgerEntryId || 'Pending'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Workflow</p>
              <p className="mt-1 text-sm text-white">{status.workflowStatus || 'payment_verified'}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#06122e] p-4">
            <div className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Payment verified by TrustLand server</span>
            </div>
            <p className="mt-2 text-sm text-white/60">
              The browser never handled raw card data. Stripe processed the secure card form, and TrustLand accepted the payment only after webhook verification.
            </p>
          </div>

          <Separator className="bg-white/10" />

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setCurrentView(dashboardRole === 'buyer' ? 'autonomous-purchase' : dashboardRole === 'seller' ? 'withdrawals' : 'finance')}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
            >
              <Landmark className="mr-2 h-4 w-4" />
              Return to workflow
            </Button>
            {status.receiptUrl && (
              <a href={status.receiptUrl} className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10">
                <FileText className="mr-2 h-4 w-4" />
                Open raw receipt link
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
