'use client';

import { FormEvent, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { ArrowRight, KeyRound, Phone, ShieldCheck, UserPlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeInitialPassword, loginWithPhone } from '@/lib/auth/actions';
import { isEgyptianPhone } from '@/lib/auth/phone';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/brand';
import { BrandLogo } from '@/components/layout/BrandLogo';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const changePassword = searchParams.get('change-password') === '1';
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (changePassword) {
        if (password !== confirmPassword) throw new Error('كلمتا المرور غير متطابقتين.');
        const result = await completeInitialPassword(password);
        if (!result.success) throw new Error(result.message);
        router.replace(result.destination);
        router.refresh();
        return;
      }

      if (!isEgyptianPhone(phone)) {
        throw new Error('أدخل رقم هاتف مصري صحيحاً.');
      }
      const result = await loginWithPhone({
        phone,
        password,
      });
      if (!result.success) throw new Error(result.message);
      router.replace(result.destination);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dir-rtl relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-white via-zinc-50 to-zinc-200/70 px-4 py-10 text-zinc-900">
      {/* Decorative ambient light gradients */}
      <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-orange-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-zinc-300/35 blur-3xl" />

      <Card className="relative z-10 w-full max-w-md rounded-[32px] border border-zinc-200/80 bg-white/90 p-2 text-zinc-900 shadow-2xl shadow-zinc-200/60 backdrop-blur-xl sm:p-4">
        <CardHeader className="flex flex-col items-center gap-3 pb-2 text-center pt-6 sm:pt-8">
          <div className="flex h-24 w-full max-w-[19rem] items-center justify-center overflow-hidden rounded-2xl bg-white px-4 shadow-md ring-1 ring-zinc-200/80">
            <BrandLogo variant="full" className="h-auto w-full" priority />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-0.5 text-[11px] font-bold text-zinc-800">
              <ShieldCheck className="size-3.5 text-[var(--dairtak-orange-deep)]" aria-hidden="true" />
              <span>منصة ديرتك</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-950">
              {changePassword ? 'تغيير كلمة المرور' : `دخول ${SITE_NAME}`}
            </h1>
            <p className="text-xs font-semibold text-zinc-500">
              {changePassword
                ? 'يرجى تعيين كلمة مرور جديدة لحسابك'
                : 'بوابة الكباتن وأصحاب المحلات والإدارة'}
            </p>
          </div>
        </CardHeader>
        <CardBody className="px-4 py-6 sm:px-6">
          <form className="space-y-4" onSubmit={submit}>
            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-bold text-rose-700 shadow-xs"
              >
                {error}
              </p>
            )}
            {!changePassword && (
              <Input
                isRequired
                name="phone"
                autoComplete="tel"
                type="tel"
                inputMode="tel"
                label="رقم الهاتف"
                placeholder="01012345678"
                value={phone}
                onValueChange={setPhone}
                startContent={<Phone className="size-4 text-zinc-400" aria-hidden="true" />}
                classNames={{
                  label: 'text-xs font-bold text-zinc-700',
                  inputWrapper:
                    'bg-zinc-50 border-zinc-200 focus-within:!border-zinc-500 focus-within:!bg-white rounded-2xl shadow-xs transition-colors',
                }}
              />
            )}
            <Input
              isRequired
              name={changePassword ? 'new-password' : 'password'}
              autoComplete={changePassword ? 'new-password' : 'current-password'}
              type="password"
              label={changePassword ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
              value={password}
              onValueChange={setPassword}
              startContent={<KeyRound className="size-4 text-zinc-400" aria-hidden="true" />}
              classNames={{
                label: 'text-xs font-bold text-zinc-700',
                inputWrapper:
                  'bg-zinc-50 border-zinc-200 focus-within:!border-zinc-500 focus-within:!bg-white rounded-2xl shadow-xs transition-colors',
              }}
            />
            {changePassword && (
              <Input
                isRequired
                name="confirm-password"
                autoComplete="new-password"
                type="password"
                label="تأكيد كلمة المرور"
                value={confirmPassword}
                onValueChange={setConfirmPassword}
                startContent={<KeyRound className="size-4 text-zinc-400" aria-hidden="true" />}
                classNames={{
                  label: 'text-xs font-bold text-zinc-700',
                  inputWrapper:
                    'bg-zinc-50 border-zinc-200 focus-within:!border-zinc-500 focus-within:!bg-white rounded-2xl shadow-xs transition-colors',
                }}
              />
            )}

            <Button
              type="submit"
              isLoading={loading}
              className="mt-2 min-h-12 w-full rounded-2xl bg-zinc-950 font-black text-white shadow-lg shadow-zinc-950/10 transition-[background-color,transform,box-shadow] hover:bg-zinc-800 active:scale-[0.99] motion-reduce:transform-none"
            >
              {changePassword ? 'حفظ كلمة المرور' : 'تسجيل الدخول'}
            </Button>

            {!changePassword && (
              <div className="space-y-3 border-t border-zinc-100 pt-5 text-center">
                <p className="text-xs font-semibold text-zinc-500">ليس لديك حساب بعد؟</p>
                <Button
                  as={Link}
                  href="/?register=join"
                  startContent={<UserPlus className="size-4 text-zinc-700" aria-hidden="true" />}
                  className="min-h-11 w-full rounded-2xl border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-900 transition-colors hover:bg-zinc-100"
                >
                  تقديم طلب انضمام جديد
                </Button>
              </div>
            )}

            <div className="pt-2 text-center">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-bold text-zinc-500 transition-colors hover:text-zinc-950"
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                العودة إلى الصفحة الرئيسية
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
