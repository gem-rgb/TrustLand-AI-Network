'use client';

import React from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useTrustLandStore } from '@/lib/store';
import {
  PAYMENT_STATUS_BADGE_STYLES,
  PAYMENT_STATUS_LABELS,
  getPaymentPurposeLabel,
  isTerminalPaymentStatus,
  type PaymentCreateIntentRequest,
  type PaymentCreateIntentResponse,
  type PaymentPurpose,
  type PaymentStatusResponse,
} from '@/lib/payment-types';

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || '';
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const appearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#f97316',
    colorBackground: '#0c2350',
    colorText: '#f8fafc',
    colorDanger: '#ef4444',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '12px',
  },
};

type PaymentCheckoutProps = {
  parcelId: string;
  parcelTitle: string;
  paymentPurpose: PaymentPurpose;
  transactionId?: string | null;
  workflowTransactionId?: string | null;
  className?: string;
  description?: string;
  onVerified?: (result: PaymentStatusResponse) => void;
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString();
}

function PaymentForm({
  paymentId,
  paymentResponse,
  onVerified,
  onProcessing,
  onError,
  onPaymentSettled,
}: {
  paymentId: string;
  paymentResponse: PaymentCreateIntentResponse;
  onVerified: (result: PaymentStatusResponse) => void;
  onProcessing: (message: string) => void;
  onError: (message: string) => void;
  onPaymentSettled: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { fetchPaymentStatus } = useTrustLandStore();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const pollForVerification = React.useCallback(async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = await fetchPaymentStatus(paymentId);
      if (!status) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      if (status.payment.status === 'paid') {
        await onPaymentSettled();
        onVerified(status);
        return;
      }

      if (isTerminalPaymentStatus(status.payment.status)) {
        onError(PAYMENT_STATUS_LABELS[status.payment.status]);
        return;
      }

      onProcessing('Waiting for Stripe webhook verification...');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    onProcessing('Payment submitted. TrustLand will keep checking for webhook verification.');
  }, [fetchPaymentStatus, onError, onPaymentSettled, onProcessing, onVerified, paymentId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) {
      setSubmitError('Stripe has not finished loading yet.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payments/${paymentId}`,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        const message = result.error.message || 'Payment could not be confirmed';
        setSubmitError(message);
        onError(message);
        return;
      }

      onProcessing('Payment confirmed with Stripe. Waiting for server verification...');
      await pollForVerification();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to confirm payment';
      setSubmitError(message);
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentSummary = paymentResponse.safeDisplay;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {submitError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
          {submitError}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={!stripe || !elements || isSubmitting}
          className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Processing payment' : 'Confirm payment'}
        </Button>
        <span className="text-xs text-white/50">
          TrustLand never receives card numbers, CVV, or expiry values. Stripe handles the secure form directly.
        </span>
      </div>
      <Separator className="bg-white/10" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Transaction reference</p>
          <p className="mt-1 font-mono text-sm text-white">{paymentSummary.paymentReference}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Verified amount</p>
          <p className="mt-1 text-sm text-white">{paymentResponse.displayAmount}</p>
        </div>
      </div>
    </form>
  );
}

function DemoPaymentPanel({
  paymentResponse,
  onConfirm,
  onProcessing,
  onError,
  onPaymentSettled,
}: {
  paymentResponse: PaymentCreateIntentResponse;
  onConfirm: () => Promise<void>;
  onProcessing: (message: string) => void;
  onError: (message: string) => void;
  onPaymentSettled: () => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      onProcessing('Simulated payment verified. Updating TrustLand state...');
      await onConfirm();
      await onPaymentSettled();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to confirm demo payment';
      onError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-center gap-2 text-amber-200">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-medium">Demo mode active</span>
        </div>
        <p className="mt-2 text-sm text-amber-100/80">
          Stripe keys are not configured, so this flow is simulated locally. The TrustLand state machine, audit ledger,
          and workflow transitions still run through the server.
        </p>
      </div>
      <Button
        type="button"
        onClick={handleConfirm}
        disabled={isConfirming}
        className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
      >
        {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isConfirming ? 'Verifying simulated payment' : `Simulate ${paymentResponse.safeDisplay.paymentPurposeLabel}`}
      </Button>
    </div>
  );
}

export default function PaymentCheckout({
  parcelId,
  parcelTitle,
  paymentPurpose,
  transactionId,
  workflowTransactionId,
  className,
  description,
  onVerified,
}: PaymentCheckoutProps) {
  const { createPaymentIntent, confirmDemoPayment, fetchPaymentStatus, fetchTransactions } = useTrustLandStore();
  const transactionRef = React.useRef<string>(transactionId || crypto.randomUUID());
  const [checkoutState, setCheckoutState] = React.useState<'creating' | 'ready' | 'processing' | 'verified' | 'failed'>('creating');
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [paymentResponse, setPaymentResponse] = React.useState<PaymentCreateIntentResponse | null>(null);
  const [statusResponse, setStatusResponse] = React.useState<PaymentStatusResponse | null>(null);
  const [processingMessage, setProcessingMessage] = React.useState('Awaiting payment');
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    const run = async () => {
      setCheckoutState('creating');
      setCheckoutError(null);
      setPaymentResponse(null);
      setStatusResponse(null);
      setProcessingMessage('Preparing payment intent...');

      try {
        transactionRef.current = transactionId || transactionRef.current || crypto.randomUUID();
        const payload: PaymentCreateIntentRequest = {
          transactionId: transactionRef.current,
          workflowTransactionId: workflowTransactionId || undefined,
          parcelId,
          paymentPurpose,
        };
        const response = await createPaymentIntent(payload);
        if (!active) return;
        setPaymentResponse(response);
        setCheckoutState('ready');
        setProcessingMessage(response.demoMode ? 'Demo payment ready' : 'Awaiting card entry');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to prepare payment';
        setCheckoutError(message);
        setCheckoutState('failed');
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [createPaymentIntent, parcelId, paymentPurpose, retryNonce, transactionId, workflowTransactionId]);

  const refreshStatus = React.useCallback(async () => {
    if (!paymentResponse?.payment.id) return null;
    const result = await fetchPaymentStatus(paymentResponse.payment.id);
    if (result) {
      setStatusResponse(result);
      if (result.payment.status === 'paid') {
        setCheckoutState('verified');
        onVerified?.(result);
      } else if (result.payment.status === 'failed' || result.payment.status === 'cancelled' || result.payment.status === 'refunded' || result.payment.status === 'disputed') {
        setCheckoutState('failed');
      } else if (result.payment.status === 'processing') {
        setCheckoutState('processing');
      }
    }
    return result;
  }, [fetchPaymentStatus, onVerified, paymentResponse]);

  const refreshWorkflowState = React.useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  React.useEffect(() => {
    if (!paymentResponse?.payment.id || paymentResponse.demoMode || checkoutState !== 'processing') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      refreshStatus().catch((error) => {
        console.error('Failed to refresh payment status:', error);
      });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [checkoutState, paymentResponse?.demoMode, paymentResponse?.payment.id, refreshStatus]);

  const latestStatus = statusResponse?.payment ?? paymentResponse?.payment ?? null;
  const paymentStatus = latestStatus ? PAYMENT_STATUS_LABELS[latestStatus.status] : 'Preparing payment';
  const paymentBadgeClass = latestStatus ? PAYMENT_STATUS_BADGE_STYLES[latestStatus.status] : 'border-white/20 text-white/70 bg-white/5';

  const handleDemoConfirm = async () => {
    if (!paymentResponse?.payment.id) return;
    setCheckoutState('processing');
    setProcessingMessage('Simulated payment submitted. Waiting for server verification...');
    await confirmDemoPayment(paymentResponse.payment.id);
    await refreshStatus();
  };

  if (checkoutState === 'creating') {
    return (
      <Card className={cn('border-white/10 bg-white/5 text-white', className)}>
        <CardHeader>
          <CardTitle className="text-base text-white">Preparing payment</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
          Creating a server-validated payment intent for {parcelTitle}.
        </CardContent>
      </Card>
    );
  }

  if (checkoutState === 'failed' && !paymentResponse) {
    return (
      <Card className={cn('border-red-500/30 bg-red-500/10 text-white', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-100">
            <AlertCircle className="h-4 w-4" />
            Payment preparation failed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-100/80">{checkoutError || 'TrustLand could not prepare the payment intent.'}</p>
          <Button
            onClick={() => {
              setRetryNonce((value) => value + 1);
            }}
            className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!paymentResponse) {
    return null;
  }

  return (
    <Card className={cn('overflow-hidden border-white/10 bg-[#081a38] text-white shadow-2xl shadow-orange-950/20', className)}>
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-[#0c2350] to-[#102e63]">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg text-white">TrustLand payment checkout</CardTitle>
          <Badge className={cn('border text-[10px] uppercase tracking-[0.2em]', paymentBadgeClass)}>
            {paymentStatus}
          </Badge>
          {paymentResponse.demoMode && (
            <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-200 text-[10px] uppercase tracking-[0.2em]">
              Simulated
            </Badge>
          )}
        </div>
        <p className="text-sm text-white/60">
          {description || 'Card details are entered directly into Stripe Elements. TrustLand only receives the server-verified payment state.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Purpose</p>
            <p className="mt-1 text-sm font-medium text-white">{getPaymentPurposeLabel(paymentPurpose)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Parcel</p>
            <p className="mt-1 text-sm font-medium text-white">{parcelTitle}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Transaction reference</p>
            <p className="mt-1 font-mono text-sm text-white">{paymentResponse.safeDisplay.paymentReference}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Amount</p>
            <p className="mt-1 text-sm text-white">{paymentResponse.displayAmount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Workflow step</p>
            <p className="mt-1 text-sm text-white">{paymentResponse.workflow.nextRequiredWorkflowStep || 'Pending verification'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#06122e] p-4">
          {paymentResponse.demoMode ? (
            <DemoPaymentPanel
              paymentResponse={paymentResponse}
              onConfirm={handleDemoConfirm}
              onProcessing={setProcessingMessage}
              onError={(message) => {
                setCheckoutError(message);
                setCheckoutState('failed');
              }}
              onPaymentSettled={refreshWorkflowState}
            />
          ) : stripePromise && paymentResponse.clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentResponse.clientSecret,
                appearance,
              }}
              key={paymentResponse.payment.id}
            >
              <PaymentForm
                paymentId={paymentResponse.payment.id}
                paymentResponse={paymentResponse}
                onVerified={(result) => {
                  setStatusResponse(result);
                  setCheckoutState('verified');
                  setProcessingMessage('Payment verified by TrustLand.');
                }}
                onProcessing={(message) => {
                  setCheckoutState('processing');
                  setProcessingMessage(message);
                }}
                onError={(message) => {
                  setCheckoutError(message);
                  setCheckoutState('failed');
                }}
                onPaymentSettled={refreshWorkflowState}
              />
            </Elements>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                Stripe payment configuration is incomplete. Add <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and the
                server-side Stripe secret to enable live card payments.
              </div>
              <Button
                type="button"
                onClick={() => setRetryNonce((value) => value + 1)}
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 border-0"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Reload payment intent
              </Button>
            </div>
          )}
        </div>

        <Separator className="bg-white/10" />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Payment status</p>
            <p className="mt-1 text-sm font-medium text-white">{paymentStatus}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Verified timestamp</p>
            <p className="mt-1 text-sm font-medium text-white">{formatTimestamp(latestStatus?.verifiedAt || latestStatus?.paidAt || statusResponse?.payment.paidAt)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ledger reference</p>
            <p className="mt-1 text-sm font-medium text-white">{latestStatus?.ledgerEntryId || 'Pending server verification'}</p>
          </div>
        </div>

        {checkoutState === 'processing' && (
          <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
            <div>
              <p className="font-medium">Payment processing</p>
              <p className="text-sky-100/80">{processingMessage}</p>
            </div>
          </div>
        )}

        {checkoutState === 'verified' && latestStatus && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Payment verified by TrustLand</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/20 bg-[#06122e] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/60">Payment reference</p>
                <p className="mt-1 font-mono text-sm text-white">{latestStatus.id}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-[#06122e] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/60">Transaction ID</p>
                <p className="mt-1 font-mono text-sm text-white">{latestStatus.transactionId}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-[#06122e] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/60">Workflow step</p>
                <p className="mt-1 text-sm text-white">{latestStatus.nextRequiredWorkflowStep || 'Completed'}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-[#06122e] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/60">Receipt</p>
                {latestStatus.receiptUrl ? (
                  <a className="mt-1 block text-sm text-orange-300 underline underline-offset-4" href={latestStatus.receiptUrl}>
                    Open receipt
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-white/70">Receipt will appear after the webhook confirmation is stored.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {checkoutError && checkoutState === 'failed' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {checkoutError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
