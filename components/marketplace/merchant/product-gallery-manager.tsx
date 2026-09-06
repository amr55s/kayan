'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ImageOff, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@heroui/react/button';
import { uploadMarketplaceImage } from '@/lib/media/client';
import type {
  MerchantGalleryItemViewModel,
  MerchantMediaDeletionViewModel,
  MerchantProductEditorActions,
} from './view-models';
import styles from './merchant-marketplace.module.css';

export const MAX_PRODUCT_IMAGES = 10;

function orderedGallery(items: MerchantGalleryItemViewModel[]) {
  return [...items].sort((left, right) => left.position - right.position);
}

export function ProductGalleryManager({
  productId,
  merchantId,
  storeId,
  expectedEntityUpdatedAt,
  initialItems,
  pendingDeletions,
  actions,
  canEdit,
}: {
  productId: string | null;
  merchantId: string | null;
  storeId: string | null;
  expectedEntityUpdatedAt: string | null;
  initialItems: MerchantGalleryItemViewModel[];
  pendingDeletions: MerchantMediaDeletionViewModel[];
  actions: MerchantProductEditorActions;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(() => orderedGallery(initialItems));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const remaining = Math.max(0, MAX_PRODUCT_IMAGES - items.length);
  const canManage = Boolean(productId && storeId && canEdit);

  const uploadFiles = async (files: File[]) => {
    if (!productId || !merchantId || files.length < 1 || files.length > remaining) {
      setUploadState('error');
      setUploadMessage('اختر عددًا صالحًا من الصور ضمن الحد المتبقي.');
      return;
    }
    setUploadState('uploading');
    setUploadMessage('');
    const failed: File[] = [];
    for (const file of files) {
      try {
        await uploadMarketplaceImage({
          entityId: productId,
          file,
          merchantId,
          purpose: 'product',
          slot: 'gallery',
        });
      } catch {
        failed.push(file);
      }
    }
    setFailedFiles(failed);
    router.refresh();
    if (failed.length > 0) {
      setUploadState('error');
      setUploadMessage(`تم حفظ الصور المكتملة، وتعذر رفع ${failed.length.toLocaleString('ar-EG')} صورة. يمكنك إعادة محاولتها.`);
    } else {
      setUploadState('idle');
      setUploadMessage('تم رفع الصور ومعالجتها بنجاح.');
    }
  };

  const uploadImages = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const files = [...(fileInputRef.current?.files ?? [])];
    if (!productId || !merchantId || files.length < 1 || files.length > remaining) {
      setUploadState('error');
      setUploadMessage('اختر عددًا صالحًا من الصور ضمن الحد المتبقي.');
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    await uploadFiles(files);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, position) => ({ ...item, position }));
    });
  };

  const moveTo = (source: number, target: number) => {
    if (source === target || source < 0 || target < 0 || source >= items.length || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(source, 1);
      next.splice(target, 0, moved!);
      return next.map((item, position) => ({ ...item, position }));
    });
  };

  return (
    <section className={styles.editorSection} aria-labelledby="product-gallery-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="product-gallery-title" className={styles.sectionTitle}>صور المنتج</h2>
          <p className={styles.helper}>
            حتى {MAX_PRODUCT_IMAGES.toLocaleString('ar-EG')} صور. الصورة الأولى هي الرئيسية.
          </p>
        </div>
        <span className={styles.position} aria-live="polite">
          {items.length.toLocaleString('ar-EG')} / {MAX_PRODUCT_IMAGES.toLocaleString('ar-EG')}
        </span>
      </div>

      {items.length > 0 ? (
        <div className={styles.galleryGrid}>
          {items.map((item, index) => (
            <article
              key={item.id}
              className={styles.galleryItem}
              draggable={canManage}
              onDragStart={() => setDraggedIndex(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex != null) moveTo(draggedIndex, index);
                setDraggedIndex(null);
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return;
                if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  move(index, -1);
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  move(index, 1);
                }
              }}
              tabIndex={canManage ? 0 : undefined}
              aria-label={`الصورة ${index + 1}. استخدم Alt مع الأسهم لتغيير الترتيب.`}
            >
              <div className={styles.galleryMedia}>
                {item.state === 'ready' && item.url ? (
                  <Image
                    src={item.url}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 640px) 45vw, 180px"
                    className={styles.galleryImage}
                  />
                ) : (
                  <div className={styles.galleryPlaceholder} role="status">
                    <ImageOff size={20} aria-hidden="true" />
                    <span>
                      {item.state === 'processing'
                        ? 'الصورة قيد المعالجة'
                        : item.errorMessage || 'تعذر تجهيز الصورة'}
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.galleryMeta}>
                <span className={styles.position}>
                  {index === 0 ? 'الصورة الرئيسية' : `الترتيب ${index + 1}`}
                </span>
                <div className={styles.galleryActions}>
                  <Button.Root
                    type="button"
                    isIconOnly
                    isDisabled={!canManage || index === 0}
                    onPress={() => move(index, -1)}
                    className={styles.iconButton}
                    aria-label={`تحريك الصورة ${index + 1} للأعلى`}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </Button.Root>
                  <Button.Root
                    type="button"
                    isIconOnly
                    isDisabled={!canManage || index === items.length - 1}
                    onPress={() => move(index, 1)}
                    className={styles.iconButton}
                    aria-label={`تحريك الصورة ${index + 1} للأسفل`}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </Button.Root>
                  <form action={actions.deleteImageAction}>
                    <input type="hidden" name="intent" value="delete-product-image" />
                    <input type="hidden" name="productId" value={productId || ''} />
                    <input type="hidden" name="assetId" value={item.id} />
                    <input type="hidden" name="expectedAssetUpdatedAt" value={item.updatedAt} />
                    <Button.Root
                      type="submit"
                      isIconOnly
                      isDisabled={!canManage || !actions.deleteImageAction}
                      className={styles.dangerButton}
                      aria-label={`حذف الصورة ${index + 1}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button.Root>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.stateContent} role="status">
          <span className={styles.stateIcon} aria-hidden="true"><ImageOff size={20} /></span>
          <p className={styles.helper}>لا توجد صور محفوظة لهذا المنتج.</p>
        </div>
      )}

      {pendingDeletions.length > 0 ? (
        <div className={styles.undoPanel} role="status" aria-live="polite">
          <p>يمكن التراجع عن حذف {pendingDeletions.length.toLocaleString('ar-EG')} صورة قبل انتهاء المهلة.</p>
          {pendingDeletions.map((deletion) => (
            <form key={deletion.undoId} action={actions.undoDeleteImageAction}>
              <input type="hidden" name="productId" value={productId || ''} />
              <input type="hidden" name="undoId" value={deletion.undoId} />
              <Button.Root
                type="submit"
                className={styles.secondaryButton}
                isDisabled={!canManage || !actions.undoDeleteImageAction}
              >
                <RotateCcw size={15} aria-hidden="true" />
                تراجع عن الحذف
              </Button.Root>
              <time dateTime={deletion.expiresAt} className={styles.position}>
                متاح لمدة محدودة بعد الحذف
              </time>
            </form>
          ))}
        </div>
      ) : null}

      {items.length > 1 ? (
        <form action={actions.reorderImagesAction} className={styles.formActions}>
          <input type="hidden" name="intent" value="reorder-product-images" />
          <input type="hidden" name="productId" value={productId || ''} />
          <input type="hidden" name="storeId" value={storeId || ''} />
          <input type="hidden" name="expectedEntityUpdatedAt" value={expectedEntityUpdatedAt || ''} />
          <input
            type="hidden"
            name="orderedAssetIds"
            value={JSON.stringify(items.map((item) => item.id))}
          />
          <Button.Root
            type="submit"
            isDisabled={!canManage || !actions.reorderImagesAction}
            className={styles.secondaryButton}
          >
            <Save size={15} aria-hidden="true" />
            حفظ ترتيب الصور
          </Button.Root>
        </form>
      ) : null}

      <form onSubmit={uploadImages} className={styles.uploadPanel}>
        <input type="hidden" name="intent" value="upload-product-images" />
        <input type="hidden" name="productId" value={productId || ''} />
        <input type="hidden" name="storeId" value={storeId || ''} />
        <label className={styles.fieldGroup} htmlFor="merchant-product-images">
          <span className={styles.label}>رفع صور جديدة</span>
          <input
            id="merchant-product-images"
            ref={fileInputRef}
            name="images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={!canManage || !merchantId || remaining === 0 || uploadState === 'uploading'}
            className={styles.fileInput}
          />
        </label>
        <p className={styles.helper}>
          يمكنك إضافة {remaining.toLocaleString('ar-EG')} صورة أخرى. التحقق النهائي من العدد والحجم والنوع مسؤولية إجراء الرفع على الخادم.
        </p>
        {!productId ? (
          <p className={styles.helper}>احفظ بيانات المنتج أولًا قبل رفع الصور.</p>
        ) : null}
        <Button.Root
          type="submit"
          isDisabled={!canManage || !merchantId || remaining === 0 || uploadState === 'uploading'}
          className={styles.primaryButton}
        >
          <Upload size={15} aria-hidden="true" />
          {uploadState === 'uploading' ? 'جارٍ رفع الصور…' : 'رفع الصور'}
        </Button.Root>
        {uploadMessage ? (
          <p role={uploadState === 'error' ? 'alert' : 'status'} className={styles.helper}>{uploadMessage}</p>
        ) : null}
        {failedFiles.length > 0 ? (
          <Button.Root
            type="button"
            isDisabled={uploadState === 'uploading'}
            className={styles.secondaryButton}
            onPress={() => void uploadFiles(failedFiles)}
          >
            إعادة محاولة الصور المتعثرة
          </Button.Root>
        ) : null}
      </form>
    </section>
  );
}
