import Link from 'next/link';
import { ArrowRight, BookOpen, Share2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export function PublicPageHeader({
  current,
}: {
  current?: 'guide' | 'share';
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-5">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-black text-zinc-950"
          aria-label="العودة إلى دليل ديرتك"
        >
          <ArrowRight className="size-4" />
          <BrandLogo variant="full" className="h-9 w-auto max-w-[7.75rem] sm:h-10 sm:max-w-[8.75rem]" decorative />
        </Link>
        <nav className="flex items-center gap-1" aria-label="صفحات المساعدة">
          <Link
            href="/guide"
            aria-current={current === 'guide' ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
              current === 'guide' ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <BookOpen className="size-4" />
            الدليل
          </Link>
          <Link
            href="/share"
            aria-current={current === 'share' ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
              current === 'share' ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <Share2 className="size-4" />
            شارك ديرتك
          </Link>
        </nav>
      </div>
    </header>
  );
}
