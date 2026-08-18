import 'server-only';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdminAal2, type RequireAdminAal2Options } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const marketplaceAdminRoles = [
  'super_admin', 'operations', 'support', 'finance', 'catalog_reviewer',
] as const;
export type MarketplaceAdminRole = (typeof marketplaceAdminRoles)[number];

const roleSchema = z.enum(marketplaceAdminRoles);
const membershipSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().min(2).max(100),
  phone: z.string().min(1).max(32),
  profile_active: z.boolean(),
  roles: z.array(roleSchema).max(5),
  membership_active: z.boolean(),
  version: z.coerce.number().int().nonnegative(),
  updated_at: z.string().min(16).max(64).nullable(),
});

export type MarketplaceAdminMembership = z.infer<typeof membershipSchema>;

async function roleRpc<T>(name: string, params: Record<string, unknown> | undefined, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) {
    const message = error.message ?? '';
    if (/last_super_admin_cannot_be_removed/u.test(message)) throw new Error('last_super_admin');
    if (/admin_membership_version_conflict|admin_membership_idempotency_conflict/u.test(message)) {
      throw new Error('version_conflict');
    }
    if (/admin_role_required|admin_membership_required|super_admin_required/u.test(message)) {
      throw new Error('admin_role_required');
    }
    if (/invalid_admin_membership/u.test(message)) throw new Error('invalid_admin_membership');
    throw new Error('admin_membership_service_unavailable');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('admin_membership_contract_invalid');
  return parsed.data;
}

export async function getMyMarketplaceAdminRoles(): Promise<MarketplaceAdminRole[]> {
  await requireAdminAal2({ failureMode: 'throw' });
  return roleRpc('get_my_marketplace_admin_roles', undefined, z.array(roleSchema).max(5));
}

export async function requireMarketplaceAdminRole(
  roles: readonly MarketplaceAdminRole[],
  options: RequireAdminAal2Options = {},
) {
  const profile = await requireAdminAal2(options);
  let assigned: MarketplaceAdminRole[];
  try {
    assigned = await getMyMarketplaceAdminRoles();
  } catch (error) {
    if (options.failureMode === 'throw') throw error;
    if (!(error instanceof Error) || error.message !== 'admin_role_required') throw error;
    redirect('/login?error=admin_role_required');
  }
  if (!assigned.includes('super_admin') && !roles.some((role) => assigned.includes(role))) {
    if (options.failureMode === 'throw') throw new Error('admin_role_required');
    redirect('/admin/marketplace/orders?error=admin_role_required');
  }
  return { profile, roles: assigned };
}

export async function listMarketplaceAdminMemberships(): Promise<MarketplaceAdminMembership[]> {
  await requireMarketplaceAdminRole(['super_admin'], { failureMode: 'throw' });
  return roleRpc(
    'list_marketplace_admin_memberships',
    undefined,
    z.array(membershipSchema).max(250),
  );
}

export async function saveMarketplaceAdminMembership(input: {
  userId: string;
  roles: MarketplaceAdminRole[];
  isActive: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}): Promise<void> {
  await requireMarketplaceAdminRole(['super_admin'], { failureMode: 'throw' });
  await roleRpc('save_marketplace_admin_membership', {
    p_user_id: input.userId,
    p_roles: input.roles,
    p_is_active: input.isActive,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
  }, z.object({ user_id: z.uuid(), version: z.coerce.number().int().positive() }).passthrough());
}
