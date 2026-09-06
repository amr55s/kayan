import { MerchantProductEditor } from '@/components/marketplace/merchant/product-editor';
import { saveMerchantProductAction } from '@/app/merchant/marketplace/actions';
import { createBlankMerchantProductEditor } from '@/lib/commerce/merchant-products';

export default async function NewMerchantProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewModel = await createBlankMerchantProductEditor(
    typeof params.store === 'string' ? params.store : null,
  );
  const retryKey = typeof params.retry === 'string' ? params.retry : '';
  if (/^[0-9a-f-]{36}$/iu.test(retryKey)) viewModel.idempotencyKey = retryKey;
  const error = typeof params.error === 'string' ? params.error : '';
  if (error) {
    viewModel.feedback = {
      status: 'error',
      message: error === 'invalid_input'
        ? 'راجع بيانات المنتج والمتغيرات. لا يُسمح بروابط أو أرقام تواصل داخل الوصف.'
        : 'تعذر حفظ المنتج الآن. حاول مرة أخرى.',
    };
  }
  return <MerchantProductEditor viewModel={viewModel} actions={{ saveProductAction: saveMerchantProductAction }} />;
}
