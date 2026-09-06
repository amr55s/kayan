'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { saveMyOnboardingDraft, OnboardingConflictError } from './repository';
import { logSafeServerFailure } from '@/lib/observability/server-log';
import type { OnboardingDraft, SaveOnboardingDraftInput } from './types';

export type DraftSaveResult = { success: true; draft: OnboardingDraft }
  | { success: false; code: 'conflict' | 'session' | 'failed'; message: string };

export async function saveOnboardingDraftAction(input: SaveOnboardingDraftInput): Promise<DraftSaveResult> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return { success: false, code: 'session', message: 'انتهت الجلسة. سجّل الدخول مجددًا ثم أعد محاولة الحفظ.' };
    return { success: true, draft: await saveMyOnboardingDraft(input) };
  } catch (error) {
    if (error instanceof OnboardingConflictError) {
      return { success: false, code: 'conflict', message: 'توجد نسخة أحدث من مسودتك في تبويب آخر. لم نستبدلها بتعديلات هذا التبويب.' };
    }
    logSafeServerFailure('warn', 'onboarding_draft_save_failed', { failure: error });
    return { success: false, code: 'failed', message: 'لم تُحفظ آخر التعديلات. تحقق من الاتصال ثم أعد المحاولة.' };
  }
}

export async function submitOnboardingDraftAction(input: { draftId: string; expectedVersion: number }): Promise<
  { success: true; workspaceId: string } | { success: false; message: string }
> {
  const parsed = z.object({ draftId: z.uuid(), expectedVersion: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { success: false, message: 'احفظ المسودة أولًا ثم حاول إرسالها.' };
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { success: false, message: 'سجّل الدخول مرة أخرى لاستكمال الطلب.' };
    const { data, error } = await client.rpc('submit_my_onboarding_draft', {
      p_draft_id: parsed.data.draftId, p_expected_version: parsed.data.expectedVersion,
    });
    if (error) {
      const message = error.message.includes('onboarding_version_conflict')
        ? 'المسودة تغيرت في تبويب آخر. افتح أحدث نسخة قبل الإرسال.'
        : error.message.includes('onboarding_incomplete')
          ? 'راجع البيانات المطلوبة والصور قبل الإرسال.'
          : 'تعذر إرسال الطلب الآن. مسودتك محفوظة ويمكنك المحاولة مرة أخرى.';
      return { success: false, message };
    }
    const result = z.object({ workspaceId: z.uuid() }).parse(data);
    revalidatePath('/onboarding');
    revalidatePath('/workspaces');
    return { success: true, workspaceId: result.workspaceId };
  } catch (error) {
    logSafeServerFailure('warn', 'onboarding_submit_failed', { failure: error });
    return { success: false, message: 'تعذر إرسال الطلب الآن. لم نفقد المسودة؛ حاول مرة أخرى.' };
  }
}
