import { notFound } from 'next/navigation';
import { CommissionDetailView } from '@/components/commerce-operations/finance-detail';
import { requireProfile } from '@/lib/auth/guards';
import { getMyCommissionStatement } from '@/lib/commerce/operations';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireProfile(['merchant']); const { id } = await params; const statement = await getMyCommissionStatement(id); if (!statement) notFound(); return <CommissionDetailView statement={statement} />; }
