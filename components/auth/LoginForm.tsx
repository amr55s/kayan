'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { ArrowRight, KeyRound, Phone, UserPlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeInitialPassword, loginWithPhone } from '@/lib/auth/actions';
import { isEgyptianPhone } from '@/lib/auth/phone';
import Link from 'next/link';

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
    <main className="dir-rtl flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8 text-white">
      <Card className="w-full max-w-md border border-zinc-800 bg-zinc-900 text-white shadow-2xl">
        <CardHeader className="flex flex-col items-center gap-3 pb-2 text-center">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg">
            <Image
              src="/kayan-services-logo.png"
              alt="شعار KAYAN CITY SPOT"
              width={80}
              height={80}
              className="size-20 object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-xl font-black">دخول KAYAN CITY SPOT</h1>
            <p className="mt-1 text-sm text-zinc-400">للكباتن وأصحاب الأنشطة والإدارة</p>
          </div>
        </CardHeader>
        <CardBody>
          <form className="space-y-4" onSubmit={submit}>
            {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
            {!changePassword && (
              <Input
                isRequired
                name="phone"
                autoComplete="tel"
                type="tel"
                label="رقم الهاتف"
                placeholder="01012345678"
                value={phone}
                onValueChange={setPhone}
                startContent={<Phone className="size-4 text-zinc-400" />}
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
              startContent={<KeyRound className="size-4 text-zinc-400" />}
            />
            {changePassword && (
              <Input isRequired name="confirm-password" autoComplete="new-password" type="password" label="تأكيد كلمة المرور" value={confirmPassword} onValueChange={setConfirmPassword} />
            )}
            <Button type="submit" isLoading={loading} className="w-full bg-white font-extrabold text-zinc-950">
              {changePassword ? 'حفظ كلمة المرور' : 'تسجيل الدخول'}
            </Button>
            {!changePassword && (
              <div className="border-t border-zinc-800 pt-4 text-center">
                <p className="mb-2 text-xs text-zinc-400">لسه معندكش تسجيل؟</p>
                <Button
                  as={Link}
                  href="/?register=join"
                  startContent={<UserPlus className="size-4" />}
                  className="w-full border border-zinc-700 bg-zinc-800 text-sm font-bold text-white hover:bg-zinc-700"
                >
                  إنشاء تسجيل جديد
                </Button>
              </div>
            )}
            <Link href="/" className="flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white">
              <ArrowRight className="size-4" />
              العودة إلى كيان سيتي سبوت
            </Link>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
