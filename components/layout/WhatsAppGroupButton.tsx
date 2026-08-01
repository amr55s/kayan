'use client';

import { usePathname } from 'next/navigation';
import { trackSiteEvent } from '@/lib/analytics/client';
import { WHATSAPP_GROUP_URL } from '@/lib/community';

function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-7 fill-current"
    >
      <path d="M12.04 2a9.84 9.84 0 0 0-8.47 14.83L2 22l5.3-1.52A9.96 9.96 0 1 0 12.04 2Zm0 17.98a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.15.9.93-3.06-.2-.32A7.98 7.98 0 1 1 12.04 20Zm4.43-5.98c-.24-.12-1.44-.7-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.19a7.28 7.28 0 0 1-1.34-1.66c-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.59 4.11 3.63.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

export function WhatsAppGroupButton() {
  const pathname = usePathname();
  if (['/admin', '/merchant', '/driver', '/login'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )) return null;

  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackSiteEvent('support_click', {
        targetType: 'feature',
        targetKey: 'support_whatsapp',
      })}
      aria-label="الانضمام إلى جروب KAYAN CITY SPOT عبر واتساب"
      className="kayan-support-fab group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-3 z-50 inline-flex size-12 touch-manipulation items-center justify-center rounded-full border border-white/30 bg-emerald-600 p-0 text-white shadow-lg transition-[transform,background-color,box-shadow] hover:-translate-y-1 hover:bg-emerald-700 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 motion-reduce:transform-none sm:end-5 sm:size-auto sm:min-h-14 sm:gap-2.5 sm:py-2 sm:pe-4 sm:ps-2.5"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full text-white sm:size-10 sm:bg-white sm:text-emerald-600 sm:shadow-sm">
        <WhatsAppIcon />
      </span>
      <span className="hidden flex-col text-right leading-tight sm:flex">
        <strong className="text-sm font-black">جروب KAYAN CITY SPOT</strong>
        <span className="mt-0.5 text-[11px] font-semibold text-white/90">
          انضم عبر واتساب
        </span>
      </span>
    </a>
  );
}
