import { createPublicClient } from './public';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import type { Driver, Place, StoreCoupon } from '@/types';
import type { RealEstateDetailsDraft } from '@/lib/listings/config';

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

function queryTimeoutError(): Error & { code: string } {
  const error = new Error('query_timeout') as Error & { code: string };
  error.code = 'query_timeout';
  return error;
}

async function withTimeout<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs = 8_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(queryTimeoutError()), timeoutMs);
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

const PUBLIC_PLACE_COLUMNS = [
  'id',
  'title',
  'category',
  'description',
  'images',
  'is_featured',
  'created_at',
  'address',
  'map_url',
  'view_count',
  'recommend_count',
].join(', ');

async function queryPlaces(
  supabase: ReturnType<typeof createPublicClient>,
  columns: string,
): Promise<{ data: unknown; error: unknown }> {
  try {
    return await withTimeout(
      supabase
        .from('places')
        .select(columns)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false }),
    );
  } catch (error) {
    return { data: null, error };
  }
}

function mapPlaces(rows: unknown): Place[] {
  return ((rows ?? []) as Array<Place & {
    store_coupons?: StoreCoupon[];
    place_real_estate?: Array<{
      area_sqm: number | null; bathrooms: number | null; floor: number | null;
      furnishing: string | null; offer_type: string; price_egp: number;
      property_type: string; rooms: number | null;
    }>;
  }>).map((row) => {
    const { store_coupons: coupons, place_real_estate: realEstateRows, ...place } = row;
    const realEstate = realEstateRows?.[0];
    return {
      ...place,
      phone: place.phone ?? '',
      coupons: (coupons ?? []).sort((left, right) =>
        Number(right.is_featured) - Number(left.is_featured)
        || left.display_order - right.display_order,
      ),
      real_estate_details: realEstate
        ? {
            offerType: realEstate.offer_type,
            propertyType: realEstate.property_type,
            priceEgp: String(realEstate.price_egp),
            rooms: realEstate.rooms === null ? '' : String(realEstate.rooms),
            bathrooms: realEstate.bathrooms === null ? '' : String(realEstate.bathrooms),
            areaSqm: realEstate.area_sqm === null ? '' : String(realEstate.area_sqm),
            floor: realEstate.floor === null ? '' : String(realEstate.floor),
            furnishing: realEstate.furnishing ?? '',
          } as RealEstateDetailsDraft
        : null,
    } as Place;
  });
}

async function fetchPlaces(): Promise<Place[]> {
  const supabase = createPublicClient();
  const attempts = [
    `${PUBLIC_PLACE_COLUMNS}, store_coupons(*), place_real_estate(*)`,
    `${PUBLIC_PLACE_COLUMNS}, store_coupons(*)`,
    PUBLIC_PLACE_COLUMNS,
  ];
  let lastError: unknown;
  for (const columns of attempts) {
    const result = await queryPlaces(supabase, columns);
    if (!result.error) return mapPlaces(result.data);
    lastError = result.error;
  }
  throw lastError instanceof Error ? lastError : new Error('places_query_failed');
}

function maskPublicDriverContacts<T extends { phone?: string | null; whatsapp?: string | null }>(
  row: T,
): T {
  return {
    ...row,
    phone: '',
    whatsapp: null,
  };
}

async function fetchLegacyDrivers(): Promise<LegacyDriverRow[]> {
  try {
    const supabase = createPublicClient();
    try {
      const rpcResult: any = await withTimeout(
        (supabase as any).rpc('list_public_legacy_drivers'),
      );
      if (!rpcResult.error) {
        return (rpcResult.data ?? []) as LegacyDriverRow[];
      }
    } catch {
      // Fall through to the published drivers table.
    }

    const tableResult: any = await withTimeout(
      supabase
        .from('drivers')
        .select('id, name, vehicle_type, is_active, active_until, created_at')
        .order('created_at', { ascending: false }),
    );
    if (!tableResult.error) {
      return ((tableResult.data ?? []) as LegacyDriverRow[]).map(maskPublicDriverContacts);
    }
  } catch {
    // An empty public directory is preferable to failing the homepage.
  }
  return [];
}

async function fetchRegisteredDrivers(): Promise<RegisteredDriverRow[]> {
  const supabase = createPublicClient();
  try {
    const result: any = await withTimeout(
      supabase.rpc('list_public_registered_drivers'),
    );
    if (!result.error) {
      return (result.data ?? []) as RegisteredDriverRow[];
    }
  } catch {
    // Missing or timed-out registered-driver RPC is optional on older schemas.
  }
  return [];
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
    logSafeServerFailure('error', 'public_places_query_failed', {
      failure: placesResult.reason,
    });
    errors.push('الأماكن');
  }
  if (legacyResult.status === 'rejected') {
    logSafeServerFailure('warn', 'public_legacy_drivers_unavailable', {
      failure: 'drivers_unavailable',
    });
  }
  if (registeredResult.status === 'rejected') {
    logSafeServerFailure('warn', 'public_registered_drivers_unavailable', {
      failure: 'drivers_unavailable',
    });
  }

  return {
    renderedAt: Date.now(),
    places: placesResult.status === 'fulfilled' ? placesResult.value : [],
    drivers: mergePublicDrivers(
      legacyResult.status === 'fulfilled' ? legacyResult.value : [],
      registeredResult.status === 'fulfilled' ? registeredResult.value : [],
    ),
    directoryError: errors.length
      ? `تعذر تحميل بعض بيانات ديرتك (${errors.join('، ')}). يمكنك إعادة المحاولة.`
      : undefined,
  };
}
