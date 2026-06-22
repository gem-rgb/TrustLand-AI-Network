'use client';

import React from 'react';
import { ArrowRight, Banknote, RefreshCw, ShieldCheck } from 'lucide-react';

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

export default function SellerWithdrawalView() {
  const { fetchPayments, payments, properties, sessionIdentityDid, sessionDisplayName, setCurrentView } = useTrustLandStore();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  React.useEffect(() => {
    fetchPayments().catch((error) => {
      console.error('Failed to load seller withdrawals:', error);
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

  const ownedProperties = sessionIdentityDid
    ? properties.filter((property) => property.ownerDid === sessionIdentityDid)
    : [];

  const ownedPropertyIds = new Set(ownedProperties.map((property) => property.id));
  const withdrawalPayments = payments
    .filter((payment) => ownedPropertyIds.has(payment.parcelId) && payment.status === 'paid')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const withdrawableBalance = withdrawalPayments
    .filter((payment) => payment.paymentPurpose === 'purchase_settlement' || payment.paymentPurpose === 'service_fee')
    .reduce((sum, payment) => sum + payment.amount, 0);

  const reservedPayments = payments.filter((payment) => ownedPropertyIds.has(payment.parcelId) && payment.status === 'payment_pending');

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#112c4d] via-[#0c2350] to-[#081a38] p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge className="bg-teal-500/20 text-teal-200 border border-teal-500/30">
                <Banknote className="h-3 w-3 mr-1" /> Seller withdrawal
              </Badge>
              <Badge className="bg-white/5 text-white/70 border border-white/10">
                <ShieldCheck className="h-3 w-3 mr-1" /> Server verified
              </Badge>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
              Withdrawal overview{sessionDisplayName ? `, ${sessionDisplayName}` : ''}
            </h1>
            <p className="mt-3 text-white/70 max-w-xl">
              Track funds that are eligible for withdrawal after the verified purchase workflow completes. This page is read-only until payout automation is connected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={refreshPayments} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10">
              <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button onClick={() => setCurrentView('autonomous-purchase')} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
              <ArrowRight className="h-4 w-4 mr-2" />
              Open purchase flow
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Owned properties', value: ownedProperties.length, accent: 'from-blue-500 to-indigo-500' },
          { label: 'Withdrawable balance', value: withdrawableBalance.toLocaleString(), accent: 'from-emerald-500 to-teal-500' },
          { label: 'Pending payments', value: reservedPayments.length, accent: 'from-amber-500 to-orange-500' },
          { label: 'Verified payout entries', value: withdrawalPayments.length, accent: 'from-sky-500 to-cyan-500' },
        ].map((card) => (
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
            <h3 className="text-lg font-semibold">Withdrawal ledger</h3>
            <p className="text-sm text-white/60">Verified purchase settlements and service fees tied to your properties.</p>
          </div>
        </div>

        <div className="space-y-3">
          {withdrawalPayments.length > 0 ? withdrawalPayments.map((payment) => (
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
                    Verified {payment.verifiedAt || payment.paidAt || 'pending'} · Ledger {payment.ledgerEntryId || 'pending'}
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
              No verified payout entries are ready yet. Once purchase settlement clears, withdrawal tracking will appear here.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <h3 className="text-lg font-semibold mb-3">Next steps</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-white/10 bg-[#0c2350]/70 text-white">
            <CardHeader>
              <CardTitle className="text-base text-white">Continue sales workflow</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/60">
              Keep the purchase workflow moving through the verified autonomous purchase flow. Payouts remain locked until the transaction is finalized.
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-[#0c2350]/70 text-white">
            <CardHeader>
              <CardTitle className="text-base text-white">Coordinate with admin</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/60">
              Finance review and disbursement planning happen in the admin finance console after server verification completes.
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="bg-white/10" />
    </div>
  );
}
