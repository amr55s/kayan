/**
 * DAIRTAK Utility Helpers
 */

/**
 * Validates Egyptian phone numbers (010, 011, 012, 015 - 11 digits or +20 format)
 */
export function isValidEgyptianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^\d]/g, '');
  return /^(20)?01[0125]\d{8}$/.test(cleaned);
}

/**
 * Formats a phone number cleanly for click-to-call links (tel:01xxxxxxxx)
 */
export function formatPhoneForTel(phone: string): string {
  const cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return `0${cleaned.slice(2)}`;
  }
  return cleaned;
}

/**
 * Formats a phone number for WhatsApp link (https://wa.me/201xxxxxxxxx).
 * Auto-prepends Egyptian country code 20 if missing.
 */
export function formatWhatsAppUrl(phone: string, text?: string): string {
  const cleaned = phone.replace(/[^\d]/g, '');
  let formattedPhone = cleaned;

  if (cleaned.startsWith('01') && cleaned.length === 11) {
    formattedPhone = `2${cleaned}`; // 2 + 01xxxxxxxxx = 201xxxxxxxxx
  } else if (cleaned.startsWith('1') && cleaned.length === 10) {
    formattedPhone = `20${cleaned}`;
  }

  const encodedText = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${formattedPhone}${encodedText}`;
}

export { getCategoryLabel } from '@/lib/categories';
