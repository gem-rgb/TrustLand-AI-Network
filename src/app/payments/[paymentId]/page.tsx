import PaymentReceiptView from '@/components/trustland/PaymentReceiptView';

export default async function PaymentReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PaymentReceiptView paymentId={paymentId} />;
}
