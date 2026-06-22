import { NextResponse } from 'next/server';

import { getPaymentSessionFromHeaders, listPayments, getPaymentDashboardStats, TrustLandPaymentError } from '@/lib/payments';
import { isStripeDemoMode } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handleError(error: unknown) {
  if (error instanceof TrustLandPaymentError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  console.error('Failed to fetch payments:', error);
  return NextResponse.json({ error: 'Unable to fetch payments' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const session = getPaymentSessionFromHeaders(request.headers);
    const url = new URL(request.url);
    const transactionReference = url.searchParams.get('transactionId')
      || url.searchParams.get('transactionReference')
      || url.searchParams.get('workflowTransactionId')
      || '';

    const payments = listPayments(session).filter((payment) => {
      if (!transactionReference) return true;
      return payment.transactionId === transactionReference || payment.workflowTransactionId === transactionReference;
    });

    return NextResponse.json({
      payments,
      stats: getPaymentDashboardStats(),
      demoMode: isStripeDemoMode(),
    });
  } catch (error) {
    return handleError(error);
  }
}
