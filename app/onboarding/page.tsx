import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SwitchToGoogleButton } from '@/components/auth/SwitchToGoogleButton';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { GoogleIdentitySummary } from '@/components/onboarding/google-identity-summary';
import { activityOptions, activityTitle } from '@/lib/onboarding/presentation';
import { activityKindSchema } from '@/lib/onboarding/validation';
import { listMyActivityWorkspaces, readMyOnboardingDrafts } from '@/lib/onboarding/repository';
import { createClient } from '@/lib/supabase/server';
import styles from '@/components/onboarding/onboarding.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'جهّز نشاطك | ديرتك', robots: { index: false, follow: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ activity?: string }> }) {
  const params = await searchParams;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/signin?next=%2Fonboarding');
  if (!user.identities?.some(identity => identity.provider === 'google')) {
    return <><Header /><main id="main-content" className={`dairtak-theme ${styles.page}`}><h1>انضم إلى نشاط جديد باستخدام Google</h1><p>دخول حسابك القديم مستمر. لا نربط حسابين تلقائيًا بتشابه الهاتف أو البريد.</p><SwitchToGoogleButton /></main></>;
  }
  const [drafts, workspaces] = await Promise.all([readMyOnboardingDrafts(), listMyActivityWorkspaces()]);
  const activity = activityKindSchema.safeParse(params.activity);
  const kind = activity.success ? activity.data : null;
  const selected = kind ? drafts.find(draft => draft.activityKind === kind) ?? null : null;
  if (kind && workspaces.some(workspace => workspace.activityKind === kind && ['pending', 'approved', 'suspended'].includes(workspace.status))) redirect('/workspaces');
  const { data: places, error: placesError } = kind && kind !== 'driver' && kind !== 'real_estate'
    ? await client.from('places').select('id,title,category').order('title').limit(200)
    : { data: [], error: null };
  if (placesError) throw new Error('onboarding_places_unavailable');
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const identity = { userId: user.id, displayName: typeof metadataName === 'string' ? metadataName.slice(0, 100) : '', email: user.email ?? '' };
  return <><Header /><main id="main-content" className={`dairtak-theme ${styles.page}`}>
    <div className={styles.intro}><h1>{kind ? `نجهّز ${activityTitle(kind)} معًا` : 'إيه اللي تحب تضيفه لدائرتك؟'}</h1>
      <p>حساب واحد للشراء ولكل أنشطتك. ابدأ بخطوات بسيطة، وكمل في أي وقت من نفس الحساب.</p>
      <GoogleIdentitySummary displayName={identity.displayName} email={identity.email} avatarUrl={user.user_metadata?.avatar_url ?? user.user_metadata?.picture} />
    </div>
    {kind ? <OnboardingWizard key={`${kind}:${selected?.id ?? 'new'}`} kind={kind} initialDraft={selected} identity={identity} places={places ?? []} /> : <>
      {workspaces.length ? <Link className={styles.link} href="/workspaces">الانتقال إلى مساحات عملي ومتابعة الطلبات</Link> : null}
      <div className={styles.choices}>{activityOptions.map(option => <Link key={option.kind} href={`/onboarding?activity=${option.kind}`} className={styles.choice}>
        <strong>{option.title}</strong><span>{option.description}</span>
        {drafts.some(draft => draft.activityKind === option.kind && draft.status === 'draft') ? <span>لديك مسودة محفوظة · استكملها</span> : null}
      </Link>)}</div>
      <Link className={styles.link} href="/marketplace">الاستمرار كمشتري — لا أريد إضافة نشاط الآن</Link>
    </>}
  </main></>;
}
