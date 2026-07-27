'use client';

import React, { useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Share2 } from 'lucide-react';
import { sharePlace } from '@/lib/share';

interface ShareButtonProps {
  title: string;
  phone: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ title, phone }) => {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const completed = await sharePlace(title, phone);
    if (completed) setShared(true);
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
