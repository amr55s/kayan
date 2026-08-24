'use server';

import { revalidatePath } from 'next/cache';
import type { MerchantExcelValidationViewModel } from '@/components/marketplace/merchant/view-models';
import {
  applyMerchantWorkbook,
  stageMerchantWorkbook,
} from '@/lib/commerce/merchant-excel';
import { MerchantCatalogError } from '@/lib/commerce/merchant-products';

function value(formData: FormData, name: string): string {
  const current = formData.get(name);
  return typeof current === 'string' ? current.trim() : '';
}

function failure(
  previous: MerchantExcelValidationViewModel,
  error: unknown,
): MerchantExcelValidationViewModel {
  const code = error instanceof MerchantCatalogError ? error.code : 'service_unavailable';
  const messages: Record<string, string> = {
    access_denied: 'ليست لديك صلاحية إدارة هذا المتجر.',
    conflict: 'تغيرت عملية الاستيراد بالفعل. حدّث الصفحة وراجع حالتها قبل المحاولة مجددًا.',
    invalid_input: 'الملف أو بيانات الطلب غير صالحة. استخدم ملف XLSX من القالب الحالي.',
    not_found: 'عملية الاستيراد غير موجودة أو لم تعد متاحة.',
    service_unavailable: 'تعذر إكمال العملية الآن. لم تُرسل أي كتابة مباشرة لقاعدة البيانات.',
  };
  return { ...previous, status: 'error', message: messages[code] ?? messages.service_unavailable! };
}

export async function processMerchantWorkbookAction(
  previousState: MerchantExcelValidationViewModel,
  formData: FormData,
): Promise<MerchantExcelValidationViewModel> {
  const intent = value(formData, 'intent');
  try {
    if (intent === 'validate-product-workbook') {
      const result = await stageMerchantWorkbook({
        storeId: value(formData, 'storeId'),
        fileId: value(formData, 'fileId'),
        filename: value(formData, 'filename'),
        byteSize: Number(value(formData, 'byteSize')),
        checksumSha256: value(formData, 'checksumSha256'),
        idempotencyKey: value(formData, 'idempotencyKey'),
      });
      revalidatePath('/merchant/marketplace/excel');
      return result;
    }
    if (intent === 'apply-product-workbook') {
      const result = await applyMerchantWorkbook({
        storeId: value(formData, 'storeId'),
        jobId: value(formData, 'jobId'),
        expectedUpdatedAt: value(formData, 'expectedUpdatedAt'),
      });
      revalidatePath('/merchant/marketplace');
      revalidatePath('/merchant/marketplace/excel');
      revalidatePath('/marketplace');
      return result;
    }
    throw new MerchantCatalogError('invalid_input');
  } catch (error) {
    return failure(previousState, error);
  }
}
