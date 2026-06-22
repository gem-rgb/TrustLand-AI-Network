'use client';

import React from 'react';
import { Banknote, RefreshCw, ReceiptText, ShieldCheck } from 'lucide-react';

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

export default function FinanceDashboardView() {
  const { fetchPayments, payments, paymentDashboardStats, setCurrentView } = useTrustLandStore();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  React.useEffect(() => {
    fetchPayments().catch((error) => {
      console.error('Failed to load finance payments:', error);
    });
  }, [fetchPayments]);

  const refreshPayments = async () => {
    setIsRefreshing(true);
    try {
      await fetchPayments();
    } finally {
      setIsRefreshing(false);
    }
  };

  const sortedPayments = [...payments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (!paymentDashboardStats) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#112c4d] via-[#0c2350] to-[#081a38] p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-orange-300" />
            Finance tracking
          </h1>
          <p className="mt-2 text-white/60">Loading verified payment records and ledger-linked finance events.</p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Total payments', value: paymentDashboardStats.totalPayments, accent: 'from-blue-500 to-indigo-500' },
    { label: 'Verified', value: paymentDashboardStats.verifiedPayments, accent: 'from-emerald-500 to-teal-500' },
    { label: 'Processing', value: paymentDashboardStats.processingPayments, accent: 'from-sky-500 to-cyan-500' },
    { label: 'Disputed', value: paymentDashboardStats.disputedPayments, accent: 'from-orange-500 to-red-500' },
  ];

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#112c4d] via-[#0c2350] to-[#081a38] p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/30">
                <ShieldCheck className="h-3 w-3 mr-1" /> Admin finance
              </Badge>
              <Badge className="bg-white/5 text-white/70 border border-white/10">
                Stripe verified
              </Badge>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight">Financial control center</h1>
            <p className="mt-3 text-white/70 max-w-xl">
              Monitor payment intents, webhook verification, receipts, and ledger-linked finance events without exposing raw card data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={refreshPayments} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10">
              <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button onClick={() => setCurrentView('autonomous-purchase')} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
              <ReceiptText className="h-4 w-4 mr-2" />
              Open purchase flow
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((card) => (
          <div key={card.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className={cn('absolute -top-8 -right-8 h-20 w-20 rounded-full bg-gradient-to-br opacity-20 blur-xl', card.accent)} />
            <div className="relative">
              <p className="text-xs text-white/60">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">Recent verified payments</h3>
            <p className="text-sm text-white/60">Only server-verified payments are shown here.</p>
          </div>
        </div>

        <div className="space-y-3">
          {sortedPayments.length > 0 ? sortedPayments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-white/10 bg-[#0c2350]/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{PAYMENT_PURPOSE_LABELS[payment.paymentPurpose]}</p>
                    <Badge className={cn('border text-[10px] uppercase tracking-[0.2em]', PAYMENT_STATUS_BADGE_STYLES[payment.status])}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-white/60">
                    Parcel <span className="font-mono text-white">{payment.parcelId}</span> · Transaction{' '}
                    <span className="font-mono text-white">{payment.transactionId}</span>
                  </p>
                  <p className="text-xs text-white/50">
                    Workflow {payment.workflowStatus || 'payment_pending'} · Ledger {payment.ledgerEntryId || 'pending'} · Verified {payment.verifiedAt || 'pending'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-orange-300">{payment.currency} {payment.amount.toLocaleString()}</p>
                  <p className="text-xs text-white/50">{new Date(payment.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
              No verified payments are available yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <h3 className="text-lg font-semibold mb-3">Finance summary</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#0c2350]/70 p-4">
            <p className="text-xs text-white/50">Gross volume</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {paymentDashboardStats.grossVolume.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0c2350]/70 p-4">
            <p className="text-xs text-white/50">Refunded</p>
            <p className="mt-2 text-2xl font-bold text-white">{paymentDashboardStats.refundedPayments}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0c2350]/70 p-4">
            <p className="text-xs text-white/50">Failed</p>
            <p className="mt-2 text-2xl font-bold text-white">{paymentDashboardStats.failedPayments}</p>
          </div>
        </div>
      </div>

      <Separator className="bg-white/10" />
    </div>
  );
}
