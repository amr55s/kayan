import {
  Utensils,
  ChefHat,
  ShoppingBag,
  Carrot,
  Pill,
  Wrench,
  Building2,
  LayoutGrid,
  Store,
} from 'lucide-react';

export interface CategoryItem {
  id: string;
  label: string;
  subtitle: string;
  icon: any;
  emoji?: string;
  badgeColor?: string;
}

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'all',
    label: 'الكل',
    subtitle: 'جميع الأنشطة',
    icon: LayoutGrid,
    emoji: '🌐',
  },
  {
    id: 'restaurants',
    label: 'مطاعم وكافيهات',
    subtitle: 'وجبات ومأكولات',
    icon: Utensils,
    emoji: '🍔',
  },
  {
    id: 'stores',
    label: 'متجر',
    subtitle: 'عطور، شنط ومنتجات',
    icon: Store,
    emoji: '🛍️',
  },
  {
    id: 'home_made',
    label: 'أكل منزلي',
    subtitle: 'وجبات بيتية جاهزة',
    icon: ChefHat,
    emoji: '👩‍🍳',
  },
  {
    id: 'market',
    label: 'سوبر ماركت',
    subtitle: 'بقالة ومستلزمات',
    icon: ShoppingBag,
    emoji: '🛒',
  },
  {
    id: 'veggies',
    label: 'خضار وفاكهة',
    subtitle: 'طازج يومياً',
    icon: Carrot,
    emoji: '🥦',
  },
  {
    id: 'pharmacy',
    label: 'صيدليات وطب',
    subtitle: 'رعاية ودواء 24h',
    icon: Pill,
    emoji: '💊',
  },
  {
    id: 'crafts',
    label: 'حرف وصيانة',
    subtitle: 'سباكة، كهرباء، صيانة',
    icon: Wrench,
    emoji: '🛠️',
  },
  {
    id: 'services',
    label: 'خدمات ومكاتب',
    subtitle: 'طباعة، عقارات، مكتبات',
    icon: Building2,
    emoji: '🏢',
  },
];
