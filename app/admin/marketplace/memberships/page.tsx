import Link from 'next/link';
import { AdminMembershipsPanel } from '@/components/marketplace/admin-memberships-panel';
import styles from '@/components/marketplace/operational-setup.module.css';
import {
  listMarketplaceAdminMemberships,
  requireMarketplaceAdminRole,
} from '@/lib/admin/marketplace-memberships';
import { saveMarketplaceAdminMembershipAction } from './actions';

const messages: Record<string, string> = {
  membership_saved: 'تم حفظ الصلاحيات وتسجيل التغيير في سجل التدقيق.',
};
const errors: Record<string, string> = {
  last_super_admin: 'لا يمكن تعطيل أو إزالة آخر مدير كامل.',
  conflict: 'تغيرت الصلاحيات في جلسة أخرى. حدّث الصفحة وحاول مجددًا.',
  access_denied: 'هذه الصفحة متاحة للمدير الكامل فقط.',
  invalid_input: 'اختر دورًا واحدًا على الأقل وراجع البيانات.',
  save_failed: 'تعذر حفظ الصلاحيات الآن.',
};

function single(value: string | string[] | undefined) { return typeof value === 'string' ? value : ''; }

export default async function AdminMembershipsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMarketplaceAdminRole(['super_admin'], { nextPath: '/admin/marketplace/memberships' });
  const [memberships, params] = await Promise.all([listMarketplaceAdminMemberships(), searchParams]);
  const notice = messages[single(params.notice)];
  const error = errors[single(params.error)];
  return <main id="main-content" className={styles.page} dir="rtl">
    <header className={styles.header}><div>
      <h1>عضويات إدارة السوق</h1>
      <p>توزيع مسؤوليات واضح مع أقل صلاحية لازمة لكل عضو.</p>
    </div><Link href="/admin/marketplace/orders">العودة لعمليات السوق</Link></header>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <AdminMembershipsPanel memberships={memberships} action={saveMarketplaceAdminMembershipAction} />
  </main>;
}
