export const ACTIVITY_KINDS = ['store', 'restaurant', 'service', 'real_estate', 'driver'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type OnboardingStep = 1 | 2 | 3 | 4;
export type WorkspaceStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface OnboardingDraftData {
  displayName?: string;
  phone?: string;
  whatsapp?: string;
  name?: string;
  description?: string;
  address?: string;
  placeMode?: 'new' | 'existing';
  existingPlaceId?: string;
  category?: string;
  vehicleType?: string;
  product?: { name: string; description: string; priceEgp: string };
  realEstate?: {
    offerType: string; propertyType: string; priceEgp: string;
    rooms?: string; bathrooms?: string; areaSqm?: string; floor?: string; furnishing?: string;
  };
  mediaIds?: string[];
}

export interface OnboardingDraft {
  id: string;
  userId: string;
  activityKind: ActivityKind;
  step: OnboardingStep;
  version: number;
  status: 'draft' | 'submitted';
  data: OnboardingDraftData;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  activityKind: ActivityKind;
  name: string;
  status: WorkspaceStatus;
  membershipRole: 'owner' | 'manager' | 'member';
  merchantId: string | null;
  storeId: string | null;
  driverProfileId: string | null;
  canManage: boolean;
}

export interface SaveOnboardingDraftInput {
  activityKind: ActivityKind;
  step: OnboardingStep;
  data: OnboardingDraftData;
  expectedVersion: number;
  draftId?: string;
}
