'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type GoogleApplicant = {
  displayName: string;
  email: string;
  avatarUrl: string;
};

export function useGoogleApplicant(enabled: boolean) {
  const [identity, setIdentity] = useState<GoogleApplicant | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    createClient().auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const hasGoogleIdentity = user?.identities?.some(
        (item) => item.provider === 'google',
      );
      if (!user || !hasGoogleIdentity) {
        setIdentity(null);
      } else {
        const metadata = user.user_metadata ?? {};
        setIdentity({
          displayName: String(metadata.full_name || metadata.name || metadata.display_name || ''),
          email: user.email ?? '',
          avatarUrl: String(metadata.avatar_url || metadata.picture || ''),
        });
      }
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setIdentity(null);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [enabled]);

  return { identity, isLoading };
}
