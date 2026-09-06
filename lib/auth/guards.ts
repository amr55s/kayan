import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardPathForRole, type AppRole } from '@/lib/auth/routes';

export interface CurrentProfile {
  id: string;
  role: AppRole;
  phone: string;
  display_name: string;
  merchant_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await (supabase as any)
    .from('profiles')
    .select('id, role, phone, display_name, merchant_id, is_active, must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  return data as CurrentProfile | null;
}

export async function requireProfile(roles?: AppRole[]): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect('/signin?next=%2Fonboarding');
  if (profile.must_change_password) redirect('/login?change-password=1');
  if (roles) {
    const supabase = await createClient();
    const operationalRoles = roles.filter((role) => role !== 'admin');
    const permissions = await Promise.all(operationalRoles.map(async (role) => {
      const { data, error } = await (supabase as any).rpc('has_my_activity_access', { p_activity: role });
      return !error && data === true;
    }));
    const allowed = (roles.includes('admin') && profile.role === 'admin') || permissions.some(Boolean);
    if (!allowed) redirect('/onboarding');
  }
  return profile;
}

/** Server actions use this without redirects; authorization never rewrites role. */
export async function requireOperationalActivity(role: 'merchant' | 'driver'): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile?.is_active || profile.must_change_password) throw new Error('activity_access_required');
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('has_my_activity_access', { p_activity: role });
  if (error || data !== true) throw new Error('activity_access_required');
  return profile;
}

export type AdminAal2FailureMode = 'redirect' | 'throw';

export interface RequireAdminAal2Options {
  failureMode?: AdminAal2FailureMode;
  nextPath?: string;
  /** A durable marketplace-admin membership capability, never user metadata. */
  capability?: 'chat_monitor';
}

function safeAdminNextPath(value?: string): string {
  if (!value || !/^\/admin(?:\/|$)/u.test(value) || /^\/admin\/mfa(?:\/|$|\?)/u.test(value)) {
    return '/admin';
  }
  return value;
}

function failAdminGuard(
  code: 'admin_access_required' | 'admin_mfa_required',
  options: RequireAdminAal2Options,
  profile?: CurrentProfile | null,
): never {
  if (options.failureMode === 'throw') throw new Error(code);
  if (!profile || !profile.is_active) redirect('/login');
  if (profile.must_change_password) redirect('/login?change-password=1');
  if (profile.role !== 'admin') redirect(dashboardPathForRole(profile.role));

  const next = safeAdminNextPath(options.nextPath);
  redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
}

/**
 * Enforces the administrative role and a freshly verified Supabase MFA session.
 * Pages redirect to the TOTP flow; Server Actions can request a stable error code
 * so their existing result handling cannot accidentally swallow a Next redirect.
 */
export async function requireAdminAal2(
  options: RequireAdminAal2Options = {},
): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (
    !profile
    || !profile.is_active
    || profile.must_change_password
    || profile.role !== 'admin'
  ) {
    failAdminGuard('admin_access_required', options, profile);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data.currentLevel !== 'aal2') {
    failAdminGuard('admin_mfa_required', options, profile);
  }

  if (options.capability === 'chat_monitor') {
    const { data: allowed, error: capabilityError } = await supabase.rpc(
      'has_marketplace_admin_role',
      { p_roles: ['chat_monitor'] },
    );
    if (capabilityError || allowed !== true) {
      failAdminGuard('admin_access_required', options, profile);
    }
  }

  return profile;
}
