import type { MarketplaceFormAction, MarketplaceMoney } from '../view-models';

export type MerchantProductStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'rejected'
  | 'archived';

export type MerchantStockStatus =
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  | 'not_tracked';

export type MerchantCatalogLoadState =
  | { kind: 'ready' }
  | { kind: 'empty'; title: string; description: string }
  | { kind: 'error'; title: string; description: string };

export type MerchantProductSummaryViewModel = {
  id: string;
  name: string;
  productKey: string;
  brand: string | null;
  categoryName: string | null;
  status: MerchantProductStatus;
  stockStatus: MerchantStockStatus;
  availableQuantity: number | null;
  variantCount: number;
  minimumPrice: MarketplaceMoney | null;
  maximumPrice: MarketplaceMoney | null;
  thumbnail: { id: string; url: string; alt: string } | null;
  moderationNote: string | null;
  updatedAt: string | null;
};

export type MerchantProductListViewModel = {
  loadState: MerchantCatalogLoadState;
  store: { id: string; name: string } | null;
  products: MerchantProductSummaryViewModel[];
  filters: {
    query: string;
    status: MerchantProductStatus | 'all';
    stock: MerchantStockStatus | 'all';
  };
  pagination: {
    page: number;
    pageCount: number;
    totalResults: number;
  };
};

export type MerchantCategoryOption = {
  id: string;
  name: string;
};

export type MerchantVariantEditorViewModel = {
  clientKey: string;
  id: string | null;
  title: string;
  sku: string;
  barcode: string;
  weightGrams: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  priceEgp: string;
  compareAtPriceEgp: string;
  trackInventory: boolean;
  onHand: string;
  lowStockThreshold: string;
  isActive: boolean;
  extraAttributesJson: string;
};

export type MerchantGalleryItemViewModel = {
  id: string;
  url: string | null;
  alt: string;
  position: number;
  state: 'ready' | 'processing' | 'failed';
  errorMessage?: string | null;
  updatedAt: string;
};

export type MerchantMediaDeletionViewModel = {
  undoId: string;
  assetId: string;
  expiresAt: string;
};

export type MerchantActionFeedback = {
  status: 'idle' | 'success' | 'error';
  message?: string | null;
  fieldErrors?: Record<string, string[]>;
};

export type MerchantProductEditorViewModel = {
  mode: 'create' | 'edit';
  productId: string | null;
  merchantId: string | null;
  storeId: string | null;
  storeName: string | null;
  productKey: string;
  name: string;
  brand: string;
  categoryId: string;
  description: string;
  status: MerchantProductStatus;
  firstPublishedAt: string | null;
  moderationNote: string | null;
  pendingRevision: { id: string; submittedAt: string; imageCount: number } | null;
  updatedAt: string | null;
  idempotencyKey: string;
  categories: MerchantCategoryOption[];
  variants: MerchantVariantEditorViewModel[];
  gallery: MerchantGalleryItemViewModel[];
  pendingMediaDeletions: MerchantMediaDeletionViewModel[];
  canEdit: boolean;
  canSubmitForReview: boolean;
  feedback: MerchantActionFeedback;
};

export type MerchantProductListActions = {
  submitForReviewAction?: MarketplaceFormAction;
  archiveProductAction?: MarketplaceFormAction;
};

export type MerchantProductEditorActions = {
  saveProductAction?: MarketplaceFormAction;
  submitForReviewAction?: MarketplaceFormAction;
  uploadImagesAction?: MarketplaceFormAction;
  reorderImagesAction?: MarketplaceFormAction;
  deleteImageAction?: MarketplaceFormAction;
  undoDeleteImageAction?: MarketplaceFormAction;
};

export type MerchantExcelIssueViewModel = {
  id: string;
  severity: 'error' | 'warning';
  sheet: string;
  row: number | null;
  column: string | null;
  message: string;
};

export type MerchantExcelValidationViewModel = {
  status: 'idle' | 'validating' | 'valid' | 'processing' | 'invalid' | 'error';
  jobId: string | null;
  jobUpdatedAt: string | null;
  filename: string | null;
  productRows: number;
  variantRows: number;
  imageRows: number;
  issues: MerchantExcelIssueViewModel[];
  message: string | null;
};

export type MerchantExcelJobStatus =
  | 'uploaded'
  | 'validating'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MerchantExcelJobViewModel = {
  id: string;
  filename: string;
  status: MerchantExcelJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdProducts: number;
  updatedProducts: number;
  createdAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

export type MerchantExcelPanelViewModel = {
  storeId: string | null;
  storeName: string | null;
  importIdempotencyKey: string;
  validation: MerchantExcelValidationViewModel;
  jobs: MerchantExcelJobViewModel[];
  exportState: {
    status: 'idle' | 'preparing' | 'ready' | 'error';
    downloadUrl: string | null;
    filename: string | null;
    message: string | null;
  };
};

export type MerchantExcelActions = {
  processWorkbookAction?: (
    previousState: MerchantExcelValidationViewModel,
    formData: FormData,
  ) => Promise<MerchantExcelValidationViewModel>;
};
