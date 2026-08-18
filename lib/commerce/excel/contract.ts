export const PRODUCT_WORKBOOK_SHEETS = {
  instructions: 'Instructions',
  products: 'Products',
  variants: 'Variants',
  images: 'Images',
} as const;

export const PRODUCT_WORKBOOK_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxZipEntryBytes: 50 * 1024 * 1024,
  maxZipEntries: 5_000,
  maxCompressionRatio: 100,
  maxWorksheets: 6,
  maxProducts: 5_000,
  maxVariants: 20_000,
  maxImages: 50_000,
  maxImagesPerProduct: 10,
  maxCellCharacters: 5_000,
  maxIdentifierCharacters: 80,
} as const;

export const PRODUCT_HEADERS = [
  'product_key',
  'name',
  'category',
  'brand',
  'description',
  'status',
] as const;

export const VARIANT_HEADERS = [
  'product_key',
  'sku',
  'option_1_name',
  'option_1_value',
  'option_2_name',
  'option_2_value',
  'price_egp',
  'compare_at_price_egp',
  'stock',
  'active',
] as const;

export const IMAGE_HEADERS = [
  'product_key',
  'image_url',
  'position',
  'alt_text',
] as const;

export type ProductWorkbookStatus = 'draft' | 'pending_review' | 'active' | 'archived';

export type ImportIssueSeverity = 'error' | 'warning';

export interface ProductImportIssue {
  severity: ImportIssueSeverity;
  code: string;
  sheet: string;
  row?: number;
  column?: string;
  message: string;
  value?: string;
}

export interface ProductImportRow {
  sourceRow: number;
  productKey: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  status: ProductWorkbookStatus;
}

export interface ProductVariantImportRow {
  sourceRow: number;
  productKey: string;
  sku: string;
  options: ReadonlyArray<{ name: string; value: string }>;
  pricePiastres: number;
  compareAtPricePiastres: number | null;
  stock: number;
  active: boolean;
}

export interface ProductImageImportRow {
  sourceRow: number;
  productKey: string;
  imageUrl: string;
  position: number;
  altText: string | null;
}

export interface ProductImportPlan {
  contractVersion: 1;
  sourceSha256: string;
  products: ProductImportRow[];
  variants: ProductVariantImportRow[];
  images: ProductImageImportRow[];
}

export interface ProductWorkbookParseResult {
  valid: boolean;
  issues: ProductImportIssue[];
  plan: ProductImportPlan | null;
}

export interface ProductImportExecutionContext {
  actorUserId: string;
  storeId: string;
  idempotencyKey: string;
  dryRun: boolean;
}

export interface ProductImportExecutionResult {
  importId: string;
  dryRun: boolean;
  createdProducts: number;
  updatedProducts: number;
  createdVariants: number;
  updatedVariants: number;
  queuedImages: number;
  issues: ProductImportIssue[];
}

/**
 * The database implementation owns authorization, idempotency and the transaction.
 * Workbook parsing never imports generated database types or writes rows directly.
 */
export interface ProductImportPersistenceAdapter {
  /**
   * The adapter enforces first-publish moderation. A requested `active` status
   * becomes `pending_review` only when the product has never been approved;
   * ordinary imports must not unpublish an already-approved active product.
   */
  applyProductImport(
    context: ProductImportExecutionContext,
    plan: ProductImportPlan,
  ): Promise<ProductImportExecutionResult>;
}

export interface ProductExportRecord {
  productKey: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  status: ProductWorkbookStatus;
  images: Array<{
    url: string;
    position: number;
    altText: string | null;
  }>;
  variants: Array<{
    sku: string;
    options: ReadonlyArray<{ name: string; value: string }>;
    pricePiastres: number;
    compareAtPricePiastres: number | null;
    stock: number;
    active: boolean;
  }>;
}

export interface ProductExportSourceAdapter {
  listProductsForExport(input: {
    actorUserId: string;
    storeId: string;
  }): Promise<ProductExportRecord[]>;
}
