import { notFound } from 'next/navigation';
import { ReconciliationDetailView } from '@/components/commerce-operations/finance-detail';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getMyCashReconciliation } from '@/lib/commerce/operations';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await requireMarketplaceAdminRole(['finance'], { nextPath: `/admin/marketplace/reconciliations/${id}` }); const batch = await getMyCashReconciliation(id); if (!batch) notFound(); return <><span id="main-content" tabIndex={-1} /><ReconciliationDetailView batch={batch} /></>; }
