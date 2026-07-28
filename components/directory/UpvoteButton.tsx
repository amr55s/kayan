'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/react';
import { ThumbsUp } from 'lucide-react';
import { trackSiteEvent } from '@/lib/analytics/client';

const VOTED_KEY = 'kayan_voted_places';

function getVotedPlaces(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface UpvoteButtonProps {
  placeId: string;
  initialCount: number;
}

export const UpvoteButton: React.FC<UpvoteButtonProps> = ({ placeId, initialCount }) => {
  const [count, setCount] = useState(initialCount);
  const [hasVoted, setHasVoted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHasVoted(getVotedPlaces().includes(placeId));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [placeId]);

  const handleUpvote = async () => {
    if (hasVoted) return;

    // Optimistic update
    setCount((c) => c + 1);
    setHasVoted(true);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 600);

    // Save to localStorage
    const voted = getVotedPlaces();
    voted.push(placeId);
    try {
      window.localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
    } catch {
      // The optimistic vote still works when browser storage is restricted.
    }

    // Fire server action
    try {
      const { upvotePlace } = await import('@/lib/supabase/actions');
      const result = await upvotePlace(placeId);
      if (result.success) {
        trackSiteEvent('upvote_click', { targetType: 'place', targetKey: placeId });
      } else {
        setCount((current) => Math.max(initialCount, current - 1));
        setHasVoted(false);
      }
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  };

  return (
    <Button
      size="sm"
      variant="light"
      onClick={handleUpvote}
      isDisabled={hasVoted}
      aria-label={hasVoted ? 'تم الإعجاب بالمكان' : 'إعجاب بالمكان'}
      startContent={
        <ThumbsUp
          className={`w-3.5 h-3.5 transition-transform ${
            isAnimating ? 'scale-125' : ''
          } ${hasVoted ? 'fill-blue-600 text-blue-600' : 'text-zinc-400'}`}
        />
      }
      className={`min-w-fit bg-transparent px-2 text-xs font-extrabold transition-colors hover:bg-transparent ${
        hasVoted
          ? 'text-blue-600'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
      }`}
    >
      {count > 0 ? count : ''}
    </Button>
  );
};
