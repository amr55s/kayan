'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@heroui/react';
import { activityTitle, onboardingSteps } from '@/lib/onboarding/presentation';
import { createDraftSaveQueue, type SaveState } from '@/lib/onboarding/autosave';
import { acknowledgeDraftRecovery, canRestoreDraftRecovery, discardDraftRecovery, persistDraftRecovery, readDraftRecovery, type DraftRecovery, type RecoveryScope } from '@/lib/onboarding/recovery';
import { onboardingDraftDataSchema } from '@/lib/onboarding/validation';
import { saveOnboardingDraftAction, submitOnboardingDraftAction } from '@/lib/onboarding/actions';
import type { ActivityKind, OnboardingDraft, OnboardingDraftData, OnboardingStep } from '@/lib/onboarding/types';
import { ActivityBasics, ActivityContent, type PlaceOption } from './activity-fields';
import styles from './onboarding.module.css';

type Snapshot = { data: OnboardingDraftData; step: OnboardingStep };
function validateRecoverySnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object' || !('data' in value) || !('step' in value)) return null;
  const data = onboardingDraftDataSchema.safeParse(value.data);
  if (!data.success || typeof value.step !== 'number' || ![2, 3, 4].includes(value.step)) return null;
  return { data: data.data, step: value.step as OnboardingStep };
}
function withSessionRecovery(action: (storage: Storage) => void) {
  try { action(window.sessionStorage); } catch { /* The server save remains authoritative if browser storage is unavailable. */ }
}
const saveLabels: Record<SaveState, string> = {
  saved: 'كل التعديلات محفوظة', waiting: 'تعديلات بانتظار الحفظ…', saving: 'جارٍ حفظ المسودة…',
  error: 'لم تُحفظ آخر التعديلات', conflict: 'توجد نسخة أحدث في تبويب آخر',
};

export function OnboardingWizard({ kind, initialDraft, identity, places }: {
  kind: ActivityKind; initialDraft: OnboardingDraft | null;
  identity: { userId: string; displayName: string; email: string }; places: PlaceOption[];
}) {
  const router = useRouter();
  const initial: Snapshot = { step: initialDraft?.step ?? 2, data: initialDraft?.data ?? {
    displayName: identity.displayName, placeMode: 'new', mediaIds: [],
    category: kind === 'restaurant' ? 'restaurants' : kind === 'service' ? 'services' : kind === 'real_estate' ? 'real_estate' : 'stores',
  } };
  const [snapshot, setSnapshot] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState(initialDraft?.updatedAt ?? '');
  const [recovery, setRecovery] = useState<DraftRecovery<Snapshot> | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryScope] = useState<RecoveryScope>({ userId: identity.userId, activityKind: kind });
  const [saveRuntime] = useState(() => ({ saved: initialDraft, state: 'saved' as SaveState }));
  const uploadingRef = useRef(false);
  const current = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [queue] = useState(() => createDraftSaveQueue<Snapshot, OnboardingDraft>({
    version: initialDraft?.version ?? 0,
    onState(state) { saveRuntime.state = state; setSaveState(state); },
    onSaved(result) { saveRuntime.saved = result; setSavedAt(result.updatedAt); },
    async save(value, expectedVersion) {
      const result = await saveOnboardingDraftAction({
        activityKind: kind, step: value.step, data: value.data, expectedVersion, draftId: saveRuntime.saved?.id,
      });
      if (!result.success) {
        setError(result.message);
        throw new Error(result.code === 'conflict' ? 'onboarding_version_conflict' : result.code);
      }
      withSessionRecovery(storage => acknowledgeDraftRecovery(storage, recoveryScope, value, result.draft.version));
      return result.draft;
    },
  }));

  function schedule(next: Snapshot) {
    current.current = next;
    setSnapshot(next);
    queue.schedule(next);
    withSessionRecovery(storage => { persistDraftRecovery(storage, recoveryScope, next, queue.getVersion()); });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void queue.flush().catch(() => undefined); }, 700);
  }
  function change(patch: Partial<OnboardingDraftData>) {
    schedule({ ...current.current, data: { ...current.current.data, ...patch } });
  }
  useEffect(() => {
    const recoveryFrame = window.requestAnimationFrame(() => {
      withSessionRecovery(storage => {
        const candidate = readDraftRecovery(storage, recoveryScope, validateRecoverySnapshot);
        // A save may have reached the server immediately before a tab was closed.
        if (candidate && JSON.stringify(candidate.snapshot) === JSON.stringify(current.current)) {
          discardDraftRecovery(storage, recoveryScope);
        } else setRecovery(candidate);
      });
      setRecoveryChecked(true);
    });
    function beforeUnload(event: BeforeUnloadEvent) {
      if (queue.isDirty()) { event.preventDefault(); event.returnValue = ''; }
    }
    const retry = () => {
      if (queue.isDirty() && saveRuntime.state !== 'conflict') void queue.flush().catch(() => undefined);
    };
    function saveBeforeNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href
        || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!queue.isDirty() && !uploadingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (uploadingRef.current) { setError('انتظر اكتمال رفع الصورة وحفظها قبل مغادرة الصفحة.'); return; }
      setBusy(true);
      void queue.flush().then(() => router.push(`${destination.pathname}${destination.search}${destination.hash}`))
        .catch(() => { /* Keep this page and its local recovery until save succeeds. */ })
        .finally(() => setBusy(false));
    }
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', retry);
    document.addEventListener('click', saveBeforeNavigation, true);
    return () => {
      window.cancelAnimationFrame(recoveryFrame);
      if (timer.current) clearTimeout(timer.current);
      // Browser Back and programmatic routing do not necessarily emit a click.
      retry();
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', retry);
      document.removeEventListener('click', saveBeforeNavigation, true);
    };
  }, [queue, router, recoveryScope, saveRuntime]);
  useEffect(() => { title.current?.focus(); }, [snapshot.step]);

  async function saveNow() {
    if (!saveRuntime.saved && !queue.isDirty()) queue.schedule(current.current);
    await queue.flush();
  }
  async function nextStep() {
    if (recovery || !recoveryChecked) return;
    setError('');
    setBusy(true);
    try {
      if (snapshot.step < 4) {
        const next = { ...current.current, step: (snapshot.step + 1) as OnboardingStep };
        schedule(next);
        await saveNow();
      } else {
        await saveNow();
        const draft = saveRuntime.saved;
        if (!draft) return;
        const result = await submitOnboardingDraftAction({ draftId: draft.id, expectedVersion: queue.getVersion() });
        if (!result.success) { setError(result.message); return; }
        withSessionRecovery(storage => discardDraftRecovery(storage, recoveryScope));
        router.replace('/workspaces');
        router.refresh();
      }
    } catch { /* The save queue keeps unsaved edits and displays an actionable failure. */ }
    finally { setBusy(false); }
  }
  async function back() {
    if (snapshot.step > 2) schedule({ ...current.current, step: (snapshot.step - 1) as OnboardingStep });
    else {
      setBusy(true);
      try { await saveNow(); router.push('/onboarding'); }
      catch { /* Stay on this page with unsaved changes. */ }
      finally { setBusy(false); }
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('اختر صورة بحجم لا يتجاوز 3 ميجابايت.'); return; }
    if ((current.current.data.mediaIds?.length ?? 0) >= 7) return;
    uploadingRef.current = true; setUploading(true); setError('');
    try {
      await saveNow();
      if (!saveRuntime.saved) throw new Error('draft_missing');
      const response = await fetch('/api/onboarding/media', { method: 'POST', body: file,
        headers: { 'content-type': file.type, 'x-draft-id': saveRuntime.saved.id } });
      const value = await response.json();
      if (!response.ok || typeof value.assetId !== 'string') throw new Error('upload_failed');
      change({ mediaIds: [...(current.current.data.mediaIds ?? []), value.assetId] });
      await saveNow();
    } catch { setError('تعذر رفع الصورة أو حفظ ارتباطها. بياناتك السابقة محفوظة؛ تحقق من الاتصال وحاول مرة أخرى.'); }
    finally { uploadingRef.current = false; setUploading(false); }
  }

  const { step, data } = snapshot;
  return <div className={styles.layout}>
    <ol className={styles.steps} aria-label="خطوات تجهيز النشاط">
      {onboardingSteps.map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>
        <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span><span>{label}</span>
      </li>)}
    </ol>
    <Card className={`dairtak-card ${styles.form}`}>
      <form onSubmit={event => { event.preventDefault(); void nextStep(); }}>
        <h2 ref={title} tabIndex={-1} className={styles.heading}>{onboardingSteps[step - 1]}</h2>
        <p className={styles.muted}>{activityTitle(kind)} · يمكنك الرجوع ومراجعة بياناتك قبل الإرسال.</p>
        <div className={styles.status} role="status" aria-live="polite">
          {savedAt || saveState !== 'saved' ? saveLabels[saveState] : 'سنحفظ تلقائيًا بعد أول تعديل.'}
        </div>
        {recovery ? <section className={styles.notice} aria-label="استعادة تعديلات غير محفوظة">
          <h3>وجدنا تعديلات لم تُحفظ من زيارتك السابقة</h3>
          <p>هذه نسخة مؤقتة خاصة بهذا التبويب وحسابك، صالحة لمدة 30 دقيقة. لن نستبدل بيانات الخادم تلقائيًا.</p>
          <details><summary className={styles.link}>عرض النسخة المحلية للمقارنة</summary>
            <dl className={styles.review}>
              <div><dt>الاسم</dt><dd>{recovery.snapshot.data.displayName || '—'}</dd></div>
              <div><dt>النشاط</dt><dd>{recovery.snapshot.data.name || '—'}</dd></div>
              <div><dt>التواصل</dt><dd dir="ltr">{recovery.snapshot.data.phone || '—'}</dd></div>
              <div><dt>الوصف</dt><dd>{recovery.snapshot.data.description || '—'}</dd></div>
              <div><dt>العنوان</dt><dd>{recovery.snapshot.data.address || '—'}</dd></div>
              <div><dt>المنتج</dt><dd>{recovery.snapshot.data.product?.name || '—'}</dd></div>
              {recovery.snapshot.data.product ? <>
                <div><dt>وصف المنتج</dt><dd>{recovery.snapshot.data.product.description || '—'}</dd></div>
                <div><dt>سعر المنتج</dt><dd>{recovery.snapshot.data.product.priceEgp || '—'} ج.م</dd></div>
              </> : null}
              {kind === 'driver' ? <div><dt>المركبة</dt><dd>{recovery.snapshot.data.vehicleType || '—'}</dd></div> : null}
              {recovery.snapshot.data.realEstate ? <>
                <div><dt>السعر</dt><dd>{recovery.snapshot.data.realEstate.priceEgp || '—'} ج.م</dd></div>
                <div><dt>الغرف / الحمامات</dt><dd>{recovery.snapshot.data.realEstate.rooms || '—'} / {recovery.snapshot.data.realEstate.bathrooms || '—'}</dd></div>
                <div><dt>المساحة / الدور</dt><dd>{recovery.snapshot.data.realEstate.areaSqm || '—'} م² / {recovery.snapshot.data.realEstate.floor || '—'}</dd></div>
              </> : null}
              <div><dt>الصور</dt><dd>{recovery.snapshot.data.mediaIds?.length ?? 0}</dd></div>
            </dl>
          </details>
          {canRestoreDraftRecovery(recovery, queue.getVersion()) ? <Button type="button" className="dairtak-button" onPress={() => {
            const restored = recovery.snapshot;
            setRecovery(null);
            schedule(restored);
          }}>استعادة التعديلات ومتابعتها</Button> : <p>توجد نسخة أحدث على الخادم. احتفظنا بالمحلية للمقارنة فقط حتى لا تكتب فوق تعديلات التبويب الآخر.</p>}
          <Button type="button" variant="secondary" className="dairtak-button-secondary" onPress={() => {
            withSessionRecovery(storage => discardDraftRecovery(storage, recoveryScope));
            setRecovery(null);
          }}>تجاهل المحلية واستخدام النسخة المحفوظة</Button>
        </section> : null}
        {error ? <div role="alert" className={styles.error}>{error}
          {saveState === 'conflict' ? <p><Link className={styles.link} href={`/onboarding?activity=${kind}`} target="_blank" rel="noopener">افتح النسخة الأحدث في تبويب جديد للمقارنة</Link></p> : null}
          {saveState === 'error' ? <div><Button type="button" variant="secondary" onPress={() => { void saveNow().then(() => setError('')).catch(() => undefined); }}>إعادة الحفظ</Button><Link className={styles.link} href={`/signin?next=${encodeURIComponent(`/onboarding?activity=${kind}`)}`} target="_blank" rel="noopener">تجديد تسجيل الدخول دون إغلاق هذه الصفحة</Link></div> : null}
        </div> : null}
        <fieldset disabled={!recoveryChecked || Boolean(recovery) || busy || uploading || saveState === 'conflict'} style={{ border: 0, padding: 0, minWidth: 0 }}>
          {step === 2 ? <ActivityBasics kind={kind} data={data} email={identity.email} places={places} onChange={change} /> : null}
          {step === 3 ? <>
            <ActivityContent kind={kind} data={data} onChange={change} />
            {kind === 'store' || kind === 'restaurant' ? <Button type="button" variant="secondary" className="dairtak-button-secondary"
              onPress={() => change({ product: data.product ? undefined : { name: '', description: '', priceEgp: '' } })}>
              {data.product ? 'تأجيل المنتج وإزالته من المسودة' : 'تجهيز أول منتج الآن'}
            </Button> : null}
            {kind !== 'driver' ? <section className={styles.fields} aria-label="صور النشاط">
              <h3>الصور {kind === 'real_estate' ? '(من 5 إلى 7 صور)' : '(اختيارية، حتى 7 صور)'}</h3>
              <p className={styles.muted}>تظل الصور خاصة قبل الموافقة. JPG أو PNG أو WebP أو AVIF، حتى 3 ميجابايت للصورة.</p>
              <input aria-label="رفع صورة للنشاط" type="file" accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={uploading || (data.mediaIds?.length ?? 0) >= 7}
                onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
              <p role="status">{uploading ? 'جارٍ رفع الصورة وحفظها…' : `${data.mediaIds?.length ?? 0} من 7 صور`}</p>
              <div className={styles.photos}>{data.mediaIds?.map((id, index) => <div key={id} className={styles.photo}>
                <Image src={`/api/onboarding/media/${id}`} alt={`صورة النشاط ${index + 1}`} width={160} height={160} unoptimized />
                <Button type="button" variant="ghost" aria-label={`إزالة الصورة ${index + 1} من المسودة`} onPress={() => change({ mediaIds: data.mediaIds?.filter(value => value !== id) })}>إزالة</Button>
              </div>)}</div>
            </section> : null}
          </> : null}
          {step === 4 ? <>
            <p className={styles.notice}>نراجع كل نشاط بشكل مستقل. إرسال هذا الطلب لن يغيّر صلاحيات أنشطتك الأخرى، ولن ينشر المنتج تلقائيًا.</p>
            <dl className={styles.review}>
              <div><dt>النشاط</dt><dd>{activityTitle(kind)}</dd></div>
              <div><dt>الاسم</dt><dd>{data.displayName || 'لم يُكتب بعد'}</dd></div>
              <div><dt>التواصل</dt><dd dir="ltr">{data.phone || 'لم يُكتب بعد'}</dd></div>
              {kind !== 'driver' ? <><div><dt>اسم النشاط</dt><dd>{data.placeMode === 'existing' ? places.find(place => place.id === data.existingPlaceId)?.title ?? 'المكان غير محدد' : data.name || 'لم يُكتب بعد'}</dd></div><div><dt>الوصف</dt><dd>{data.description || '—'}</dd></div></> : <div><dt>وسيلة التوصيل</dt><dd>{data.vehicleType || 'غير محددة'}</dd></div>}
              {kind === 'store' || kind === 'restaurant' ? <div><dt>أول منتج</dt><dd>{data.product ? `${data.product.name} · ${data.product.priceEgp} ج.م (مسودة)` : 'مؤجل حتى تجهيز الكتالوج'}</dd></div> : null}
              {kind === 'real_estate' ? <><div><dt>العرض</dt><dd>{data.realEstate?.offerType === 'sale' ? 'بيع' : 'إيجار'}</dd></div><div><dt>السعر</dt><dd>{data.realEstate?.priceEgp || 'غير محدد'} ج.م</dd></div></> : null}
              <div><dt>الصور</dt><dd>{data.mediaIds?.length ?? 0} صور خاصة</dd></div>
            </dl>
          </> : null}
        </fieldset>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" className="dairtak-button-secondary" isDisabled={!recoveryChecked || Boolean(recovery) || busy || uploading} onPress={() => { void back(); }}>رجوع</Button>
          <Button type="submit" className="dairtak-button" isPending={busy} isDisabled={!recoveryChecked || Boolean(recovery) || uploading || saveState === 'conflict'}>{step === 4 ? 'إرسال الطلب للمراجعة' : 'حفظ ومتابعة'}</Button>
        </div>
      </form>
    </Card>
  </div>;
}
