import { z } from 'zod';

export type MonitorSearchFilters = Partial<{
  role: 'customer' | 'merchant' | 'driver' | 'admin';
  storeId: string;
  orderId: string;
  driverId: string;
  unread: boolean;
  report: boolean;
  risk: boolean;
  status: 'open' | 'waiting_customer' | 'waiting_support' | 'resolved' | 'closed' | 'paused';
  from: string;
  to: string;
}>;

type QueryParameter = string | string[] | undefined;

const roleSchema = z.enum(['customer', 'merchant', 'driver', 'admin']);
const statusSchema = z.enum(['open', 'waiting_customer', 'waiting_support', 'resolved', 'closed', 'paused']);
const uuidSchema = z.uuid();

function readSingleQueryValue(value: QueryParameter): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readUuid(value: string | undefined): string | undefined {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function readBoolean(value: string | undefined): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

function readTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

/** Parse each allowlisted filter independently so one malformed query key
 * cannot broaden the rest of a monitor's authorized query. */
export function parseMonitorSearchFilters(raw: Record<string, QueryParameter>): MonitorSearchFilters {
  const role = roleSchema.safeParse(readSingleQueryValue(raw.role));
  const status = statusSchema.safeParse(readSingleQueryValue(raw.status));
  const parsed: MonitorSearchFilters = {
    role: role.success ? role.data : undefined,
    status: status.success ? status.data : undefined,
    storeId: readUuid(readSingleQueryValue(raw.storeId)),
    orderId: readUuid(readSingleQueryValue(raw.orderId)),
    driverId: readUuid(readSingleQueryValue(raw.driverId)),
    unread: readBoolean(readSingleQueryValue(raw.unread)),
    report: readBoolean(readSingleQueryValue(raw.report)),
    risk: readBoolean(readSingleQueryValue(raw.risk)),
    from: readTime(readSingleQueryValue(raw.from)),
    to: readTime(readSingleQueryValue(raw.to)),
  };
  if (parsed.from && parsed.to && new Date(parsed.from).valueOf() > new Date(parsed.to).valueOf()) delete parsed.to;
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)) as MonitorSearchFilters;
}
