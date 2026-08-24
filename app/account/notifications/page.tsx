import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { PushPreferences } from '@/components/marketplace/push-preferences';
import {
  countMyUnreadMarketplaceNotifications,
  listMyMarketplaceNotifications,
  MarketplaceNotificationError,
} from '@/lib/commerce/notifications';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from './actions';

export const dynamic = 'force-dynamic';

const notificationDateFormatter = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

function formatDate(value: string) {
  return notificationDateFormatter.format(new Date(value));
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; id?: string }>;
}) {
  const query = await searchParams;
  const cursor = query.before && query.id
    && Number.isFinite(Date.parse(query.before))
    && /^[0-9a-f-]{36}$/iu.test(query.id)
    ? { createdAt: query.before, id: query.id }
    : undefined;
  let page;
  let unread = 0;
  try {
    [page, unread] = await Promise.all([
      listMyMarketplaceNotifications(30, cursor),
      countMyUnreadMarketplaceNotifications(),
    ]);
  } catch (error) {
    if (error instanceof MarketplaceNotificationError && ['28000', 'authentication_required'].includes(error.code)) {
      redirect('/signin?next=%2Faccount%2Fnotifications');
    }
    throw error;
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8" dir="rtl">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-500">حسابك</p>
          <h1 className="mt-1 text-2xl font-black text-zinc-950">الإشعارات</h1>
          <p className="mt-2 text-sm text-zinc-600">كل تحديثات الطلبات والدعم والتوصيل في مكان واحد داخل الموقع.</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip.Root size="sm"><Chip.Label>{unread} غير مقروء</Chip.Label></Chip.Root>
          {unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">تعليم الكل كمقروء</Button>
            </form>
          ) : null}
        </div>
      </header>

      <PushPreferences />

      <section aria-label="قائمة الإشعارات" className="space-y-3">
        {page.items.length === 0 ? (
          <Card.Root className="border border-zinc-200 bg-white shadow-none">
            <Card.Content className="p-8 text-center text-sm text-zinc-600">لا توجد إشعارات حتى الآن.</Card.Content>
          </Card.Root>
        ) : page.items.map((notification) => {
          const href = notification.data?.href ?? '/account/notifications';
          return (
            <Card.Root key={notification.id} className={`border shadow-none ${notification.read_at ? 'border-zinc-200 bg-white' : 'border-zinc-400 bg-zinc-50'}`}>
              <Card.Content className="space-y-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold text-zinc-950">{notification.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">{notification.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-zinc-500" dateTime={notification.created_at}>{formatDate(notification.created_at)}</time>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={href} className="text-sm font-bold text-zinc-950 underline underline-offset-4">فتح التفاصيل</Link>
                  {!notification.read_at ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <Button type="submit" variant="ghost" size="sm">تمت القراءة</Button>
                    </form>
                  ) : null}
                </div>
              </Card.Content>
            </Card.Root>
          );
        })}
      </section>
      {page.next_cursor ? (
        <div className="flex justify-center">
          <Link
            href={`/account/notifications?before=${encodeURIComponent(page.next_cursor.created_at)}&id=${encodeURIComponent(page.next_cursor.id)}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-950"
          >
            إشعارات أقدم
          </Link>
        </div>
      ) : null}
    </main>
  );
}
