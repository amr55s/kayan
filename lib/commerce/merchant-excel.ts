import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  MerchantExcelJobViewModel,
  MerchantExcelValidationViewModel,
} from '@/components/marketplace/merchant/view-models';
import {
  PRODUCT_WORKBOOK_LIMITS,
  createProductWorkbook,
  parseProductWorkbook,
  type ProductExportRecord,
  type ProductImportIssue,
  type ProductImportPlan,
} from '@/lib/commerce/excel';
import { MerchantCatalogError, resolveMerchantStore } from '@/lib/commerce/merchant-products';
import {
  getPrivateMediaBucketName,
  headPrivateMediaObject,
  readPrivateMediaObject,
} from '@/lib/media/spaces';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const databaseInteger = z.union([z.number().int(), z.string().regex(/^\d+$/u)]);
const importStatus = z.enum([
  'uploaded', 'validating', 'ready', 'processing', 'completed', 'failed', 'cancelled',
]);
const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const beginResponseSchema = z.object({
  job_id: uuid,
  status: importStatus,
  total_rows: z.number().int().nonnegative(),
  valid_rows: z.number().int().nonnegative(),
  invalid_rows: z.number().int().nonnegative(),
  idempotent: z.boolean(),
});

const jobSchema = z.object({
  job_id: uuid,
  store_id: uuid,
  source_filename: z.string().min(1).max(255),
  status: importStatus,
  total_rows: z.number().int().nonnegative(),
  valid_rows: z.number().int().nonnegative(),
  invalid_rows: z.number().int().nonnegative(),
  applied_rows: z.number().int().nonnegative(),
  error_summary: z.array(z.unknown()),
  result: z.record(z.string(), z.unknown()),
  created_at: timestamp,
  updated_at: timestamp,
  completed_at: timestamp.nullable(),
  row_counts: z.record(z.string(), z.number().int().nonnegative()),
});

const exportPageSchema = z.object({
  store_id: uuid,
  total: z.number().int().nonnegative().max(PRODUCT_WORKBOOK_LIMITS.maxProducts),
  limit: z.number().int().positive().max(500),
  offset: z.number().int().nonnegative(),
  products: z.array(z.object({
    product_key: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    category_id: uuid.nullable(),
    description: z.string().max(10_000).nullable(),
    brand: z.string().max(120).nullable(),
    status: z.enum(['draft', 'pending_review', 'active', 'rejected', 'archived']),
    variants: z.array(z.object({
      sku: z.string().min(1).max(80),
      attributes: z.record(z.string(), z.unknown()),
      price_piastres: databaseInteger,
      compare_at_price_piastres: databaseInteger.nullable(),
      is_active: z.boolean(),
      on_hand: z.number().int().nonnegative(),
    })),
    images: z.array(z.object({
      source_url: z.url(),
      position: z.number().int().min(0).max(9),
      alt_text: z.string().max(240).nullable(),
    })).max(10),
  })).max(500),
});

const recentJobSchema = z.object({
  id: uuid,
  source_filename: z.string().min(1).max(255),
  status: importStatus,
  total_rows: z.number().int().nonnegative(),
  valid_rows: z.number().int().nonnegative(),
  invalid_rows: z.number().int().nonnegative(),
  result: z.record(z.string(), z.unknown()),
  error_summary: z.array(z.unknown()),
  created_at: timestamp,
  completed_at: timestamp.nullable(),
});

type MerchantExcelContext = NonNullable<Awaited<ReturnType<typeof resolveMerchantStore>>>;

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ar-EG');
}

function safeResultCount(value: unknown): number {
  const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function rpcError(error: { message?: string } | null): MerchantCatalogError {
  const message = error?.message ?? '';
  if (/access_required|authentication_required/u.test(message)) return new MerchantCatalogError('access_denied');
  if (/not_found/u.test(message)) return new MerchantCatalogError('not_found');
  if (/conflict|not_ready|version/u.test(message)) return new MerchantCatalogError('conflict');
  if (/invalid_|limit|duplicate/u.test(message)) return new MerchantCatalogError('invalid_input');
  return new MerchantCatalogError('service_unavailable');
}

function assertStore(context: MerchantExcelContext | null, requestedStoreId: string): asserts context is MerchantExcelContext {
  if (!context || context.storeId !== requestedStoreId) throw new MerchantCatalogError('access_denied');
}

async function discardImportFile(
  context: MerchantExcelContext,
  fileId: string,
  reason: string,
): Promise<void> {
  const { error } = await (context.supabase as any).rpc('discard_my_catalog_import_file', {
    p_file_id: fileId,
    p_reason: reason,
  });
  if (error) throw rpcError(error);
}

function toValidationIssues(issues: ProductImportIssue[]) {
  return issues.slice(0, 1_000).map((issue, index) => ({
    id: `${issue.sheet}:${issue.row ?? 0}:${issue.column ?? ''}:${issue.code}:${index}`,
    severity: issue.severity,
    sheet: issue.sheet,
    row: issue.row ?? null,
    column: issue.column ?? null,
    message: issue.message,
  }));
}

function invalidValidation(filename: string, issues: ProductImportIssue[]): MerchantExcelValidationViewModel {
  return {
    status: 'invalid',
    jobId: null,
    jobUpdatedAt: null,
    filename,
    productRows: 0,
    variantRows: 0,
    imageRows: 0,
    issues: toValidationIssues(issues),
    message: 'راجع الأخطاء الموضحة في الملف ثم أعد رفعه. لم يتم حفظ أي منتج.',
  };
}

function normalizeImportPlan(
  plan: ProductImportPlan,
  context: MerchantExcelContext,
): { plan: Record<string, unknown[]>; issues: ProductImportIssue[] } {
  const categories = new Map(context.categories.map((category) => [normalizeLabel(category.name), category.id]));
  const issues: ProductImportIssue[] = [];
  const products = plan.products.map((product) => {
    const normalizedCategory = normalizeLabel(product.category);
    const categoryId = categories.get(normalizedCategory);
    const isUncategorized = normalizedCategory === 'غير مصنف' || normalizedCategory === 'uncategorized';
    if (!categoryId && !isUncategorized) {
      issues.push({
        severity: 'error',
        code: 'unknown_category',
        sheet: 'Products',
        row: product.sourceRow,
        column: 'category',
        message: `الفئة "${product.category}" غير موجودة أو غير مفعلة.`,
      });
    }
    const stableSlug = `import-${createHash('sha256').update(product.productKey).digest('hex').slice(0, 24)}`;
    return {
      product_key: product.productKey,
      slug: stableSlug,
      name: product.name,
      category_id: categoryId ?? null,
      short_description: product.description?.slice(0, 240) ?? null,
      description: product.description,
      brand: product.brand,
      is_featured: false,
      requested_status: product.status,
    };
  });

  const firstActiveByProduct = new Map<string, number>();
  for (const [index, variant] of plan.variants.entries()) {
    if (variant.active && !firstActiveByProduct.has(variant.productKey)) {
      firstActiveByProduct.set(variant.productKey, index);
    }
  }
  for (const product of plan.products) {
    if (!firstActiveByProduct.has(product.productKey)) {
      issues.push({
        severity: 'error', code: 'product_without_active_variant', sheet: 'Variants',
        column: 'active', message: `يجب أن يحتوي المنتج ${product.productKey} على متغير فعال واحد على الأقل.`,
      });
    }
  }
  const variants = plan.variants.map((variant, index) => ({
    product_key: variant.productKey,
    sku: variant.sku,
    barcode: null,
    title: variant.options.map((option) => option.value).filter(Boolean).join(' / ') || 'Default',
    attributes: Object.fromEntries(variant.options.map((option) => [option.name, option.value])),
    price_piastres: variant.pricePiastres,
    compare_at_price_piastres: variant.compareAtPricePiastres,
    is_default: firstActiveByProduct.get(variant.productKey) === index,
    is_active: variant.active,
    weight_grams: null,
    on_hand: variant.stock,
    low_stock_threshold: 0,
    track_inventory: true,
  }));
  const images = plan.images.map((image) => ({
    product_key: image.productKey,
    source_url: image.imageUrl,
    position: image.position,
    alt_text: image.altText,
    source_row: image.sourceRow,
  }));
  return { plan: { products, variants, images }, issues };
}

export async function stageMerchantWorkbook(input: {
  storeId: string;
  fileId: string;
  filename: string;
  byteSize: number;
  checksumSha256: string;
  idempotencyKey: string;
}): Promise<MerchantExcelValidationViewModel> {
  if (
    !uuid.safeParse(input.storeId).success || !uuid.safeParse(input.fileId).success
    || !uuid.safeParse(input.idempotencyKey).success
    || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1
    || input.byteSize > PRODUCT_WORKBOOK_LIMITS.maxFileBytes
    || !/^[a-f0-9]{64}$/u.test(input.checksumSha256)
  ) {
    throw new MerchantCatalogError('invalid_input');
  }
  const filename = input.filename.normalize('NFKC').trim();
  if (
    !filename || filename.length > 255 || !filename.toLocaleLowerCase('en-US').endsWith('.xlsx')
  ) throw new MerchantCatalogError('invalid_input');

  const context = await resolveMerchantStore(input.storeId);
  assertStore(context, input.storeId);
  const objectKey = `imports/${context.storeId}/${input.fileId}.xlsx`;
  let buffer: Buffer;
  try {
    const head = await headPrivateMediaObject(objectKey);
    const stagedContentType = head.ContentType?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US');
    if (
      Number(head.ContentLength ?? 0) !== input.byteSize
      || stagedContentType !== workbookType
      || head.Metadata?.sha256 !== input.checksumSha256
    ) throw new MerchantCatalogError('invalid_input');
    buffer = await readPrivateMediaObject(objectKey, PRODUCT_WORKBOOK_LIMITS.maxFileBytes);
    if (createHash('sha256').update(buffer).digest('hex') !== input.checksumSha256) {
      throw new MerchantCatalogError('invalid_input');
    }
  } catch (error) {
    await discardImportFile(context, input.fileId, 'file_verification_failed').catch(() => undefined);
    throw error;
  }
  const parsed = await parseProductWorkbook(buffer);
  if (!parsed.valid || !parsed.plan) {
    await discardImportFile(context, input.fileId, 'workbook_invalid').catch(() => undefined);
    return invalidValidation(filename, parsed.issues);
  }
  const normalized = normalizeImportPlan(parsed.plan, context);
  if (normalized.issues.length) {
    await discardImportFile(context, input.fileId, 'catalog_validation_failed').catch(() => undefined);
    return invalidValidation(filename, [...parsed.issues, ...normalized.issues]);
  }

  const bucket = getPrivateMediaBucketName();
  try {
    const { error: fileError } = await (context.supabase as any).rpc('create_my_catalog_import_file', {
      p_store_id: context.storeId,
      p_file_id: input.fileId,
      p_bucket: bucket,
      p_object_key: objectKey,
      p_byte_size: buffer.byteLength,
      p_sha256: parsed.plan.sourceSha256,
    });
    if (fileError) throw rpcError(fileError);
    const { data, error } = await (context.supabase as any).rpc('begin_my_catalog_import', {
      p_store_id: context.storeId,
      p_file_id: input.fileId,
      p_idempotency_key: input.idempotencyKey,
      p_source_filename: filename,
      p_plan: normalized.plan,
    });
    if (error) throw rpcError(error);
    const begun = beginResponseSchema.safeParse(data);
    if (!begun.success) throw new MerchantCatalogError('service_unavailable');
    const job = await getMerchantImportJob(context, begun.data.job_id);
    return {
      status: 'valid',
      jobId: begun.data.job_id,
      jobUpdatedAt: job.updated_at,
      filename,
      productRows: parsed.plan.products.length,
      variantRows: parsed.plan.variants.length,
      imageRows: parsed.plan.images.length,
      issues: toValidationIssues(parsed.issues),
      message: 'الملف صالح ومحفوظ بصورة خاصة. راجع الأعداد ثم طبّق الاستيراد.',
    };
  } catch (error) {
    await discardImportFile(context, input.fileId, 'staging_failed').catch(() => undefined);
    throw error;
  }
}

async function getMerchantImportJob(context: MerchantExcelContext, jobId: string) {
  const { data, error } = await (context.supabase as any).rpc('get_my_catalog_import', { p_job_id: jobId });
  if (error) throw rpcError(error);
  const parsed = jobSchema.safeParse(data);
  if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
  return parsed.data;
}

export async function applyMerchantWorkbook(input: {
  storeId: string;
  jobId: string;
  expectedUpdatedAt: string;
}): Promise<MerchantExcelValidationViewModel> {
  if (!uuid.safeParse(input.storeId).success || !uuid.safeParse(input.jobId).success
      || !timestamp.safeParse(input.expectedUpdatedAt).success) {
    throw new MerchantCatalogError('invalid_input');
  }
  const context = await resolveMerchantStore(input.storeId);
  assertStore(context, input.storeId);
  const existing = await getMerchantImportJob(context, input.jobId);
  if (existing.store_id !== input.storeId || existing.updated_at !== input.expectedUpdatedAt) {
    throw new MerchantCatalogError('conflict');
  }
  const { data, error } = await (context.supabase as any).rpc('apply_my_catalog_import', {
    p_job_id: input.jobId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw rpcError(error);
  const response = z.object({
    job_id: uuid,
    status: importStatus,
    images_pending: z.number().int().nonnegative(),
  }).passthrough().safeParse(data);
  if (!response.success) throw new MerchantCatalogError('service_unavailable');
  const refreshed = await getMerchantImportJob(context, input.jobId);
  return {
    status: response.data.images_pending > 0 ? 'processing' : 'valid',
    jobId: input.jobId,
    jobUpdatedAt: refreshed.updated_at,
    filename: refreshed.source_filename,
    productRows: refreshed.row_counts.Products ?? 0,
    variantRows: refreshed.row_counts.Variants ?? 0,
    imageRows: refreshed.row_counts.Images ?? 0,
    issues: [],
    message: response.data.images_pending > 0
      ? 'تم حفظ المنتجات والمتغيرات، وتجري الآن معالجة الصور.'
      : 'اكتمل الاستيراد بنجاح.',
  };
}

export async function fetchMerchantExcelPage(storeId?: string | null): Promise<{
  storeId: string | null;
  storeName: string | null;
  jobs: MerchantExcelJobViewModel[];
}> {
  const context = await resolveMerchantStore(storeId);
  if (!context) return { storeId: null, storeName: null, jobs: [] };
  if (storeId && context.storeId !== storeId) throw new MerchantCatalogError('access_denied');
  const { data, error } = await (context.supabase as any)
    .from('catalog_import_jobs')
    .select('id,source_filename,status,total_rows,valid_rows,invalid_rows,result,error_summary,created_at,completed_at')
    .eq('store_id', context.storeId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new MerchantCatalogError('service_unavailable');
  const parsed = z.array(recentJobSchema).safeParse(data ?? []);
  if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
  return {
    storeId: context.storeId,
    storeName: context.storeName,
    jobs: parsed.data.map((job) => ({
      id: job.id,
      filename: job.source_filename,
      status: job.status,
      totalRows: job.total_rows,
      validRows: job.valid_rows,
      invalidRows: job.invalid_rows,
      createdProducts: safeResultCount(job.result.products_created ?? job.result.products_applied),
      updatedProducts: safeResultCount(job.result.products_updated),
      createdAt: job.created_at,
      completedAt: job.completed_at,
      errorMessage: typeof job.result.error_code === 'string'
        ? job.result.error_code
        : job.error_summary.length ? 'تعذر إكمال بعض صفوف الاستيراد.' : null,
    })),
  };
}

export async function createMerchantCatalogExport(storeId: string): Promise<Buffer> {
  if (!uuid.safeParse(storeId).success) throw new MerchantCatalogError('invalid_input');
  const context = await resolveMerchantStore(storeId);
  assertStore(context, storeId);
  const categoryNames = new Map(context.categories.map((category) => [category.id, category.name]));
  const records: ProductExportRecord[] = [];
  for (let offset = 0; offset < PRODUCT_WORKBOOK_LIMITS.maxProducts; offset += 500) {
    const { data, error } = await (context.supabase as any).rpc('export_my_marketplace_catalog', {
      p_store_id: storeId, p_limit: 500, p_offset: offset,
    });
    if (error) throw rpcError(error);
    const parsed = exportPageSchema.safeParse(data);
    if (!parsed.success) throw new MerchantCatalogError('service_unavailable');
    for (const product of parsed.data.products) {
      records.push({
        productKey: product.product_key,
        name: product.name,
        category: product.category_id ? categoryNames.get(product.category_id) ?? 'غير مصنف' : 'غير مصنف',
        brand: product.brand,
        description: product.description,
        status: product.status === 'rejected' ? 'draft' : product.status,
        variants: product.variants.map((variant) => ({
          sku: variant.sku,
          options: Object.entries(variant.attributes)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .slice(0, 2)
            .map(([name, value]) => ({ name, value })),
          pricePiastres: Number(variant.price_piastres),
          compareAtPricePiastres: variant.compare_at_price_piastres === null
            ? null : Number(variant.compare_at_price_piastres),
          stock: variant.on_hand,
          active: variant.is_active,
        })),
        images: product.images.map((image) => ({
          url: image.source_url, position: image.position, altText: image.alt_text,
        })),
      });
    }
    if (records.length >= parsed.data.total || parsed.data.products.length < 500) break;
  }
  return createProductWorkbook(records);
}
