import { notFound } from 'next/navigation';
import { ReceiptPage } from '../../../../../components/receipt-page.jsx';
import { isTransactionHash } from '../../../../../lib/receipt.mjs';

export default async function Page({ params }) {
  const { id, hash } = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1 || !isTransactionHash(hash)) notFound();
  return <ReceiptPage circleId={id} hash={hash} />;
}
