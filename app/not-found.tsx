import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main-content" className="dir-rtl flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-lg">
        <p className="text-sm font-black text-zinc-500">404</p>
        <h1 className="mt-2 text-balance text-2xl font-black text-zinc-950">
          الصفحة غير موجودة
        </h1>
        <p className="mt-3 text-pretty text-sm leading-7 text-zinc-600">
          ربما تغيّر الرابط. دليل الأماكن والخدمات ما زال متاحًا من الصفحة الرئيسية.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-black text-white hover:bg-zinc-800"
        >
          فتح دليل كيان
        </Link>
      </section>
    </main>
  );
}
