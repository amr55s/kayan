import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { createAdminClient } from '@/lib/supabase/admin';
import { onboardingDraftDataSchema } from '@/lib/onboarding/validation';
import { activityTitle } from '@/lib/onboarding/presentation';
import { activityKindSchema } from '@/lib/onboarding/validation';
import { Header } from '@/components/layout/Header';
import styles from '@/components/onboarding/onboarding.module.css';

export const dynamic = 'force-dynamic';
export default async function ReviewOnboarding({ params }: { params: Promise<{ requestId: string }> }) {
  await requireMarketplaceAdminRole(['super_admin'], { nextPath: '/admin' });
  const id = z.uuid().safeParse((await params).requestId);
  if (!id.success) notFound();
  const admin = createAdminClient() as any;
  const [{ data: request, error }, { data: draft, error: draftError }] = await Promise.all([
    admin.from('account_requests').select('*').eq('id', id.data).maybeSingle(),
    admin.from('onboarding_drafts').select('data,activity_kind').eq('request_id', id.data).maybeSingle(),
  ]);
  if (error || draftError) throw new Error('onboarding_review_unavailable');
  if (!request) notFound();
  const data = draft ? onboardingDraftDataSchema.parse(draft.data) : null;
  const kind = activityKindSchema.safeParse(request.activity_kind);
  return <><Header /><main id="main-content" className={`dairtak-theme ${styles.page}`}>
    <h1 className="text-2xl font-bold">مراجعة {kind.success ? activityTitle(kind.data) : 'النشاط'}</h1>
    <section className={`dairtak-card ${styles.form}`}>
      <dl className={styles.review}>
        <div><dt>صاحب الطلب</dt><dd>{request.display_name}</dd></div>
        <div><dt>رقم التواصل</dt><dd dir="ltr">{request.phone}</dd></div>
        <div><dt>النشاط</dt><dd>{request.place_title || request.vehicle_type || 'مكان موجود'}</dd></div>
        <div><dt>الوصف</dt><dd>{request.place_description || '—'}</dd></div>
        <div><dt>العنوان</dt><dd>{request.place_address || '—'}</dd></div>
        {data?.product ? <><div><dt>مسودة المنتج</dt><dd>{data.product.name}</dd></div><div><dt>السعر</dt><dd>{data.product.priceEgp} ج.م</dd></div><div><dt>وصف المنتج</dt><dd>{data.product.description}</dd></div></> : null}
        {data?.realEstate ? <><div><dt>العقار</dt><dd>{data.realEstate.propertyType} · {data.realEstate.offerType}</dd></div><div><dt>السعر</dt><dd>{data.realEstate.priceEgp} ج.م</dd></div><div><dt>المواصفات</dt><dd>{data.realEstate.rooms || '—'} غرف · {data.realEstate.bathrooms || '—'} حمامات · {data.realEstate.areaSqm || '—'} م²</dd></div></> : null}
      </dl>
      {data?.mediaIds?.length ? <><h2 className="my-4 text-lg font-bold">صور خاصة للمراجعة فقط</h2><div className={styles.photos}>{data.mediaIds.map((assetId,index) => <Image key={assetId} unoptimized src={`/api/onboarding/review-media/${assetId}`} width={400} height={400} alt={`صورة الطلب ${index+1}`} className="h-auto w-full rounded-xl" />)}</div></> : null}
      {!draft ? <p className={styles.notice}>هذا طلب سابق لرحلة المسودات الجديدة. راجع بياناته وروابطه القديمة قبل اتخاذ القرار.</p> : null}
      <p className={styles.notice}>الموافقة تخص هذا النشاط وحده؛ لا تنشر المنتج تلقائيًا ولا تغيّر صلاحيات الإدارة.</p>
      <Link href="/admin" className={styles.link}>العودة لطلبات الأنشطة لاتخاذ القرار</Link>
    </section>
  </main></>;
}
