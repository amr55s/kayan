import Link from 'next/link';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { safeNextPath } from '@/lib/auth/safe-next';

export const dynamic = 'force-dynamic';

const errors: Record<string, string> = {
  oauth_callback: 'لم تكتمل استجابة Google. ابدأ تسجيل الدخول مرة أخرى.',
  profile_setup: 'تم تسجيل الدخول، لكن تعذر تجهيز حساب المتجر أو استعادة السلة. حاول مرة أخرى.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  const errorCode = typeof params.error === 'string' ? params.error : '';

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10">
      <section className="w-full max-w-md border border-zinc-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="signin-title">
        <p className="text-sm font-black text-orange-700">ديرتك</p>
        <h1 id="signin-title" className="mt-2 text-2xl font-black text-zinc-950">تسجيل دخول العميل</h1>
        <p className="mt-3 text-sm leading-7 text-zinc-600">
          سجّل بجوجل لإتمام الطلب وربط السلة بحسابك. لا تظهر بيانات التسليم إلا للمسؤول عن تنفيذ الطلب وفي الوقت اللازم.
        </p>
        {errors[errorCode] ? <p role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{errors[errorCode]}</p> : null}
        <div className="mt-6"><GoogleSignInButton next={next} /></div>
        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-5 text-sm font-bold">
          <Link href="/marketplace" className="text-zinc-700 underline-offset-4 hover:underline">العودة إلى المتجر</Link>
          <Link href="/login" className="text-zinc-700 underline-offset-4 hover:underline">دخول فريق التشغيل</Link>
        </div>
      </section>
    </main>
  );
}
