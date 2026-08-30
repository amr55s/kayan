import React from 'react';
import {
  Input,
  Select,
  SelectItem,
} from '@/components/ui/heroui-compat';
import {
  REAL_ESTATE_FURNISHING_OPTIONS,
  REAL_ESTATE_OFFER_TYPES,
  REAL_ESTATE_PROPERTY_TYPES,
  isRoomsFieldRequired,
  type RealEstateDetailsDraft,
  type RealEstateFurnishing,
  type RealEstateOfferType,
  type RealEstatePropertyType,
} from '@/lib/listings/config.ts';

interface RealEstateListingFieldsProps {
  draft: RealEstateDetailsDraft;
  onChange: (updater: (prev: RealEstateDetailsDraft) => RealEstateDetailsDraft) => void;
  disabled?: boolean;
}

/**
 * Dedicated form controls for Real Estate listing details.
 *
 * Why this component exists:
 * Keeps the main AddListingModal clean and declarative while providing
 * specialized validation, mobile numeric inputs, and accessible offer/property
 * selectors for real estate properties.
 */
export const RealEstateListingFields: React.FC<RealEstateListingFieldsProps> = ({
  draft,
  onChange,
  disabled = false,
}) => {
  const roomsRequired = isRoomsFieldRequired(draft.propertyType);

  function handlePriceChange(value: string) {
    // Sanitize input: allow only digits, strip negative signs, decimal points, and scientific notation
    const sanitized = value.replace(/[^\d]/g, '');
    onChange((prev) => ({ ...prev, priceEgp: sanitized }));
  }

  function handleIntegerChange(field: 'rooms' | 'bathrooms' | 'areaSqm', value: string) {
    const sanitized = value.replace(/[^\d]/g, '');
    onChange((prev) => ({ ...prev, [field]: sanitized }));
  }

  return (
    <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:col-span-2">
      <div className="flex items-center justify-between border-b border-blue-100 pb-2">
        <h3 className="text-sm font-black text-blue-950">تفاصيل ومواصفات العقار</h3>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
          إيجار وتمليك
        </span>
      </div>

      {/* Offer Type Selector (Rent / Sale) */}
      <div>
        <label className="mb-1.5 block text-sm font-bold text-zinc-800 dark:text-zinc-100">
          نوع العرض <span className="text-rose-600">*</span>
        </label>
        <div
          role="radiogroup"
          aria-label="نوع العرض"
          className="grid grid-cols-2 gap-2"
        >
          {REAL_ESTATE_OFFER_TYPES.map((offer) => {
            const isSelected = draft.offerType === offer.id;
            return (
              <button
                key={offer.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    offerType: offer.id as RealEstateOfferType,
                  }))
                }
                className={`flex min-h-[48px] items-center justify-center rounded-xl border text-sm font-black transition-all ${
                  isSelected
                    ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {offer.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Property Type & Price Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          isRequired
          label="نوع العقار"
          selectedKeys={[draft.propertyType]}
          onSelectionChange={(keys) => {
            const selected = String(Array.from(keys)[0] || 'apartment') as RealEstatePropertyType;
            onChange((prev) => ({ ...prev, propertyType: selected }));
          }}
        >
          {REAL_ESTATE_PROPERTY_TYPES.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </Select>

        <div>
          <Input
            isRequired
            name="priceEgp"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            label="السعر المطلوب (جنيه مصري)"
            placeholder="مثال: 5000"
            value={draft.priceEgp}
            onValueChange={handlePriceChange}
            endContent={<span className="text-xs font-bold text-zinc-500">ج.م</span>}
          />
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">
            أدخل القيمة الصحيحة بالجنيه المصري (بدون فواصل أو علامات).
          </p>
        </div>
      </div>

      {/* Rooms, Bathrooms, Area, Floor Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {roomsRequired && (
          <Input
            isRequired={roomsRequired}
            name="rooms"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            label="عدد الغرف"
            placeholder="مثال: 3"
            value={draft.rooms ?? ''}
            onValueChange={(val) => handleIntegerChange('rooms', val)}
          />
        )}

        <Input
          name="bathrooms"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          label="الحمامات (اختياري)"
          placeholder="مثال: 2"
          value={draft.bathrooms ?? ''}
          onValueChange={(val) => handleIntegerChange('bathrooms', val)}
        />

        <Input
          name="areaSqm"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          label="المساحة بالمتر (اختياري)"
          placeholder="مثال: 120"
          value={draft.areaSqm ?? ''}
          onValueChange={(val) => handleIntegerChange('areaSqm', val)}
          endContent={<span className="text-xs font-bold text-zinc-500">م²</span>}
        />

        <Input
          name="floor"
          type="text"
          autoComplete="off"
          label="الدور / الطابق (اختياري)"
          placeholder="مثال: الدور الثالث أو أرضي"
          value={draft.floor ?? ''}
          onValueChange={(val) => onChange((prev) => ({ ...prev, floor: val }))}
        />

        <Select
          label="حالة الفرش (اختياري)"
          selectedKeys={draft.furnishing ? [draft.furnishing] : []}
          onSelectionChange={(keys) => {
            const selected = (Array.from(keys)[0] || '') as RealEstateFurnishing | '';
            onChange((prev) => ({ ...prev, furnishing: selected }));
          }}
        >
          <SelectItem key="" value="">
            غير محدد
          </SelectItem>
          {REAL_ESTATE_FURNISHING_OPTIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
};
