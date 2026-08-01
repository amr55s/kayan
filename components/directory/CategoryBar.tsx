'use client';

import React from 'react';
import { Button } from '@heroui/react';
import { CATEGORIES, CategoryItem } from '@/lib/constants';
import { CategoryType } from '@/types';

interface CategoryBarProps {
  selectedCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
  counts?: Record<string, number>;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  selectedCategory,
  onCategoryChange,
  counts,
}) => {
  return (
    <div className="dir-rtl w-full max-w-full">
      <div className="grid grid-cols-4 gap-1.5 px-1 sm:grid-cols-8 sm:gap-3">
        {CATEGORIES.filter((cat) => cat.id !== 'all').map((cat: CategoryItem) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          const count = counts?.[cat.id];

          return (
            <Button
              key={cat.id}
              size="md"
              variant="flat"
              aria-pressed={isSelected}
              onPress={() => onCategoryChange(isSelected ? 'all' : cat.id as CategoryType)}
              className={`relative h-16 min-h-0 w-full min-w-0 flex-col gap-1 rounded-2xl border px-1 py-1.5 text-center text-[10px] font-black leading-tight shadow-[0_1px_2px_rgba(0,0,0,.035)] transition-[background-color,border-color,color,box-shadow,transform] motion-reduce:transition-none sm:h-[116px] sm:gap-1.5 sm:rounded-[22px] sm:text-xs ${
                isSelected
                  ? 'border-zinc-950 bg-zinc-950 text-white shadow-[0_2px_5px_rgba(0,0,0,.09)]'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white hover:shadow-[0_2px_5px_rgba(0,0,0,.06)]'
              }`}
            >
              <span className={`flex size-7 items-center justify-center rounded-[10px] sm:size-9 sm:rounded-xl ${isSelected ? 'bg-white/10 text-white' : 'bg-white text-zinc-950 ring-1 ring-zinc-200'}`}>
                <Icon className="size-4 sm:size-5" aria-hidden="true" />
              </span>
              <span className="line-clamp-2">{cat.label}</span>
              <span className={`hidden max-w-full truncate text-[10px] font-semibold sm:block ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                {cat.subtitle}
              </span>
              {typeof count === 'number' && (
                <span className={`absolute start-2 top-2 hidden rounded-full px-1.5 py-0.5 text-[10px] sm:inline ${isSelected ? 'bg-white/10 text-zinc-200' : 'bg-zinc-100 text-zinc-500'}`}>
                  {count.toLocaleString('ar-EG')}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
