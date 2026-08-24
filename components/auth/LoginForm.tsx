'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
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
    <main id="main-content" className="dir-rtl flex min-h-screen w-full items-center justify-center bg-zinc-100 px-4 py-10 text-zinc-900">
      <Card className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-lg sm:p-4">
        <Card.Header className="flex flex-col items-center gap-3 pb-2 pt-6 text-center sm:pt-8">
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
        </Card.Header>
        <Card.Content className="px-4 py-6 sm:px-6">
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
              <div className="space-y-1.5">
                <Label htmlFor="login-phone" className="text-xs font-bold text-zinc-700">رقم الهاتف</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                  <Input id="login-phone" required name="phone" autoComplete="tel" type="tel" inputMode="tel" placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value)} className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 ps-10 text-base outline-none focus:border-zinc-500 focus:bg-white focus:ring-2 focus:ring-zinc-950/10" />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-xs font-bold text-zinc-700">{changePassword ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                <Input id="login-password" required name={changePassword ? 'new-password' : 'password'} autoComplete={changePassword ? 'new-password' : 'current-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 ps-10 text-base outline-none focus:border-zinc-500 focus:bg-white focus:ring-2 focus:ring-zinc-950/10" />
              </div>
            </div>
            {changePassword && (
              <div className="space-y-1.5">
                <Label htmlFor="login-confirm-password" className="text-xs font-bold text-zinc-700">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                  <Input id="login-confirm-password" required name="confirm-password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 ps-10 text-base outline-none focus:border-zinc-500 focus:bg-white focus:ring-2 focus:ring-zinc-950/10" />
                </div>
              </div>
            )}

            <Button
              type="submit"
              isPending={loading}
              isDisabled={loading}
              className="mt-2 min-h-12 w-full rounded-2xl bg-zinc-950 font-black text-white shadow-lg shadow-zinc-950/10 transition-[background-color,transform,box-shadow] hover:bg-zinc-800 active:scale-[0.99] motion-reduce:transform-none"
            >
              {changePassword ? 'حفظ كلمة المرور' : 'تسجيل الدخول'}
            </Button>

            {!changePassword && (
              <div className="space-y-3 border-t border-zinc-100 pt-5 text-center">
                <p className="text-xs font-semibold text-zinc-500">ليس لديك حساب بعد؟</p>
                <Link href="/?register=join" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950">
                  <UserPlus className="size-4 text-zinc-700" aria-hidden="true" />
                  تقديم طلب انضمام جديد
                </Link>
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
        </Card.Content>
      </Card>
    </main>
  );
}
