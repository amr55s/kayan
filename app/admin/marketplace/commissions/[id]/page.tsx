import { notFound } from 'next/navigation';
import { CommissionDetailView } from '@/components/commerce-operations/finance-detail';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getMyCommissionStatement } from '@/lib/commerce/operations';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await requireMarketplaceAdminRole(['finance'], { nextPath: `/admin/marketplace/commissions/${id}` }); const statement = await getMyCommissionStatement(id); if (!statement) notFound(); return <><span id="main-content" tabIndex={-1} /><CommissionDetailView statement={statement} admin /></>; }
