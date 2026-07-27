'use client';

import React from 'react';
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
    <div className="w-full max-w-full overflow-x-auto no-scrollbar pb-3 pt-1 touch-pan-x dir-rtl">
      <div className="flex gap-2.5 min-w-max px-1">
        {CATEGORIES.map((cat: CategoryItem) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          const count = counts?.[cat.id];

          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id as CategoryType)}
              className={`shrink-0 flex-shrink-0 min-w-[125px] sm:min-w-[150px] max-w-[160px] p-3 rounded-2xl border transition-all duration-200 text-right flex flex-col justify-between gap-2.5 cursor-pointer select-none ${
                isSelected
                  ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white text-white dark:text-zinc-900 shadow-sm scale-[1.02]'
                  : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/90'
              }`}
            >
              {/* Icon & Count Badge Row */}
              <div className="flex items-center justify-between w-full">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-white/15 text-white dark:bg-zinc-900/15 dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {typeof count === 'number' && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                      isSelected
                        ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </div>

              {/* Category Title & Subtitle */}
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-xs sm:text-sm leading-snug">
                  {cat.label}
                </span>
                <span
                  className={`text-[10px] line-clamp-1 font-normal ${
                    isSelected ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {cat.subtitle}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
