/**
 * Centralized Listing Profiles and Real Estate Contracts
 *
 * Why this file exists:
 * To avoid scattered `category === '...'` conditional logic across components,
 * modals, cards, and details views. This module provides a single source of truth
 * for form field profiles, image upload boundaries (min/max), labels, placeholders,
 * and strongly-typed real estate frontend data contracts.
 */

export type ListingFormProfileKey =
  | 'real_estate'
  | 'store'
  | 'restaurant_or_cafe'
  | 'library_or_service'
  | 'default';

export type RealEstateOfferType = 'rent' | 'sale';

export type RealEstatePropertyType =
  | 'apartment'
  | 'villa'
  | 'house'
  | 'shop'
  | 'office'
  | 'land'
  | 'other';

export type RealEstateFurnishing = 'furnished' | 'semi_furnished' | 'unfurnished';

/**
 * Frontend contract for real estate draft data.
 * Held in client state as clean string values during data entry to prevent
 * mobile keyboard formatting issues and floating-point parsing glitches.
 */
export interface RealEstateDetailsDraft {
  offerType: RealEstateOfferType;
  propertyType: RealEstatePropertyType;
  priceEgp: string; // Validated positive integer string
  rooms?: string;
  bathrooms?: string;
  areaSqm?: string;
  floor?: string;
  furnishing?: RealEstateFurnishing | '';
}

/**
 * Image count boundaries and constraints per category profile.
 */
export interface ListingImagePolicy {
  min: number;
  max: number;
  accept: string;
}

/**
 * Visual labels and guidance copy per category profile.
 */
export interface ListingProfileLabels {
  description: string;
  descriptionPlaceholder?: string;
  descriptionHelpText?: string;
  images: string;
  imageOptimizationHint: string;
}

/**
 * Feature visibility flags to keep modal forms declarative.
 */
export interface ListingProfileFeatures {
  hasPayment: boolean; // Vodafone Cash / InstaPay
  hasCommunityLinks: boolean; // WhatsApp group / Telegram URLs
  isRealEstate: boolean;
  isStore: boolean;
  isRestaurantOrCafe: boolean;
  isLibraryOrService: boolean;
}

export interface ListingProfileConfig {
  profileKey: ListingFormProfileKey;
  imagePolicy: ListingImagePolicy;
  labels: ListingProfileLabels;
  features: ListingProfileFeatures;
}

export const REAL_ESTATE_PROPERTY_TYPES: ReadonlyArray<{
  id: RealEstatePropertyType;
  label: string;
}> = [
  { id: 'apartment', label: 'شقة' },
  { id: 'villa', label: 'فيلا' },
  { id: 'house', label: 'منزل / بيت' },
  { id: 'shop', label: 'محل تجاري' },
  { id: 'office', label: 'مكتب / عيادة' },
  { id: 'land', label: 'أرض' },
  { id: 'other', label: 'عقار آخر' },
];

export const REAL_ESTATE_OFFER_TYPES: ReadonlyArray<{
  id: RealEstateOfferType;
  label: string;
}> = [
  { id: 'rent', label: 'إيجار' },
  { id: 'sale', label: 'تمليك / بيع' },
];

export const REAL_ESTATE_FURNISHING_OPTIONS: ReadonlyArray<{
  id: RealEstateFurnishing;
  label: string;
}> = [
  { id: 'furnished', label: 'مفروش' },
  { id: 'semi_furnished', label: 'نصف مفروش' },
  { id: 'unfurnished', label: 'غير مفروش' },
];

/**
 * Standard image accept string for listing uploads.
 */
export const LISTING_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Maps a directory category identifier to its corresponding form profile key.
 *
 * Why: Keeps categorization logic pure and reusable across all UI layers.
 */
export function getListingFormProfileKey(category: string): ListingFormProfileKey {
  switch (category) {
    case 'real_estate':
      return 'real_estate';
    case 'stores':
      return 'store';
    case 'restaurants':
    case 'home_made':
      return 'restaurant_or_cafe';
    case 'services':
      return 'library_or_service';
    default:
      return 'default';
  }
}

/**
 * Returns comprehensive configuration for a category profile.
 *
 * Why: Centralizes min/max image counts, dynamic labels, and visibility flags
 * without scattering inline switch-statements in UI components.
 */
export function getListingProfile(category: string): ListingProfileConfig {
  const profileKey = getListingFormProfileKey(category);

  switch (profileKey) {
    case 'real_estate':
      return {
        profileKey: 'real_estate',
        imagePolicy: {
          min: 5,
          max: 7,
          accept: LISTING_IMAGE_ACCEPT,
        },
        labels: {
          description: 'وصف العقار ومواصفات التشطيب',
          descriptionPlaceholder: 'اكتب تفاصيل العقار: التشطيب، المرافق، الإطلالة، شروط الإيجار أو الدفع...',
          descriptionHelpText: 'تفاصيل واضحة تساعد الباحثين على معرفة مواصفات العقار بدقة.',
          images: 'صور العقار',
          imageOptimizationHint: 'مع الحفاظ على جودة وتفاصيل صور العقار',
        },
        features: {
          hasPayment: false,
          hasCommunityLinks: false,
          isRealEstate: true,
          isStore: false,
          isRestaurantOrCafe: false,
          isLibraryOrService: false,
        },
      };

    case 'store':
      return {
        profileKey: 'store',
        imagePolicy: {
          min: 1,
          max: 3,
          accept: LISTING_IMAGE_ACCEPT,
        },
        labels: {
          description: 'أهم المنتجات والماركات ونطاق الأسعار',
          descriptionPlaceholder: 'مثال: عطور أصلية، شنط وهدايا، الماركات المتاحة ونطاق الأسعار…',
          descriptionHelpText: 'للحصول على بطاقة متجر واضحة: أضف صورًا حقيقية للمنتجات، أشهر الماركات، ونطاق الأسعار.',
          images: 'صور المنتجات والمتجر',
          imageOptimizationHint: 'مع الحفاظ على جودة وتفاصيل المنتجات',
        },
        features: {
          hasPayment: true,
          hasCommunityLinks: true,
          isRealEstate: false,
          isStore: true,
          isRestaurantOrCafe: false,
          isLibraryOrService: false,
        },
      };

    case 'restaurant_or_cafe':
      return {
        profileKey: 'restaurant_or_cafe',
        imagePolicy: {
          min: 1,
          max: 3,
          accept: LISTING_IMAGE_ACCEPT,
        },
        labels: {
          description: 'قائمة المأكولات ومواعيد العمل',
          descriptionPlaceholder: 'أبرز الوجبات والأطباق، مواعيد العمل وخدمات التوصيل...',
          descriptionHelpText: 'أضف صور المنيو وأشهر الوجبات لسهولة الطلب.',
          images: 'صور المنيو والمكان',
          imageOptimizationHint: 'مع الحفاظ على وضوح المنيو',
        },
        features: {
          hasPayment: true,
          hasCommunityLinks: true,
          isRealEstate: false,
          isStore: false,
          isRestaurantOrCafe: true,
          isLibraryOrService: false,
        },
      };

    case 'library_or_service':
      return {
        profileKey: 'library_or_service',
        imagePolicy: {
          min: 1,
          max: 3,
          accept: LISTING_IMAGE_ACCEPT,
        },
        labels: {
          description: 'تفاصيل الخدمات ومواعيد العمل',
          descriptionPlaceholder: 'خدمات الطباعة أو التصوير، الاستشارات، ومواعيد العمل...',
          descriptionHelpText: 'وضّح أنواع الخدمات المتاحة ومواعيد العمل لاستقبال العملاء.',
          images: 'صور المكان ونماذج الأعمال',
          imageOptimizationHint: 'مع الحفاظ على وضوح الصور',
        },
        features: {
          hasPayment: true,
          hasCommunityLinks: true,
          isRealEstate: false,
          isStore: false,
          isRestaurantOrCafe: false,
          isLibraryOrService: true,
        },
      };

    case 'default':
    default:
      return {
        profileKey: 'default',
        imagePolicy: {
          min: 1,
          max: 3,
          accept: LISTING_IMAGE_ACCEPT,
        },
        labels: {
          description: 'الوصف أو مواعيد العمل',
          descriptionPlaceholder: 'اكتب نبذة عن النشاط ومواعيد العمل...',
          descriptionHelpText: 'اكتب نبذة واضحة عن النشاط ومواعيد العمل.',
          images: 'صور المكان والخدمة',
          imageOptimizationHint: 'مع الحفاظ على جودة الصور',
        },
        features: {
          hasPayment: true,
          hasCommunityLinks: true,
          isRealEstate: false,
          isStore: false,
          isRestaurantOrCafe: false,
          isLibraryOrService: false,
        },
      };
  }
}

/**
 * Checks whether a given category is real estate.
 */
export function isRealEstateCategory(category: string): boolean {
  return category === 'real_estate';
}

/**
 * Determines if the room count field is logically required for a given property type.
 *
 * Why: Land, shops, and offices typically do not have bedroom/room counts, so
 * forcing room count would create invalid or confusing user data.
 */
export function isRoomsFieldRequired(propertyType: RealEstatePropertyType): boolean {
  switch (propertyType) {
    case 'land':
    case 'shop':
    case 'office':
      return false;
    case 'apartment':
    case 'villa':
    case 'house':
    case 'other':
    default:
      return true;
  }
}

/**
 * Formats an Egyptian Pound price safely with thousand separators and optional rent periodicity.
 *
 * Examples:
 * formatEgpPrice('2500', 'rent') => '٢٬٥٠٠ ج.م / شهر'
 * formatEgpPrice('1200000', 'sale') => '١٬٢٠٠٬٠٠٠ ج.م'
 */
export function formatEgpPrice(
  price: string | number | null | undefined,
  offerType?: RealEstateOfferType | string,
): string {
  if (price === null || price === undefined || price === '') return '';
  const cleanStr = typeof price === 'string' ? price.replace(/,/g, '').trim() : String(price);
  const num = Number(cleanStr);
  if (Number.isNaN(num) || num <= 0) return '';
  const formatted = num.toLocaleString('ar-EG');
  if (offerType === 'rent') {
    return `${formatted} ج.م / شهر`;
  }
  return `${formatted} ج.م`;
}

/**
 * Returns Arabic label for property types.
 */
export function getRealEstatePropertyTypeLabel(propertyType?: string | null): string {
  if (!propertyType) return '';
  const found = REAL_ESTATE_PROPERTY_TYPES.find((item) => item.id === propertyType);
  return found ? found.label : propertyType;
}

/**
 * Returns Arabic label for offer types.
 */
export function getRealEstateOfferTypeLabel(offerType?: string | null): string {
  if (!offerType) return '';
  const found = REAL_ESTATE_OFFER_TYPES.find((item) => item.id === offerType);
  return found ? found.label : offerType;
}

/**
 * Returns Arabic label for furnishing options.
 */
export function getRealEstateFurnishingLabel(furnishing?: string | null): string {
  if (!furnishing) return '';
  const found = REAL_ESTATE_FURNISHING_OPTIONS.find((item) => item.id === furnishing);
  return found ? found.label : furnishing;
}

/**
 * Safely extracts real estate details from a place object.
 * Returns null if missing or if the category is not real estate.
 */
export function getRealEstateDetails(
  place: {
    category?: string | null;
    real_estate_details?: RealEstateDetailsDraft | null;
  } | null | undefined,
): RealEstateDetailsDraft | null {
  if (!place || place.category !== 'real_estate') return null;
  if (place.real_estate_details && typeof place.real_estate_details === 'object') {
    return place.real_estate_details;
  }
  return null;
}
