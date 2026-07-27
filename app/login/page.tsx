import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentProfile } from '@/lib/auth/guards';
import { dashboardPathForRole } from '@/lib/auth/routes';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const changePassword = params['change-password'] === '1';
  const profile = await getCurrentProfile();

  if (!profile && changePassword) redirect('/login');
  if (profile?.is_active) {
    if (profile.must_change_password && !changePassword) redirect('/login?change-password=1');
    if (!profile.must_change_password) redirect(dashboardPathForRole(profile.role));
  }

  return <Suspense><LoginForm /></Suspense>;
}
