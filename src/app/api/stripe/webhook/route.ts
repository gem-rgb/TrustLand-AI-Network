import { NextResponse } from 'next/server';

import { processStripeWebhookEvent, TrustLandPaymentError } from '@/lib/payments';
import { getStripeServerClient, getStripeWebhookSecret } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const stripe = getStripeServerClient();
  const webhookSecret = getStripeWebhookSecret();
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookEvent(event);
    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      paymentId: result.payment?.id ?? null,
      status: result.payment?.status ?? null,
    });
  } catch (error) {
    if (error instanceof TrustLandPaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to process Stripe webhook:', error);
    return NextResponse.json({ error: 'Unable to process Stripe webhook' }, { status: 500 });
  }
}
