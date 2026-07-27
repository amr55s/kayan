'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kayan_favorites';

function getStoredFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFavorites(getStoredFavorites());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const favoritesCount = favorites.length;

  return { favorites, isFavorite, toggleFavorite, favoritesCount };
}
