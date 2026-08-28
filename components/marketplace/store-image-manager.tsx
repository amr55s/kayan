'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ImageOff, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { uploadMarketplaceImage } from '@/lib/media/client';
import type { MarketplaceStore } from '@/lib/commerce/operational-setup';
import styles from './operational-setup.module.css';

type FormAction = (form: FormData) => void | Promise<void>;
type StoreImage = MarketplaceStore['images'][number];
type StoreImageKind = StoreImage['kind'];

export const MAX_STORE_IMAGES = 15;

function ordered(items: StoreImage[]) {
  return [...items].sort((left, right) => left.position - right.position);
}

export function StoreImageManager({ store, actions }: {
  store: MarketplaceStore;
  actions: { reorder: FormAction; delete: FormAction; undo: FormAction };
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(() => ordered(store.images));
  const [slot, setSlot] = useState<StoreImageKind>('gallery');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [failedUpload, setFailedUpload] = useState<{ files: File[]; slot: StoreImageKind } | null>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const remaining = Math.max(0, MAX_STORE_IMAGES - items.length);

  const move = (source: number, target: number) => {
    if (source === target || source < 0 || target < 0 || source >= items.length || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(source, 1);
      next.splice(target, 0, moved!);
      return next.map((item, position) => ({ ...item, position }));
    });
  };

  const upload = async (files: File[], uploadSlot: StoreImageKind) => {
    const replacingNamedSlot = uploadSlot !== 'gallery' && items.some((item) => item.kind === uploadSlot);
    const canReplaceNamedSlot = replacingNamedSlot && store.status === 'published';
    const maximum = uploadSlot === 'gallery' ? remaining : (remaining > 0 || canReplaceNamedSlot ? 1 : 0);
    if (!files.length || files.length > maximum) {
      setState('error');
      setMessage(uploadSlot === 'gallery'
        ? 'عدد الصور يتجاوز المساحة المتاحة.'
        : replacingNamedSlot && !canReplaceNamedSlot
          ? 'احذف الشعار أو الغلاف الحالي أولًا، ثم ارفع البديل.'
          : 'اختر صورة واحدة للشعار أو الغلاف.');
      return;
    }
    setState('uploading');
    setMessage('');
    const failed: File[] = [];
    for (const file of files) {
      try {
        await uploadMarketplaceImage({
          entityId: store.id,
          file,
          merchantId: store.merchant_id,
          purpose: 'store',
          slot: uploadSlot,
        });
      } catch {
        failed.push(file);
      }
    }
    setFailedUpload(failed.length ? { files: failed, slot: uploadSlot } : null);
    setState(failed.length ? 'error' : 'idle');
    setMessage(failed.length
      ? `تعذر رفع ${failed.length.toLocaleString('ar-EG')} صورة. يمكنك إعادة المحاولة.`
      : 'تم رفع صور المتجر ومعالجتها بنجاح.');
    router.refresh();
  };

  const submitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const files = [...(fileInput.current?.files ?? [])];
    if (fileInput.current) fileInput.current.value = '';
    await upload(files, slot);
  };

  return (
    <section className={styles.section} aria-labelledby="store-images-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="store-images-title">صور المتجر</h2>
          <p>حتى 15 صورة إجمالًا: شعار واحد، غلاف واحد، وباقي الصور للمعرض.</p>
        </div>
        <Chip.Root size="sm" aria-live="polite">
          <Chip.Label>{items.length.toLocaleString('ar-EG')} / ١٥</Chip.Label>
        </Chip.Root>
      </div>

      {items.length ? (
        <div className={styles.mediaGrid}>
          {items.map((item, index) => (
            <article
              key={item.asset_id}
              className={styles.mediaItem}
              draggable
              tabIndex={0}
              aria-label={`صورة ${index + 1}، ${item.kind}. استخدم Alt مع الأسهم لتغيير الترتيب.`}
              onDragStart={() => setDraggedIndex(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex !== null) move(draggedIndex, index);
                setDraggedIndex(null);
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return;
                if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault(); move(index, index - 1);
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault(); move(index, index + 1);
                }
              }}
            >
              <div className={styles.mediaPreview}>
                <Image src={item.public_url} alt={item.alt_text || store.name} fill sizes="(max-width: 48rem) 45vw, 180px" />
              </div>
              <div className={styles.mediaMeta}>
                <Chip.Root size="sm">
                  <Chip.Label>{item.kind === 'logo' ? 'شعار' : item.kind === 'cover' ? 'غلاف' : `معرض ${index + 1}`}</Chip.Label>
                </Chip.Root>
                <div className={styles.actions}>
                  <Button.Root type="button" isIconOnly isDisabled={index === 0} className={styles.secondary} onPress={() => move(index, index - 1)} aria-label="تحريك الصورة للخلف"><ArrowUp size={14} aria-hidden="true" /></Button.Root>
                  <Button.Root type="button" isIconOnly isDisabled={index === items.length - 1} className={styles.secondary} onPress={() => move(index, index + 1)} aria-label="تحريك الصورة للأمام"><ArrowDown size={14} aria-hidden="true" /></Button.Root>
                  <form action={actions.delete}>
                    <input type="hidden" name="storeId" value={store.id} />
                    <input type="hidden" name="assetId" value={item.asset_id} />
                    <input type="hidden" name="expectedAssetUpdatedAt" value={item.updated_at} />
                    <Button.Root type="submit" isIconOnly className={styles.danger} aria-label="حذف الصورة"><Trash2 size={14} aria-hidden="true" /></Button.Root>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className={styles.empty}><ImageOff size={20} aria-hidden="true" /><p>لا توجد صور للمتجر بعد.</p></div>}

      {items.length > 1 ? (
        <form action={actions.reorder} className={styles.actions}>
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="expectedEntityUpdatedAt" value={store.updated_at} />
          <input type="hidden" name="orderedAssetIds" value={JSON.stringify(items.map((item) => item.asset_id))} />
          <Button.Root type="submit" className={styles.secondary}><Save size={15} aria-hidden="true" />حفظ ترتيب الصور</Button.Root>
        </form>
      ) : null}

      {store.pending_media_deletions.length ? (
        <div className={styles.undoPanel} role="status" aria-live="polite">
          <p>عمليات حذف قابلة للتراجع بعد تحديث الصفحة:</p>
          {store.pending_media_deletions.map((deletion) => (
            <form key={deletion.undo_id} action={actions.undo} className={styles.actions}>
              <input type="hidden" name="storeId" value={store.id} />
              <input type="hidden" name="undoId" value={deletion.undo_id} />
              <Button.Root type="submit" className={styles.secondary}><RotateCcw size={15} aria-hidden="true" />تراجع عن الحذف</Button.Root>
              <time dateTime={deletion.expires_at}>متاح لمدة محدودة بعد الحذف</time>
            </form>
          ))}
        </div>
      ) : null}

      <form onSubmit={submitUpload} className={styles.uploadPanel}>
        <label className={styles.field}>
          <span>نوع الصورة</span>
          <select className={styles.select} value={slot} onChange={(event) => setSlot(event.target.value as StoreImageKind)} disabled={state === 'uploading'}>
            <option value="gallery">صورة معرض</option>
            <option value="logo">الشعار</option>
            <option value="cover">الغلاف</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>اختر الصور</span>
          <input ref={fileInput} className={styles.input} type="file" multiple={slot === 'gallery'} accept="image/jpeg,image/png,image/webp,image/avif" disabled={state === 'uploading' || (slot !== 'gallery' && store.status !== 'published' && items.some((item) => item.kind === slot)) || (remaining === 0 && (slot === 'gallery' || !items.some((item) => item.kind === slot)))} />
        </label>
        <p>JPG أو PNG أو WebP أو AVIF، بحد أقصى 12MB للصورة. المتبقي {remaining.toLocaleString('ar-EG')}.</p>
        <div className={styles.actions}>
          <Button.Root type="submit" className={styles.primary} isDisabled={state === 'uploading'}><Upload size={15} aria-hidden="true" />{state === 'uploading' ? 'جارٍ الرفع…' : 'رفع الصور'}</Button.Root>
          {failedUpload ? <Button.Root type="button" className={styles.secondary} isDisabled={state === 'uploading'} onPress={() => void upload(failedUpload.files, failedUpload.slot)}>إعادة محاولة الصور المتعثرة</Button.Root> : null}
        </div>
        {message ? <p role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}
      </form>
    </section>
  );
}
