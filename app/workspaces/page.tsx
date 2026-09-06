import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { listMyActivityWorkspaces, readMyOnboardingDrafts } from '@/lib/onboarding/repository';
import { activityTitle, workspaceStatusLabels } from '@/lib/onboarding/presentation';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceGuide } from '@/components/onboarding/workspace-guide';
import styles from '@/components/onboarding/onboarding.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مساحات عملي | ديرتك', robots: { index: false, follow: false } };

export default async function WorkspacesPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/signin?next=%2Fworkspaces');
  const [workspaces, drafts, requests] = await Promise.all([
    listMyActivityWorkspaces(), readMyOnboardingDrafts(),
    client.from('account_requests').select('workspace_id,status,rejection_reason').eq('auth_user_id', user.id),
  ]);
  if (requests.error) throw new Error('workspace_requests_unavailable');
  const requestRows = requests.data;
  return <><Header /><main id="main-content" className={`dairtak-theme ${styles.page}`}>
    <div className={styles.intro}><h1>مساحات عملك في ديرتك</h1><p>كل نشاط له حالته وصلاحياته. تقدر تشتري وتتواصل بحسابك، حتى أثناء مراجعة نشاط جديد.</p></div>
    <WorkspaceGuide userId={user.id} />
    <div className={styles.workspaces}>{workspaces.map(workspace => {
      const request = requestRows.find(item => item.workspace_id === workspace.id);
      return <section className={`dairtak-card ${styles.workspace}`} key={workspace.id} aria-labelledby={`workspace-${workspace.id}`}>
        <p className={styles.muted}>{activityTitle(workspace.activityKind)} · {workspaceStatusLabels[workspace.status]}</p>
        <h2 id={`workspace-${workspace.id}`} className="text-xl font-bold">{workspace.name}</h2>
        {workspace.canManage ? <>
          <p className={styles.muted}>راجع بيانات النشاط وجهّز المحتوى. مراجعة المنتجات والمتجر تظل مطلوبة قبل النشر.</p>
          <Link href={`/workspaces/${workspace.id}`} className="dairtak-button">فتح مساحة النشاط</Link>
        </> : workspace.status === 'rejected' ? <>
          <p className={styles.notice}>{request?.rejection_reason || 'راجع بيانات الطلب ثم أعد تقديمه.'}</p>
          <Link className={styles.link} href={`/onboarding?activity=${workspace.activityKind}`}>تعديل الطلب وإعادة تقديمه</Link>
        </> : <p className={styles.notice}>{workspace.status === 'suspended' ? 'هذا النشاط موقوف. تواصل مع الإدارة لمعرفة الخطوة التالية.' : 'طلبك قيد المراجعة. يمكنك تجهيز نشاط آخر أو الاستمرار كمشتري.'}</p>}
      </section>;
    })}</div>
    {drafts.filter(draft => draft.status === 'draft').map(draft => <p key={draft.id}><Link className={styles.link} href={`/onboarding?activity=${draft.activityKind}`}>استكمال مسودة {activityTitle(draft.activityKind)}</Link></p>)}
    {!workspaces.length && !drafts.length ? <p className={styles.notice}>لسه مفيش أنشطة. اختار نشاطك الأول ونجهّزه معًا.</p> : null}
    <div className={styles.actions}><Link className="dairtak-button" href="/onboarding">إضافة نشاط جديد</Link><Link className={styles.link} href="/marketplace">الاستمرار كمشتري</Link></div>
  </main></>;
}
