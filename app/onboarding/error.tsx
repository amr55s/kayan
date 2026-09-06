'use client';
import { Button } from '@heroui/react';
export default function OnboardingError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="dairtak-theme mx-auto max-w-xl p-6"><section className="dairtak-card p-6" role="alert">
    <h1 className="text-xl font-bold">تعذر تحميل رحلة نشاطك</h1><p className="my-4">لن نعرض صفحة فارغة بدل مسودتك. حاول مرة أخرى؛ إن استمرت المشكلة تواصل مع الإدارة.</p>
    <Button onPress={reset} className="dairtak-button">إعادة المحاولة</Button>
  </section></main>;
}
