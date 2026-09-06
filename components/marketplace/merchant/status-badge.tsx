import { Chip } from '@heroui/react/chip';
import type {
  MerchantExcelJobStatus,
  MerchantProductStatus,
  MerchantStockStatus,
} from './view-models';
import styles from './merchant-marketplace.module.css';

const productLabels: Record<MerchantProductStatus, string> = {
  draft: 'مسودة',
  pending_review: 'قيد المراجعة',
  active: 'منشور',
  rejected: 'مرفوض',
  archived: 'مؤرشف',
};

const stockLabels: Record<MerchantStockStatus, string> = {
  in_stock: 'متوفر',
  low_stock: 'مخزون منخفض',
  out_of_stock: 'نفد المخزون',
  not_tracked: 'غير متتبع',
};

const jobLabels: Record<MerchantExcelJobStatus, string> = {
  uploaded: 'تم الرفع',
  validating: 'جارٍ الفحص',
  ready: 'جاهز للتطبيق',
  processing: 'جارٍ التطبيق',
  completed: 'مكتمل',
  failed: 'فشل',
  cancelled: 'ملغي',
};

function productClass(status: MerchantProductStatus) {
  if (status === 'active') return styles.statusActive;
  if (status === 'pending_review') return styles.statusPending;
  if (status === 'rejected') return styles.statusRejected;
  return styles.statusDraft;
}

function stockClass(status: MerchantStockStatus) {
  if (status === 'in_stock') return styles.stockAvailable;
  if (status === 'low_stock') return styles.stockLow;
  if (status === 'out_of_stock') return styles.stockEmpty;
  return styles.stockNotTracked;
}

function jobClass(status: MerchantExcelJobStatus) {
  if (status === 'completed') return styles.statusActive;
  if (status === 'failed' || status === 'cancelled') return styles.statusRejected;
  if (status === 'validating' || status === 'processing') return styles.statusPending;
  return styles.statusDraft;
}

export function ProductStatusBadge({ status }: { status: MerchantProductStatus }) {
  return (
    <Chip.Root className={`${styles.chip} ${productClass(status)}`}>
      <Chip.Label>{productLabels[status]}</Chip.Label>
    </Chip.Root>
  );
}

export function StockStatusBadge({ status }: { status: MerchantStockStatus }) {
  return (
    <Chip.Root className={`${styles.chip} ${stockClass(status)}`}>
      <Chip.Label>{stockLabels[status]}</Chip.Label>
    </Chip.Root>
  );
}

export function ExcelJobStatusBadge({ status }: { status: MerchantExcelJobStatus }) {
  return (
    <Chip.Root className={`${styles.chip} ${jobClass(status)}`}>
      <Chip.Label>{jobLabels[status]}</Chip.Label>
    </Chip.Root>
  );
}
