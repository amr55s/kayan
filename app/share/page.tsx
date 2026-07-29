import type { Metadata } from 'next';
import { PublicPageHeader } from '@/components/layout/PublicPageHeader';
import { GuideAnalytics } from '@/components/marketing/GuideAnalytics';
import { PublicShareHub } from '@/components/marketing/PublicShareHub';
import { fetchHomePageData } from '@/lib/supabase/queries';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'شارك كيان سيتي سبوت',
  description: 'بطاقات جاهزة لمشاركة الأماكن وكباتن التوصيل داخل المنطقة.',
};

export default async function SharePage() {
  const { places, drivers } = await fetchHomePageData();
  const sharePlaces = places.slice(0, 6).map(({ id, title, category }) => ({
    id,
    title,
    category,
  }));
  const shareDrivers = drivers.slice(0, 4).map(({ id, name, vehicle_type }) => ({
    id,
    name,
    vehicle_type,
  }));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <GuideAnalytics page="share" />
      <PublicPageHeader current="share" />
      <main id="main-content">
        <section className="border-b border-zinc-200 bg-zinc-950 px-4 py-12 text-center text-white sm:py-16">
          <p className="text-sm font-bold text-emerald-300">مشاركة واحدة ممكن تساعد جار أو محل أو كابتن</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
            اختار بطاقة وانشرها في جروب عمارتك
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300">
            كل بطاقة فيها QR ورابط مباشر للبيانات المحدثة. لا نعرض رقم الهاتف داخل التصميم.
          </p>
        </section>
        <div className="mx-auto max-w-7xl px-3 py-10 sm:px-6">
          <PublicShareHub places={sharePlaces} drivers={shareDrivers} />
        </div>
      </main>
    </div>
  );
}
