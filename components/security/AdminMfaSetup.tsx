'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

type ScreenState = 'loading' | 'enroll' | 'challenge';

function safeMfaError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'mfa_verification_failed') {
    return 'الكود غير صحيح أو انتهت صلاحيته. انتظر كودًا جديدًا ثم حاول مرة أخرى.';
  }
  if (code === 'mfa_factor_name_conflict') {
    return 'يوجد جهاز حماية مسجل بهذا الاسم. حدّث الصفحة وحاول مرة أخرى.';
  }
  if (code === 'mfa_challenge_expired') {
    return 'انتهت مهلة التحقق. أدخل الكود الحالي وحاول مرة أخرى.';
  }
  return 'تعذر إكمال التحقق الآمن حاليًا. حاول مرة أخرى بعد قليل.';
}

export function AdminMfaSetup({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadFactors() {
      try {
        const supabase = createClient();
        const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        if (!active) return;

        const factor = data.totp[0];
        if (factor) {
          setVerifiedFactorId(factor.id);
          setScreen('challenge');
        } else {
          setScreen('enroll');
        }
      } catch (caught) {
        if (!active) return;
        setError(safeMfaError(caught));
        setScreen('enroll');
      }
    }

    void loadFactors();
    return () => {
      active = false;
    };
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const supabase = createClient();
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const existing = factors.totp[0];
      if (existing) {
        setVerifiedFactorId(existing.id);
        setEnrollment(null);
        setScreen('challenge');
        return;
      }

      // A QR secret cannot be retrieved for an interrupted, unverified factor.
      // Remove only those stale TOTP enrollments before issuing a fresh secret.
      const staleFactors = factors.all.filter(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      );
      for (const factor of staleFactors) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'DAIRTAK Admin',
        issuer: 'DAIRTAK',
      });
      if (enrollError) throw enrollError;

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode('');
    } catch (caught) {
      setError(safeMfaError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError('أدخل الكود المكوّن من 6 أرقام من تطبيق المصادقة.');
      return;
    }

    const factorId = enrollment?.factorId ?? verifiedFactorId;
    if (!factorId) {
      setError('ابدأ تفعيل تطبيق المصادقة أولًا.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: normalizedCode,
      });
      if (verifyError) throw verifyError;

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || assurance.currentLevel !== 'aal2') throw assuranceError;

      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setCode('');
      setError(safeMfaError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10" dir="rtl">
      <Card className="w-full max-w-lg border border-zinc-200 bg-white shadow-sm">
        <Card.Header className="flex items-start gap-3 border-b border-zinc-200 p-6">
          <span className="flex size-11 shrink-0 items-center justify-center bg-orange-100 text-orange-800">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black text-orange-700">حماية لوحة الإدارة</p>
            <h1 className="mt-1 text-2xl font-black text-zinc-950">التحقق بخطوتين</h1>
            <p className="mt-2 text-sm leading-7 text-zinc-600">
              استخدم تطبيق مصادقة موثوقًا لإكمال الدخول إلى أدوات الإدارة الحساسة.
            </p>
          </div>
        </Card.Header>

        <Card.Content className="space-y-5 p-6">
          {error ? (
            <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
              {error}
            </p>
          ) : null}

          {screen === 'loading' ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm font-bold text-zinc-600" role="status">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              جارٍ فحص إعدادات الحماية…
            </div>
          ) : null}

          {screen === 'enroll' && !enrollment ? (
            <section className="space-y-4" aria-labelledby="mfa-enroll-title">
              <div>
                <h2 id="mfa-enroll-title" className="text-lg font-black text-zinc-950">ربط تطبيق المصادقة</h2>
                <ol className="mt-3 list-decimal space-y-2 pe-5 text-sm leading-7 text-zinc-700">
                  <li>افتح تطبيق المصادقة على هاتفك.</li>
                  <li>امسح رمز QR أو أدخل المفتاح يدويًا.</li>
                  <li>اكتب الكود المؤقت للتأكيد.</li>
                </ol>
              </div>
              <Button type="button" variant="primary" onPress={startEnrollment} isDisabled={busy} className="w-full font-black">
                {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
                بدء التفعيل الآمن
              </Button>
            </section>
          ) : null}

          {enrollment ? (
            <section className="space-y-5" aria-labelledby="mfa-scan-title">
              <div className="text-center">
                <h2 id="mfa-scan-title" className="text-lg font-black text-zinc-950">امسح الرمز</h2>
                <div className="mx-auto mt-4 w-fit border border-zinc-200 bg-white p-3">
                  <Image src={enrollment.qrCode} alt="رمز QR لإضافة حساب الإدارة إلى تطبيق المصادقة" width={220} height={220} unoptimized />
                </div>
              </div>
              <div>
                <Label htmlFor="mfa-secret" className="text-sm font-bold text-zinc-800">المفتاح اليدوي</Label>
                <div className="mt-2 flex gap-2" dir="ltr">
                  <Input id="mfa-secret" readOnly value={enrollment.secret} className="min-h-11 flex-1 border border-zinc-300 bg-zinc-50 font-mono text-sm" />
                  <Button type="button" variant="outline" onPress={copySecret} aria-label="نسخ المفتاح اليدوي" className="min-h-11 px-3">
                    {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
                {copied ? <p className="mt-2 text-xs font-bold text-emerald-700">تم نسخ المفتاح.</p> : null}
              </div>
            </section>
          ) : null}

          {(screen === 'challenge' || enrollment) ? (
            <form className="space-y-4 border-t border-zinc-200 pt-5" onSubmit={verifyCode}>
              <div>
                <Label htmlFor="mfa-code" className="text-sm font-bold text-zinc-800">كود تطبيق المصادقة</Label>
                <Input
                  id="mfa-code"
                  name="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  dir="ltr"
                  className="mt-2 min-h-12 w-full border border-zinc-300 bg-white text-center font-mono text-xl tracking-[0.35em]"
                />
              </div>
              <Button type="submit" variant="primary" isDisabled={busy || code.length !== 6} className="w-full font-black">
                {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                تأكيد والدخول إلى الإدارة
              </Button>
            </form>
          ) : null}
        </Card.Content>
      </Card>
    </main>
  );
}
