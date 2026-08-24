import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MapPin, Search } from 'lucide-react';
import { fetchPublicServices } from '@/lib/services/queries';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'دليل الخدمات المحلية | ديرتك',
  description: 'اكتشف المتاجر والخدمات المحلية في منطقتك من دليل ديرتك.',
  alternates: { canonical: '/services' },
  openGraph: {
    title: 'دليل الخدمات المحلية | ديرتك',
    description: 'اكتشف المتاجر والخدمات المحلية في منطقتك من دليل ديرتك.',
    url: '/services',
    type: 'website',
  },
};

const categories = [
  ['all', 'الكل'],
  ['restaurants', 'مطاعم'],
  ['stores', 'متاجر'],
  ['home_made', 'منتجات منزلية'],
  ['market', 'بقالة'],
  ['veggies', 'خضروات وفاكهة'],
  ['pharmacy', 'صيدليات'],
  ['crafts', 'حرف'],
  ['services', 'خدمات'],
] as const;
const allowedCategories = new Set(categories.map(([value]) => value));

function hrefFor(input: { category: string; page?: number; query?: string }) {
  const params = new URLSearchParams();
  if (input.category !== 'all') params.set('category', input.category);
  if (input.query) params.set('q', input.query);
  if ((input.page ?? 1) > 1) params.set('page', String(input.page));
  const suffix = params.toString();
  return `/services${suffix ? `?${suffix}` : ''}`;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawCategory = typeof params.category === 'string' ? params.category : 'all';
  const category = allowedCategories.has(rawCategory as (typeof categories)[number][0])
    ? rawCategory
    : 'all';
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 80) : '';
  const requestedPage = typeof params.page === 'string' ? Number.parseInt(params.page, 10) : 1;
  const page = Number.isSafeInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), 1_000) : 1;
  const result = await fetchPublicServices({ category, page, query });
  const currentPage = Math.min(page, result.pageCount);

  return (
    <main id="main-content" className="min-h-screen bg-white text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold text-orange-700">ديرتك</p>
            <h1 className="text-xl font-black">دليل الخدمات المحلية</h1>
          </div>
          <Link href="/marketplace" className="min-h-11 border border-zinc-300 px-4 py-3 text-sm font-bold hover:bg-zinc-50">
            انتقل إلى المتجر
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <form role="search" className="flex gap-2" action="/services">
          {category !== 'all' ? <input type="hidden" name="category" value={category} /> : null}
          <label className="relative flex-1">
            <span className="sr-only">ابحث باسم المكان أو الخدمة</span>
            <Search className="pointer-events-none absolute start-3 top-3.5 size-5 text-zinc-500" aria-hidden="true" />
            <input
              name="q"
              defaultValue={query}
              maxLength={80}
              className="min-h-12 w-full border border-zinc-300 bg-white pe-4 ps-11 text-sm outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
              placeholder="ابحث باسم المكان أو الخدمة"
            />
          </label>
          <button className="min-h-12 bg-zinc-950 px-5 text-sm font-black text-white hover:bg-zinc-800" type="submit">
            بحث
          </button>
        </form>

        <nav aria-label="تصنيفات الخدمات" className="flex gap-2 overflow-x-auto pb-1">
          {categories.map(([value, label]) => (
            <Link
              key={value}
              href={hrefFor({ category: value, query })}
              aria-current={category === value ? 'page' : undefined}
              className={`min-h-11 shrink-0 border px-4 py-3 text-sm font-bold ${
                category === value
                  ? 'border-zinc-950 bg-zinc-950 text-white'
                  : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-zinc-600">{result.total.toLocaleString('ar-EG')} نتيجة</p>
        {result.items.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((item) => (
              <article key={item.id} className="border border-zinc-200 bg-white">
                <div className="relative aspect-[4/3] bg-zinc-100">
                  {item.images[0] ? (
                    <Image
                      src={item.images[0]}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-bold text-zinc-500">لا توجد صورة</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-black">{item.title}</h2>
                    {item.isFeatured ? <span className="bg-orange-100 px-2 py-1 text-[11px] font-bold text-orange-800">مميز</span> : null}
                  </div>
                  {item.description ? <p className="line-clamp-2 text-sm leading-6 text-zinc-600">{item.description}</p> : null}
                  {item.address ? (
                    <p className="flex items-start gap-2 text-xs leading-5 text-zinc-600">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {item.address}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="border border-zinc-200 bg-zinc-50 p-8 text-center">
            <h2 className="font-black">لا توجد نتائج مطابقة</h2>
            <p className="mt-2 text-sm text-zinc-600">جرّب كلمة بحث أو تصنيفًا آخر.</p>
          </div>
        )}

        {result.pageCount > 1 ? (
          <nav aria-label="صفحات النتائج" className="flex items-center justify-center gap-2 pt-4">
            <Link
              aria-disabled={currentPage <= 1}
              tabIndex={currentPage <= 1 ? -1 : undefined}
              href={hrefFor({ category, query, page: Math.max(1, currentPage - 1) })}
              className={`min-h-11 border px-4 py-3 text-sm font-bold ${currentPage <= 1 ? 'pointer-events-none border-zinc-200 text-zinc-400' : 'border-zinc-300 hover:bg-zinc-50'}`}
            >
              السابق
            </Link>
            <span className="px-3 text-sm font-bold">{currentPage.toLocaleString('ar-EG')} من {result.pageCount.toLocaleString('ar-EG')}</span>
            <Link
              aria-disabled={currentPage >= result.pageCount}
              tabIndex={currentPage >= result.pageCount ? -1 : undefined}
              href={hrefFor({ category, query, page: Math.min(result.pageCount, currentPage + 1) })}
              className={`min-h-11 border px-4 py-3 text-sm font-bold ${currentPage >= result.pageCount ? 'pointer-events-none border-zinc-200 text-zinc-400' : 'border-zinc-300 hover:bg-zinc-50'}`}
            >
              التالي
            </Link>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
