import PaymentReceiptView from '@/components/trustland/PaymentReceiptView';

export default function PaymentReceiptPage({ params }: { params: { paymentId: string } }) {
  return <PaymentReceiptView paymentId={params.paymentId} />;
}
