'use client';

import { useCallback, useEffect } from 'react';

const DEFAULT_MESSAGE = 'لديك بيانات لم تُرسل بعد. هل تريد إغلاق النموذج؟';

export function useUnsavedChanges(
  enabled: boolean,
  message = DEFAULT_MESSAGE,
) {
  useEffect(() => {
    if (!enabled) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [enabled]);

  return useCallback(
    () => !enabled || window.confirm(message),
    [enabled, message],
  );
}
