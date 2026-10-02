import { notFound } from 'next/navigation';
import { CommissionDetailView } from '@/components/commerce-operations/finance-detail';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getMyCommissionStatement } from '@/lib/commerce/operations';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) { const [{ id }, query] = await Promise.all([params, searchParams]); await requireMarketplaceAdminRole(['finance'], { nextPath: `/admin/marketplace/commissions/${id}` }); const statement = await getMyCommissionStatement(id); if (!statement) notFound(); return <><span id="main-content" tabIndex={-1} /><CommissionDetailView statement={statement} admin notice={query.notice} error={query.error} /></>; }
