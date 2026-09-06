import { Badge } from '@heroui/react/badge';
import Link from 'next/link';
import { listConversations } from '@/lib/commerce/chat/service';

const chatHref = {
  customer: '/account/chat',
  merchant: '/merchant/marketplace/chat',
  driver: '/driver/marketplace/chat',
  admin: '/admin/marketplace/chat',
} as const;

/** A fail-closed convenience link: its page still owns the durable role guard. */
export async function ChatInboxNavigation({ role }: { role: keyof typeof chatHref }) {
  let unread = 0;
  try {
    const page = await listConversations({ limit: 30 });
    unread = page.items.reduce((total, item) => total + item.unreadCount, 0);
  } catch {
    // Navigation cannot turn a transient chat failure into an account-layout failure.
  }
  return (
    <nav aria-label="رسائل المنصة" dir="rtl" className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-3 sm:px-6">
      <Link href={chatHref[role]} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950">
        <span>الرسائل</span>
        {unread > 0 ? <Badge.Root aria-label={`${unread} رسالة غير مقروءة`}><Badge.Label>{Math.min(unread, 99)}</Badge.Label></Badge.Root> : null}
      </Link>
    </nav>
  );
}
