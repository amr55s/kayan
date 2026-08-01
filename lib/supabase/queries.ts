import { createPublicClient } from './public';
import { createAdminClient } from './admin';
import type { Driver, Place, StoreCoupon } from '@/types';

type QueryOutcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

type LegacyDriverRow = {
  id: string;
  name: string | null;
  phone: string;
  whatsapp: string | null;
  vehicle_type: string | null;
  is_active: boolean;
  active_until: string | null;
  created_at: string;
};

type RegisteredDriverRow = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  vehicle_type: string | null;
  avatar_url: string | null;
  is_available: boolean;
  active_until: string | null;
  created_at: string;
};

async function settle<T>(work: Promise<T>): Promise<QueryOutcome<T>> {
  try {
    return { status: 'fulfilled', value: await work };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

async function withTimeout<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs = 8_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('انتهت مهلة تحميل كيان سيتي سبوت.')), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isCurrentlyAvailable(isActive: boolean, activeUntil: string | null): boolean {
  if (!isActive || !activeUntil) return false;
  return new Date(activeUntil).getTime() > Date.now();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('20') && digits.length === 12 ? digits.slice(2) : digits;
}

export function mergePublicDrivers(
  legacyRows: LegacyDriverRow[],
  registeredRows: RegisteredDriverRow[],
): Driver[] {
  const merged = new Map<string, Driver>();

  for (const row of legacyRows) {
    const key = normalizePhone(row.phone) || `public:${row.id}`;
    merged.set(key, {
      id: row.id,
      name: row.name,
      phone: row.phone,
      whatsapp: row.whatsapp,
      vehicle_type: row.vehicle_type,
      is_active: row.is_active,
      is_available: isCurrentlyAvailable(row.is_active, row.active_until),
      active_until: row.active_until,
      created_at: row.created_at,
      source: 'public',
    });
  }

  for (const row of registeredRows) {
    const key = normalizePhone(row.phone) || `account:${row.id}`;
    const legacy = merged.get(key);
    merged.set(key, {
      id: row.id,
      name: row.name || legacy?.name || 'كابتن توصيل',
      phone: row.phone,
      whatsapp: row.whatsapp || legacy?.whatsapp || row.phone,
      vehicle_type: row.vehicle_type || legacy?.vehicle_type || null,
      avatar_url: row.avatar_url,
      is_active: true,
      is_available: row.is_available,
      active_until: row.active_until,
      created_at: row.created_at || legacy?.created_at || new Date(0).toISOString(),
      source: 'account',
    });
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.is_available !== right.is_available) return left.is_available ? -1 : 1;
    return (left.name || 'كابتن توصيل').localeCompare(
      right.name || 'كابتن توصيل',
      'ar',
    );
  });
}

async function fetchPlaces(): Promise<Place[]> {
  const supabase = createPublicClient();
  let result: any = await withTimeout(
    supabase
      .from('places')
      .select('*, store_coupons(*)')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false }),
  );

  // Keep the directory available during a staged deployment where the app
  // reaches production a few seconds before the additive coupon migration.
  if (result.error) {
    result = await withTimeout(
      supabase
        .from('places')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false }),
    );
  }

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map((row: Place & { store_coupons?: StoreCoupon[] }) => {
    const { store_coupons: coupons, ...place } = row;
    return {
      ...place,
      coupons: (coupons ?? []).sort((left, right) =>
        Number(right.is_featured) - Number(left.is_featured)
        || left.display_order - right.display_order,
      ),
    } as Place;
  });
}

async function fetchLegacyDrivers(): Promise<LegacyDriverRow[]> {
  const supabase = createAdminClient();
  const result: any = await withTimeout(
    (supabase as any).rpc('list_public_legacy_drivers'),
  );

  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as LegacyDriverRow[];
}

async function fetchRegisteredDrivers(): Promise<RegisteredDriverRow[]> {
  const supabase = createAdminClient();
  const result = await withTimeout(supabase.rpc('list_public_registered_drivers'));
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as RegisteredDriverRow[];
}

export async function fetchPublicDrivers(): Promise<Driver[]> {
  const [legacyResult, registeredResult] = await Promise.all([
    settle(fetchLegacyDrivers()),
    settle(fetchRegisteredDrivers()),
  ]);
  return mergePublicDrivers(
    legacyResult.status === 'fulfilled' ? legacyResult.value : [],
    registeredResult.status === 'fulfilled' ? registeredResult.value : [],
  );
}

export async function fetchHomePageData(): Promise<{
  places: Place[];
  drivers: Driver[];
  directoryError?: string;
  renderedAt: number;
}> {
  const [placesResult, legacyResult, registeredResult] = await Promise.all([
    settle(fetchPlaces()),
    settle(fetchLegacyDrivers()),
    settle(fetchRegisteredDrivers()),
  ]);

  const errors: string[] = [];
  if (placesResult.status === 'rejected') {
    console.error('Public places query failed:', placesResult.reason);
    errors.push('الأماكن');
  }
  if (legacyResult.status === 'rejected') {
    console.error('Public drivers query failed:', legacyResult.reason);
    errors.push('الكباتن المسجلون سريعاً');
  }
  if (registeredResult.status === 'rejected') {
    console.error('Registered drivers query failed:', registeredResult.reason);
    errors.push('كباتن نظام التشغيل');
  }

  return {
    renderedAt: Date.now(),
    places: placesResult.status === 'fulfilled' ? placesResult.value : [],
    drivers: mergePublicDrivers(
      legacyResult.status === 'fulfilled' ? legacyResult.value : [],
      registeredResult.status === 'fulfilled' ? registeredResult.value : [],
    ),
    directoryError: errors.length
      ? `تعذر تحميل بعض بيانات كيان سيتي سبوت (${errors.join('، ')}). يمكنك إعادة المحاولة.`
      : undefined,
  };
}
