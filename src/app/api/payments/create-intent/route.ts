import { NextResponse } from 'next/server';

import { createPaymentIntentRecord, getPaymentSessionFromHeaders, TrustLandPaymentError } from '@/lib/payments';
import type { PaymentCreateIntentRequest } from '@/lib/payment-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(error: unknown) {
  if (error instanceof TrustLandPaymentError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  console.error('Failed to create payment intent:', error);
  return NextResponse.json({ error: 'Unable to create payment intent' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const session = getPaymentSessionFromHeaders(request.headers);
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new TrustLandPaymentError('Invalid payment request payload', 400);
    }

    const payload = body as PaymentCreateIntentRequest;
    const result = await createPaymentIntentRecord(payload, session);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
