import type { ActivityKind, WorkspaceSummary } from './types';

export const activityOptions: ReadonlyArray<{ kind: ActivityKind; title: string; description: string }> = [
  { kind: 'store', title: 'متجر', description: 'اعرض منتجاتك واستقبل الطلبات في مكان واحد.' },
  { kind: 'restaurant', title: 'مطعم أو أكل بيتي', description: 'عرّف الناس بأكلك وجهّز أول صنف في المنيو.' },
  { kind: 'service', title: 'خدمة أو حرفة', description: 'اعرض خبرتك والخدمات التي تقدمها لأهل دائرتك.' },
  { kind: 'real_estate', title: 'عقارات', description: 'أضف عرض بيع أو إيجار ببيانات وصور واضحة.' },
  { kind: 'driver', title: 'كابتن توصيل', description: 'جهّز ملفك لاستقبال مهام التوصيل بعد المراجعة.' },
];

export const workspaceStatusLabels: Record<WorkspaceSummary['status'], string> = {
  draft: 'قيد التجهيز', pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'يحتاج تعديلًا', suspended: 'موقوف',
};

export const onboardingSteps = ['اختيار النشاط', 'البيانات الأساسية', 'تجهيز المحتوى', 'مراجعة وإرسال'] as const;

export function activityTitle(kind: ActivityKind): string {
  return activityOptions.find(option => option.kind === kind)?.title ?? 'النشاط';
}
