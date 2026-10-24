import { notFound } from 'next/navigation';
import { SavingsCircleDetailPage } from '../../../components/savings-pages.jsx';

export default async function Page({ params }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1) notFound();
  return <SavingsCircleDetailPage circleId={id} />;
}
