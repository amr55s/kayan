'use client';

import React, { useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Share2 } from 'lucide-react';
import { sharePlace } from '@/lib/share';
import { trackSiteEvent } from '@/lib/analytics/client';

interface ShareButtonProps {
  title: string;
  phone: string;
  pageUrl?: string;
  placeId?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ title, phone, pageUrl, placeId }) => {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const absoluteUrl = pageUrl && typeof window !== 'undefined'
      ? new URL(pageUrl, window.location.origin).toString()
      : undefined;
    const completed = await sharePlace(title, phone, absoluteUrl);
    if (completed) {
      setShared(true);
      if (placeId) {
        trackSiteEvent('share_click', { targetType: 'place', targetKey: placeId });
      }
    }
  };

  return (
    <Tooltip content="مشاركة" placement="top">
      <Button
        isIconOnly
        size="sm"
        variant="light"
        onClick={handleShare}
        aria-label="مشاركة المكان"
        className={`size-11 min-w-11 bg-transparent p-0 hover:bg-transparent ${
          shared ? 'text-emerald-600' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
        }`}
      >
        <Share2 className="size-4" />
      </Button>
    </Tooltip>
  );
};
