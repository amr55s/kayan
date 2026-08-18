import { notFound } from 'next/navigation';
import { ReconciliationDetailView } from '@/components/commerce-operations/finance-detail';
import { requireProfile } from '@/lib/auth/guards';
import { getMyCashReconciliation } from '@/lib/commerce/operations';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireProfile(['driver']); const { id } = await params; const batch = await getMyCashReconciliation(id); if (!batch) notFound(); return <><span id="main-content" tabIndex={-1} /><ReconciliationDetailView batch={batch} /></>; }
