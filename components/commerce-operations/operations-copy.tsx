import styles from './commerce-operations.module.css';

const codCollectionStatusLabels: Record<string, string> = {
  pending: 'بانتظار التحصيل',
  collected: 'تم التحصيل',
  remitted: 'تم التوريد',
  failed: 'لم يُحصَّل',
  refunded: 'تم الرد',
  disputed: 'عليه خلاف',
};

const reconciliationStatusLabels: Record<string, string> = {
  open: 'مفتوحة',
  submitted: 'بانتظار المراجعة',
  accepted: 'مقبولة',
  rejected: 'مرفوضة',
};

const commissionStatusLabels: Record<string, string> = {
  draft: 'مسودة',
  issued: 'صادر',
  paid: 'مسدَّد',
  disputed: 'عليه نزاع',
  void: 'ملغي',
};

const supportStatusLabels: Record<string, string> = {
  open: 'مفتوحة',
  waiting_customer: 'بانتظار رد العميل',
  waiting_support: 'بانتظار رد الدعم',
  resolved: 'تم الحل',
  closed: 'مغلقة',
};

const commissionEntryTypeLabels: Record<string, string> = {
  earned: 'عمولة مستحقة',
  reversal: 'عكس عمولة (مرتجع)',
};

const orderEventTypeLabels: Record<string, string> = {
  'order.placed': 'تم إنشاء الطلب',
  'order.status_changed': 'تحديث حالة الطلب',
};

const fallback = (labels: Record<string, string>) => (value: string) => labels[value] ?? value;

export const codCollectionStatusLabel = fallback(codCollectionStatusLabels);
export const reconciliationStatusLabel = fallback(reconciliationStatusLabels);
export const commissionStatusLabel = fallback(commissionStatusLabels);
export const supportStatusLabel = fallback(supportStatusLabels);
export const commissionEntryTypeLabel = fallback(commissionEntryTypeLabels);
export const orderEventTypeLabel = fallback(orderEventTypeLabels);

/** Every `?notice=` / `?error=` code the operations actions can redirect with. */
const operationsMessages: Record<string, string> = {
  status_updated: 'تم تحديث حالة الطلب.',
  review_saved: 'تم حفظ تقييمك.',
  return_requested: 'تم إرسال طلب الإرجاع للمراجعة.',
  return_approved: 'تمت الموافقة على طلب الإرجاع.',
  return_rejected: 'تم رفض طلب الإرجاع مع حفظ السبب.',
  return_received: 'تم تسجيل استلام المرتجع وتطبيق التسوية المالية والمخزنية.',
  moderation_saved: 'تم حفظ قرار المراجعة.',
  category_review_saved: 'تم حفظ قرار القسم المقترح.',
  offer_accepted: 'تم قبول العرض وإسناد الطلب إليك. ستجده ضمن التوصيلات المسندة.',
  offer_declined: 'تم رفض العرض.',
  support_created: 'تم فتح محادثة الدعم وسنرد عليك داخل الموقع.',
  support_replied: 'تم إرسال ردك.',
  support_closed: 'تم إغلاق المحادثة.',
  reconciliation_created: 'تم إنشاء التسوية وإرسالها للمراجعة.',
  reconciliation_reviewed: 'تم حفظ قرار التسوية.',
  commission_updated: 'تم تحديث كشف العمولة.',

  reason_required: 'اكتب سبب الإجراء أولاً.',
  return_window_expired: 'انتهت مدة الإرجاع المتاحة لهذا الطلب.',
  return_quantity_exceeded: 'الكمية المطلوبة تتجاوز الكمية المتبقية القابلة للإرجاع.',
  return_category_excluded: 'سياسة فئة هذا المنتج لا تسمح بهذا النوع من الإرجاع.',
  return_request_failed: 'تعذر إنشاء طلب الإرجاع. راجع السبب والكميات والمدة المتاحة.',
  return_review_failed: 'تعذر حفظ قرار الإرجاع.',
  return_receive_failed: 'تعذر استلام المرتجع أو تسويته.',
  delivery_proof_required: 'يجب رفع إثبات التسليم قبل إغلاق الطلب.',
  cod_amount_mismatch: 'مبلغ التحصيل لا يطابق قيمة الطلب.',
  transition_not_allowed: 'هذا الإجراء غير متاح لحالة الطلب الحالية.',
  verified_purchase_required: 'التقييم متاح فقط بعد تسليم المنتج.',
  review_already_exists: 'تم تسجيل تقييم لهذا المنتج بالفعل. حدّث الصفحة لعرضه.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
  invalid_order_action: 'تعذر تنفيذ الإجراء على الطلب. أعد فتح صفحة الطلب وحاول مرة أخرى.',
  invalid_return_request: 'بيانات طلب الإرجاع غير مكتملة. اختر كمية واحدة على الأقل واكتب السبب.',
  invalid_return_review: 'بيانات قرار الإرجاع غير مكتملة. سبب الرفض مطلوب.',
  invalid_return_receipt: 'بيانات استلام المرتجع غير مكتملة.',
  invalid_review: 'بيانات التقييم غير صحيحة. اختر تقييمًا من ١ إلى ٥.',
  invalid_moderation: 'بيانات المراجعة غير مكتملة.',
  moderation_failed: 'تعذر حفظ قرار المراجعة. سبب الرفض مطلوب عند الرفض.',
  invalid_category_review: 'بيانات مراجعة القسم غير مكتملة.',
  category_slug_exists: 'رابط القسم مستخدم بالفعل. اختر رابطًا آخر أو ادمج الاقتراح مع القسم الموجود.',
  category_review_failed: 'تعذر حفظ قرار القسم المقترح.',
  invalid_offer: 'هذا العرض غير صالح. حدّث الصفحة لعرض العروض الحالية.',
  offer_expired: 'انتهت صلاحية العرض أو قبله كابتن آخر.',
  offer_failed: 'تعذر الرد على العرض الآن. حاول مرة أخرى.',
  invalid_support_message: 'اكتب موضوعًا ورسالة قبل الإرسال.',
  support_failed: 'تعذر إرسال رسالة الدعم الآن. حاول مرة أخرى.',
  invalid_reconciliation: 'بيانات التسوية غير مكتملة.',
  reconciliation_failed: 'تعذر تنفيذ التسوية الآن. حدّث الصفحة وحاول مرة أخرى.',
  invalid_commission_transition: 'بيانات تحديث الكشف غير مكتملة. الملاحظات مطلوبة عند النزاع أو الإلغاء.',
  commission_total_negative: 'لا يمكن أن يصبح إجمالي المستحق بالسالب.',
  commission_adjustment_locked: 'لا يمكن تعديل الكشف يدويًا بعد إصداره.',
  commission_transition_not_allowed: 'هذا الانتقال غير متاح لحالة الكشف الحالية.',
  commission_transition_failed: 'تعذر تحديث كشف العمولة الآن.',
};

export function operationsMessage(code?: string): string | undefined {
  return code ? operationsMessages[code] : undefined;
}

/** Outcome banner for the page an operations action redirected back to. */
export function OperationsFeedback({ notice, error }: { notice?: string; error?: string }) {
  const noticeText = operationsMessage(notice);
  const errorText = operationsMessage(error);
  return (
    <>
      {noticeText ? <p role="status" className={styles.notice}>{noticeText}</p> : null}
      {errorText ? <p role="alert" className={styles.error}>{errorText}</p> : null}
    </>
  );
}
