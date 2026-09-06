'use client';
import { useState } from 'react';
import { Button, Card } from '@heroui/react';

/** Informational only: dismissal never changes onboarding/approval permissions. */
export function WorkspaceGuide({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const id = `workspace-guide-${userId}`;
  return <div className="my-4">
    <Button variant="secondary" className="dairtak-button-secondary" aria-expanded={open} aria-controls={id} onPress={() => setOpen(value => !value)}>{open ? 'إخفاء الجولة' : 'كيف أبدأ؟ جولة سريعة'}</Button>
    {open ? <Card id={id} className="dairtak-card mt-3 p-5">
      <h2 className="text-lg font-bold">خطوتك الجاية واضحة</h2>
      <ol className="my-3 list-inside list-decimal space-y-3 leading-7">
        <li>افتح مساحة نشاطك المعتمد من القائمة؛ كل نشاط مستقل عن الآخر.</li>
        <li>راجع بيانات النشاط والتواصل، ثم أكمل الكتالوج أو ملف التوصيل حسب نشاطك.</li>
        <li>مسودة المنتج ليست منشورة. أرسل المتجر والمنتجات للمراجعة عند اكتمالها.</li>
        <li>تابع الطلبات والمحادثات من لوحة النشاط، وارجع هنا للتبديل أو إضافة نشاط.</li>
      </ol>
      <Button variant="ghost" onPress={() => setOpen(false)}>تمام، سأكمل بنفسي</Button>
    </Card> : null}
  </div>;
}
