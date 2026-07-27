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
  if (!profile || !profile.is_active) redirect('/login');
  if (profile.must_change_password) redirect('/login?change-password=1');
  if (roles && !roles.includes(profile.role)) redirect(dashboardPathForRole(profile.role));
  return profile;
}
