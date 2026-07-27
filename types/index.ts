/**
 * KayanHub (كيان هب) - Shared TypeScript Interfaces & Types
 * Hyper-Local Directory System Definitions
 */

export type CategoryType =
  | 'all'
  | 'restaurants'
  | 'home_made'
  | 'market'
  | 'veggies'
  | 'pharmacy'
  | 'crafts'
  | 'services';

export interface CategoryOption {
  id: CategoryType;
  label: string;
  subtitle?: string;
  icon?: string;
  description?: string;
}

export interface Driver {
  id: string;
  name: string | null;
  phone: string;
  whatsapp?: string | null;
  vehicle_type?: string | null;
  is_active: boolean;
  is_available: boolean;
  active_until?: string | null;
  created_at: string;
  source: 'public' | 'account';
}

export interface Place {
  id: string;
  title: string;
  category: CategoryType | string;
  phone: string;
  whatsapp?: string | null;
  instapay_vfcash?: string | null;
  description?: string | null;
  images: string[];
  is_featured: boolean;
  recommend_count?: number;
  created_at: string;
}

export type PendingStatus = 'pending' | 'approved' | 'rejected';

export interface PendingRequest {
  id: string;
  title: string;
  category: CategoryType | string;
  phone: string;
  whatsapp?: string | null;
  instapay_vfcash?: string | null;
  description?: string | null;
  images: string[];
  status: PendingStatus;
  created_at: string;
}

export interface NewPlaceSubmission {
  title: string;
  category: CategoryType | string;
  phone: string;
  whatsapp?: string;
  instapay_vfcash?: string;
  description?: string;
  images?: string[];
}

export type FeedbackType =
  | 'merchant_update'   // تعديل شامل مقدم من حساب محل
  | 'menu_update'       // منيو جديد أو صور جديدة
  | 'phone_change'      // تغيير رقم الهاتف أو الواتساب
  | 'report_issue'      // الإبلاغ عن مشكلة أو بيانات غير صحيحة
  | 'general_suggestion'// اقتراح أو ملاحظة عامة
  | 'rating';           // تقييم عام للتجربة

export interface FeedbackRequest {
  id: string;
  target_place_id?: string | null;
  place_name_or_phone: string;
  feedback_type: FeedbackType;
  source?: 'public' | 'merchant';
  submitted_by?: string | null;
  rating?: number | null;
  contact_phone: string;
  proposed_phone?: string | null;
  proposed_title?: string | null;
  proposed_category?: string | null;
  proposed_whatsapp?: string | null;
  proposed_instapay_vfcash?: string | null;
  proposed_description?: string | null;
  notes: string;
  images?: string[];
  proposed_images?: string[];
  status: 'pending' | 'resolved';
  created_at: string;
}

export type FeedbackImageMode = 'append' | 'replace';

export interface MerchantBranch {
  id: string;
  merchant_id: string;
  place_id?: string | null;
  name: string;
  phone: string;
  address: string;
  area: string;
  is_default: boolean;
  is_active: boolean;
}

export interface AccountRequest {
  id: string;
  kind: 'driver' | 'merchant';
  status: 'pending' | 'approved' | 'rejected';
  auth_user_id: string;
  display_name: string;
  phone: string;
  whatsapp?: string | null;
  vehicle_type?: string | null;
  legacy_driver_id?: string | null;
  place_mode?: 'existing' | 'new' | null;
  existing_place_id?: string | null;
  place_title?: string | null;
  place_category?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}
