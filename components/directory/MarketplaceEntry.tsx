import Link from 'next/link';
import { ArrowLeft, ShieldCheck, ShoppingBag, Store, Truck } from 'lucide-react';

type MarketplaceEntryProps = {
  onOpen?: () => void;
};

export function MarketplaceEntry({ onOpen }: MarketplaceEntryProps) {
  return (
    <section
      aria-labelledby="marketplace-entry-title"
      className="relative isolate overflow-hidden rounded-[26px] border border-orange-200 bg-orange-50 p-4 shadow-[0_18px_50px_-36px_rgba(234,88,12,.8)] sm:rounded-[30px] sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-16 -top-20 -z-10 size-52 rounded-full bg-orange-200/60 blur-3xl motion-reduce:hidden"
      />
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-xs font-black text-orange-800">
            <ShoppingBag className="size-4" aria-hidden="true" />
            متجر ديرتك
          </div>
          <h2 id="marketplace-entry-title" className="text-xl font-black leading-tight text-zinc-950 sm:text-2xl">
            اشتري من متاجر منطقتك من غير ما تخرج من ديرتك
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-zinc-700 sm:text-base">
            تصفح المنتجات، ضيف للسلة، تابع طلبك واستلمه بالدفع عند الاستلام داخل تجربة واحدة واضحة وآمنة.
          </p>

          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-700" aria-label="مميزات متجر ديرتك">
            <li className="inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-white px-3 py-2">
              <Store className="size-4 text-orange-600" aria-hidden="true" /> متاجر محلية موثقة
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-white px-3 py-2">
              <Truck className="size-4 text-orange-600" aria-hidden="true" /> توصيل ومتابعة الطلب
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-white px-3 py-2">
              <ShieldCheck className="size-4 text-orange-600" aria-hidden="true" /> شراء آمن داخل الموقع
            </li>
          </ul>
        </div>

        <Link
          href="/marketplace"
          onClick={onOpen}
          className="group inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-zinc-950/15 transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 active:translate-y-0 lg:w-auto motion-reduce:transform-none motion-reduce:transition-none"
        >
          ادخل المتجر
          <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
