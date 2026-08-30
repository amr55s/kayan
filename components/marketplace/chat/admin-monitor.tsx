'use client';

import { Alert, Button, Drawer, Label, TextArea, useOverlayState } from '@heroui/react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

export type MonitorQueueItem = {
  id: string;
  public_code: string;
  subject: string;
  status: string;
  last_message_at: string;
  report_count: number;
  risk_count: number;
};

export function MarketplaceChatAdminMonitor({
  items,
  moderate,
}: {
  items: readonly MonitorQueueItem[];
  moderate: (formData: FormData) => Promise<void>;
}) {
  const drawer = useOverlayState({ defaultOpen: false });
  const [selected, setSelected] = useState<MonitorQueueItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (item: MonitorQueueItem) => { setSelected(item); setError(null); drawer.open(); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try { await moderate(new FormData(form)); drawer.close(); } catch { setError('تعذر تسجيل إجراء المراجعة. حاول مرة أخرى.'); }
  };

  return <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.7fr)]" aria-label="مراقبة محادثات السوق">
    <aside className="rounded-[var(--dairtak-radius-card)] border border-[var(--dairtak-border)] bg-[var(--dairtak-surface)] p-3 shadow-sm">
      <h2 className="px-2 text-base font-bold text-[var(--dairtak-foreground)]">طابور المراجعة</h2>
      <p className="px-2 pb-3 text-sm text-[var(--dairtak-muted)]">قراءة ومراجعة موثقة فقط.</p>
      <form method="get" className="grid grid-cols-2 gap-2 px-2 pb-3" aria-label="فلاتر طابور المراجعة">
        <label className="text-xs">الدور<select name="role" className="mt-1 w-full rounded border p-1"><option value="">الكل</option><option value="customer">عميل</option><option value="merchant">تاجر</option><option value="driver">سائق</option><option value="admin">مسؤول</option></select></label>
        <label className="text-xs">الحالة<select name="status" className="mt-1 w-full rounded border p-1"><option value="">الكل</option><option value="open">مفتوحة</option><option value="paused">موقوفة</option><option value="closed">مغلقة</option></select></label>
        <label className="text-xs">المتجر<input name="storeId" inputMode="text" className="mt-1 w-full rounded border p-1" /></label>
        <label className="text-xs">الطلب<input name="orderId" inputMode="text" className="mt-1 w-full rounded border p-1" /></label>
        <label className="text-xs">السائق<input name="driverId" inputMode="text" className="mt-1 w-full rounded border p-1" /></label>
        <label className="text-xs">من<input name="from" type="datetime-local" className="mt-1 w-full rounded border p-1" /></label>
        <label className="text-xs">إلى<input name="to" type="datetime-local" className="mt-1 w-full rounded border p-1" /></label>
        <Button type="submit" size="sm" variant="secondary">تطبيق الفلاتر</Button>
      </form>
      <ul className="space-y-2" aria-label="المحادثات التي تحتاج مراجعة">
        {items.map((item) => <li key={item.id} className="rounded-xl border border-[var(--dairtak-border)] p-3">
          <Link href={`/admin/marketplace/chat/${item.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--dairtak-accent)]">
            <p className="font-semibold text-[var(--dairtak-foreground)]">{item.subject}</p>
            <p className="mt-1 text-xs text-[var(--dairtak-muted)]">{item.public_code} · {item.status}</p>
          </Link>
          <div className="mt-3 flex gap-2 text-xs text-[var(--dairtak-muted)]"><span>بلاغات: {item.report_count}</span><span>إشارات: {item.risk_count}</span></div>
          <Button className="mt-3" size="sm" variant="secondary" onPress={() => open(item)}>إجراء موثق</Button>
        </li>)}
      </ul>
    </aside>
    <div className="rounded-[var(--dairtak-radius-card)] border border-[var(--dairtak-border)] bg-[var(--dairtak-surface)] p-5 text-[var(--dairtak-muted)]">
      اختر محادثة لعرضها. لا تتاح أي كتابة أو انتحال هوية من شاشة المراقبة.
    </div>
    <Drawer state={drawer}>
      <Drawer.Backdrop isOpen={drawer.isOpen} onOpenChange={drawer.setOpen} variant="blur">
        <Drawer.Content placement="bottom">
          <Drawer.Dialog aria-label="إجراء مراجعة موثق" className="mx-auto w-full max-w-xl">
            <Drawer.Header><Drawer.Heading>إجراء مراجعة موثق</Drawer.Heading></Drawer.Header>
            <Drawer.Body>
              {error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>تعذر الحفظ</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert> : null}
              <form onSubmit={submit} className="space-y-4">
                <input type="hidden" name="conversationId" value={selected?.id ?? ''} />
                <Label htmlFor="moderation-reason" isRequired>سبب الإجراء</Label>
                <TextArea id="moderation-reason" name="reason" minLength={5} maxLength={500} required fullWidth rows={4} variant="secondary" />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" name="action" value="warn" variant="secondary">تنبيه</Button>
                  <Button type="submit" name="action" value="pause">إيقاف مؤقت</Button>
                  <Button type="submit" name="action" value="close" variant="danger">إغلاق</Button>
                  <Button type="submit" name="action" value="reopen" variant="secondary">إعادة فتح</Button>
                  <Button type="submit" name="action" value="review" variant="secondary">وضع قيد المراجعة</Button>
                  <Button type="submit" name="action" value="escalate_dispute" variant="secondary">تصعيد نزاع</Button>
                </div>
              </form>
            </Drawer.Body>
            <Drawer.Footer><Drawer.CloseTrigger>إلغاء</Drawer.CloseTrigger></Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  </section>;
}
