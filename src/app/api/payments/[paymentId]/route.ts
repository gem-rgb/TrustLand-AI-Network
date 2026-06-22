import { NextResponse } from 'next/server';

import {
  getPaymentSessionFromHeaders,
  getPaymentStatusResponse,
  handleDemoPaymentConfirmation,
  TrustLandPaymentError,
} from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handleError(error: unknown) {
  if (error instanceof TrustLandPaymentError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  console.error('Failed to fetch payment status:', error);
  return NextResponse.json({ error: 'Unable to fetch payment status' }, { status: 500 });
}

function readPaymentId(params: { paymentId: string }) {
  return params.paymentId?.trim() || '';
}

export async function GET(request: Request, context: { params: { paymentId: string } }) {
  try {
    const session = getPaymentSessionFromHeaders(request.headers);
    const paymentId = readPaymentId(context.params);
    if (!paymentId) {
      throw new TrustLandPaymentError('Payment ID is required', 400);
    }

    const result = getPaymentStatusResponse(paymentId, session);
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}

async function confirmDemoPayment(request: Request, context: { params: { paymentId: string } }) {
  const session = getPaymentSessionFromHeaders(request.headers);
  const paymentId = readPaymentId(context.params);
  if (!paymentId) {
    throw new TrustLandPaymentError('Payment ID is required', 400);
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload as { action?: string }).action !== 'confirm-demo') {
    throw new TrustLandPaymentError('Unsupported payment action', 400);
  }

  await handleDemoPaymentConfirmation(paymentId, session);
  return NextResponse.json(getPaymentStatusResponse(paymentId, session));
}

export async function PATCH(request: Request, context: { params: { paymentId: string } }) {
  try {
    return await confirmDemoPayment(request, context);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: { params: { paymentId: string } }) {
  try {
    return await confirmDemoPayment(request, context);
  } catch (error) {
    return handleError(error);
  }
}
