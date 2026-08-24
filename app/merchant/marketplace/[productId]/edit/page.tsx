import { notFound } from 'next/navigation';
import { MerchantProductEditor } from '@/components/marketplace/merchant/product-editor';
import {
  deleteMerchantProductImageAction,
  reorderMerchantProductImagesAction,
  saveMerchantProductAction,
  submitMerchantProductForReviewAction,
  undoMerchantProductImageDeletionAction,
} from '@/app/merchant/marketplace/actions';
import { fetchMerchantProductEditor } from '@/lib/commerce/merchant-products';

const notices: Record<string, string> = {
  created: 'تم إنشاء مسودة المنتج. يمكنك الآن إضافة الصور ثم إرسالها للمراجعة.',
  updated: 'تم حفظ بيانات المنتج والمخزون.',
  submitted: 'تم إرسال المنتج للمراجعة.',
  images_reordered: 'تم حفظ ترتيب الصور.',
  image_deleted: 'تم حذف الصورة من المنتج. يمكنك التراجع خلال المهلة الظاهرة.',
  image_restored: 'تم التراجع عن حذف الصورة واستعادتها.',
};
const errors: Record<string, string> = {
  access_denied: 'لا تملك صلاحية تعديل هذا المنتج.',
  conflict: 'تغيّر المنتج أو الصور في جلسة أخرى. حدّث الصفحة ثم أعد التعديل.',
  invalid_input: 'راجع الحقول والمتغيرات والأسعار والمخزون. لا يُسمح ببيانات تواصل خارجية.',
  not_found: 'المنتج أو الصورة المطلوبة غير موجودة.',
  service_unavailable: 'تعذر تنفيذ العملية الآن. حاول مرة أخرى.',
};

export default async function EditMerchantProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const viewModel = await fetchMerchantProductEditor(productId);
  if (!viewModel) notFound();
  const retryKey = typeof query.retry === 'string' ? query.retry : '';
  if (/^[0-9a-f-]{36}$/iu.test(retryKey)) viewModel.idempotencyKey = retryKey;
  const notice = typeof query.notice === 'string' ? notices[query.notice] : null;
  const error = typeof query.error === 'string' ? errors[query.error] : null;
  if (notice) viewModel.feedback = { status: 'success', message: notice };
  if (error) viewModel.feedback = { status: 'error', message: error };

  return (
    <MerchantProductEditor
      viewModel={viewModel}
      actions={{
        saveProductAction: saveMerchantProductAction,
        submitForReviewAction: submitMerchantProductForReviewAction,
        reorderImagesAction: reorderMerchantProductImagesAction,
        deleteImageAction: deleteMerchantProductImageAction,
        undoDeleteImageAction: undoMerchantProductImageDeletionAction,
      }}
    />
  );
}
