'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  marketplaceAdminRoles,
  saveMarketplaceAdminMembership,
  type MarketplaceAdminRole,
} from '@/lib/admin/marketplace-memberships';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function saveMarketplaceAdminMembershipAction(form: FormData): Promise<void> {
  const userId = String(form.get('userId') ?? '');
  const expectedVersionRaw = String(form.get('expectedVersion') ?? '');
  const requestedRoles = form.getAll('roles').filter((value): value is string => typeof value === 'string');
  const roles = marketplaceAdminRoles.filter((role) => requestedRoles.includes(role));
  const suppliedKey = String(form.get('idempotencyKey') ?? '');
  let destination = '/admin/marketplace/memberships?notice=membership_saved';
  try {
    if (!UUID.test(userId) || !/^\d{1,12}$/u.test(expectedVersionRaw)
      || roles.length < 1 || roles.length !== requestedRoles.length
      || requestedRoles.length !== new Set(requestedRoles).size) {
      throw new Error('invalid_admin_membership');
    }
    await saveMarketplaceAdminMembership({
      userId,
      roles: roles as MarketplaceAdminRole[],
      isActive: form.get('isActive') === 'on',
      expectedVersion: Number(expectedVersionRaw),
      idempotencyKey: UUID.test(suppliedKey) ? suppliedKey : randomUUID(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /last_super_admin/u.test(message) ? 'last_super_admin'
      : /version_conflict/u.test(message) ? 'conflict'
        : /admin_role_required|super_admin_required/u.test(message) ? 'access_denied'
          : /invalid_/u.test(message) ? 'invalid_input' : 'save_failed';
    destination = `/admin/marketplace/memberships?error=${code}`;
  }
  revalidatePath('/admin/marketplace/memberships');
  redirect(destination);
}
