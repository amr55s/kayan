'use client';

import { Button } from '@heroui/react/button';
import { ScrollShadow } from '@heroui/react/scroll-shadow';
import Image from 'next/image';
import { useState } from 'react';
import type { MarketplaceImageViewModel } from './view-models';
import styles from './marketplace.module.css';

export function MarketplaceProductGallery({
  images,
  productName,
}: {
  images: MarketplaceImageViewModel[];
  productName: string;
}) {
  const galleryImages = images.slice(0, 10);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = galleryImages[selectedIndex] ?? galleryImages[0];

  if (!selectedImage) {
    return (
      <div className={styles.mainImage}>
        <span className={styles.imageFallback}>لا توجد صور متاحة لهذا المنتج</span>
      </div>
    );
  }

  return (
    <section className={styles.gallery} aria-label={`صور ${productName}`}>
      <div className={styles.mainImage}>
        <Image
          key={selectedImage.id}
          src={selectedImage.url}
          alt={selectedImage.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className={styles.mainImageAsset}
          placeholder={selectedImage.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={selectedImage.blurDataUrl ?? undefined}
        />
      </div>

      {galleryImages.length > 1 ? (
        <ScrollShadow orientation="horizontal" className={styles.thumbnailList} role="group" aria-label="اختر صورة لعرضها">
          {galleryImages.map((image, index) => (
            <Button.Root
              key={image.id}
              type="button"
              isIconOnly
              className={`${styles.thumbnail} ${index === selectedIndex ? styles.thumbnailSelected : ''}`}
              aria-label={`عرض الصورة ${index + 1} من ${galleryImages.length}`}
              aria-pressed={index === selectedIndex}
              onPress={() => setSelectedIndex(index)}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="100px"
                className={styles.thumbnailImage}
              />
            </Button.Root>
          ))}
        </ScrollShadow>
      ) : null}
    </section>
  );
}
