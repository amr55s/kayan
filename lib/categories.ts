import { CATEGORIES } from './constants';
import { CategoryType } from '@/types';

export type { CategoryType };

export const CATEGORIES_CONFIG = CATEGORIES.map((cat) => ({
  id: cat.id as CategoryType,
  label: cat.label,
  subtitle: cat.subtitle,
  emoji: cat.emoji || '📌',
  icon: cat.id,
  color: cat.id === 'restaurants' ? 'primary' : cat.id === 'home_made' ? 'secondary' : cat.id === 'market' ? 'success' : cat.id === 'veggies' ? 'warning' : cat.id === 'pharmacy' ? 'danger' : 'default',
}));

export const CATEGORY_OPTIONS = CATEGORIES
  .filter((cat) => cat.id !== 'all')
  .map((cat) => ({
    id: cat.id,
    label: `${cat.emoji ? cat.emoji + ' ' : ''}${cat.label}`,
  }));

export function getCategoryLabel(category: string): string {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat ? cat.label : category;
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'restaurants': return 'primary';
    case 'home_made': return 'secondary';
    case 'market': return 'success';
    case 'veggies': return 'warning';
    case 'pharmacy': return 'danger';
    case 'crafts': return 'warning';
    case 'services': return 'secondary';
    default: return 'default';
  }
}
