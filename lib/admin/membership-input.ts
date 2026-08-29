import { z } from 'zod';

export const marketplaceAdminRoles = [
  'super_admin', 'operations', 'support', 'finance', 'catalog_reviewer', 'chat_monitor',
] as const;
export type MarketplaceAdminRole = (typeof marketplaceAdminRoles)[number];

const requestedRolesSchema = z.array(z.enum(marketplaceAdminRoles)).min(1).max(5)
  .refine((roles) => new Set(roles).size === roles.length, 'duplicate roles are not allowed');

export function parseMarketplaceAdminMembershipRoles(input: readonly string[]): MarketplaceAdminRole[] | null {
  const parsed = requestedRolesSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
