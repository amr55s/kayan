'use client';

import React from 'react';
import { CategoryType } from '@/types';
import { CategoryBar } from './CategoryBar';

interface CategoryTabsProps {
  selectedCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  counts?: Record<string, number>;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({
  selectedCategory,
  onCategoryChange,
  counts,
}) => {
  return (
    <CategoryBar
      selectedCategory={selectedCategory}
      onCategoryChange={onCategoryChange}
      counts={counts}
    />
  );
};
