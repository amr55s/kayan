import { redirect } from 'next/navigation';
import { AdminMfaSetup } from '@/components/security/AdminMfaSetup';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function safeNextPath(value: string | string[] | undefined): string {
  if (
    typeof value !== 'string'
    || !/^\/admin(?:\/|$)/u.test(value)
    || /^\/admin\/mfa(?:\/|$|\?)/u.test(value)
  ) {
    return '/admin';
  }
  return value;
}

export default async function AdminMfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireProfile(['admin']);
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (data?.currentLevel === 'aal2') redirect(nextPath);

  return <AdminMfaSetup nextPath={nextPath} />;
}
