'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const MONITOR_SESSION_KEY = 'dairtak.marketplace-chat-monitor-session';

function monitorSessionId(): string {
  const existing = window.sessionStorage.getItem(MONITOR_SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(MONITOR_SESSION_KEY, created);
  return created;
}

/** The server page is still capability-gated; this records an open with the
 * browser session identifier so revisits dedupe at the database unique index. */
export function MonitorOpenAudit({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    const client = createClient();
    // Generated types refresh only after the locally committed migration is applied.
    // @ts-expect-error Task 10 RPC intentionally precedes generated types.
    void client.rpc('record_marketplace_chat_monitor_open', {
      p_thread_id: conversationId,
      p_monitor_session_id: monitorSessionId(),
    });
  }, [conversationId]);
  return null;
}
