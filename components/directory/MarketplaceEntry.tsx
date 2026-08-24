import Link from 'next/link';
import { ArrowLeft, ShoppingBag } from 'lucide-react';

type MarketplaceEntryProps = {
  onOpen?: () => void;
};

export function MarketplaceEntry({ onOpen }: MarketplaceEntryProps) {
  return (
    <section
      aria-labelledby="marketplace-entry-title"
      className="relative isolate overflow-hidden rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-14 -top-16 -z-10 size-40 rounded-full bg-orange-100/70 blur-3xl motion-reduce:hidden"
      />
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-black text-[var(--dairtak-orange-deep)]">
            <ShoppingBag className="size-4" aria-hidden="true" />
            متجر ديرتك
          </div>
          <h2 id="marketplace-entry-title" className="text-xl font-black leading-tight text-zinc-950 sm:text-2xl">
            منتجات متاجر منطقتك داخل ديرتك
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-zinc-700 sm:text-base">
            تصفح واطلب وتابع التوصيل من نفس الحساب.
          </p>
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
