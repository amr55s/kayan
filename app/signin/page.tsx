import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { safeNextPath } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/layout/BrandLogo';

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_24px_70px_-45px_rgba(0,0,0,.55)] sm:p-8" aria-labelledby="signin-title">
        <Link href="/" aria-label="العودة إلى ديرتك" className="mx-auto flex h-20 max-w-[250px] items-center justify-center overflow-hidden rounded-2xl bg-white px-3 ring-1 ring-zinc-200">
          <BrandLogo variant="full" className="h-auto w-full" priority />
        </Link>
        <h1 id="signin-title" className="mt-6 text-2xl font-black text-zinc-950">دخول واحد لكل ديرتك</h1>
        <p className="mt-3 text-sm leading-7 text-zinc-600">
          ادخل بجوجل للشراء أو لتقديم طلب تاجر أو كابتن. سنستخدم الاسم والبريد لتقليل الخطوات، ولن نمنح أي صلاحية تشغيلية قبل المراجعة.
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
