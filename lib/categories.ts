import { CATEGORIES } from './constants.ts';
import type { CategoryType } from '../types/index.ts';
import { getListingProfile } from './listings/config.ts';

export type { CategoryType };

export const CATEGORIES_CONFIG = CATEGORIES.map((cat) => ({
  id: cat.id as CategoryType,
  label: cat.label,
  subtitle: cat.subtitle,
  emoji: cat.emoji || '📌',
  icon: cat.id,
  color: cat.id === 'restaurants' ? 'primary' : cat.id === 'stores' ? 'warning' : cat.id === 'home_made' ? 'secondary' : cat.id === 'market' ? 'success' : cat.id === 'veggies' ? 'warning' : cat.id === 'pharmacy' ? 'danger' : cat.id === 'real_estate' ? 'primary' : 'default',
}));

export const CATEGORY_OPTIONS = CATEGORIES
  .filter((cat) => cat.id !== 'all')
  .map((cat) => ({
    id: cat.id,
    label: `${cat.emoji ? cat.emoji + ' ' : ''}${cat.label}`,
  }));

/**
 * Returns the localized Arabic label for a given category ID.
 */
export function getCategoryLabel(category: string): string {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat ? cat.label : category;
}

/**
 * Returns the theme color token for a given category ID.
 */
export function getCategoryColor(category: string): string {
  switch (category) {
    case 'restaurants': return 'primary';
    case 'stores': return 'warning';
    case 'home_made': return 'secondary';
    case 'market': return 'success';
    case 'veggies': return 'warning';
    case 'pharmacy': return 'danger';
    case 'crafts': return 'warning';
    case 'services': return 'secondary';
    case 'real_estate': return 'primary';
    default: return 'default';
  }
}

/**
 * Returns the contextual description field label for a listing category.
 */
export function getListingDescriptionLabel(category: string): string {
  return getListingProfile(category).labels.description;
}

/**
 * Returns the contextual image upload label for a listing category.
 */
export function getListingImageLabel(category: string): string {
  return getListingProfile(category).labels.images;
}
