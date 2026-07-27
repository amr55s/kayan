const WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/HFRuGccY946F74VnYDjbVO?mode=gi_t';

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
  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="الانضمام إلى جروب واتساب كيان سيتي سبوت للتواصل والاقتراحات"
      className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] end-3 z-50 inline-flex min-h-14 items-center gap-2.5 rounded-full border border-white/30 bg-[#25D366] py-2 pe-4 ps-2.5 text-white shadow-[0_12px_35px_rgba(37,211,102,0.38)] transition-[transform,background-color,box-shadow] hover:-translate-y-1 hover:bg-[#20bd5a] hover:shadow-[0_16px_40px_rgba(37,211,102,0.48)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 motion-reduce:transform-none sm:end-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[#20bd5a] shadow-sm">
        <WhatsAppIcon />
      </span>
      <span className="flex flex-col text-right leading-tight">
        <strong className="text-sm font-black">جروب واتساب</strong>
        <span className="mt-0.5 text-[11px] font-semibold text-white/90">
          للتواصل والاقتراحات
        </span>
      </span>
    </a>
  );
}
