'use client';

export default function ServicesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="flex min-h-[70vh] items-center justify-center bg-white px-4 text-center">
      <div className="max-w-md border border-zinc-200 p-8">
        <h1 className="text-xl font-black">تعذر تحميل دليل الخدمات</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">حدث عطل مؤقت أثناء جلب البيانات. لم تُفقد أي معلومات.</p>
        <button type="button" onClick={reset} className="mt-5 min-h-11 bg-zinc-950 px-5 font-bold text-white">
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
