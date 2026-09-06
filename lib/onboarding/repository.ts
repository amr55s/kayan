import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { onboardingDraftSchema, saveOnboardingDraftSchema, workspaceSummarySchema } from './validation';
import type { OnboardingDraft, SaveOnboardingDraftInput, WorkspaceSummary } from './types';

export class OnboardingConflictError extends Error {
  constructor() { super('onboarding_version_conflict'); this.name = 'OnboardingConflictError'; }
}

// Generated RPC signatures validate inputs; Zod validates each JSON response.
// Ownership stays in the authenticated database functions, never a service client.
function onboardingRpcData({ data, error }: {
  data: unknown; error: { message: string } | null;
}) {
  if (error) {
    if (error.message.includes('onboarding_version_conflict')) throw new OnboardingConflictError();
    throw new Error(error.message);
  }
  return data;
}

export async function readMyOnboardingDrafts(): Promise<OnboardingDraft[]> {
  const client = await createClient();
  return onboardingDraftSchema.array().parse(onboardingRpcData(await client.rpc('read_my_onboarding_drafts')));
}

export async function listMyActivityWorkspaces(): Promise<WorkspaceSummary[]> {
  const client = await createClient();
  return workspaceSummarySchema.array().parse(onboardingRpcData(await client.rpc('list_my_activity_workspaces')));
}

export async function saveMyOnboardingDraft(input: SaveOnboardingDraftInput): Promise<OnboardingDraft> {
  const value = saveOnboardingDraftSchema.parse(input);
  const client = await createClient();
  return onboardingDraftSchema.parse(onboardingRpcData(await client.rpc('save_my_onboarding_draft', {
    p_activity_kind: value.activityKind, p_step: value.step, p_data: value.data,
    p_expected_version: value.expectedVersion,
    // Omission uses the SQL NULL default for a first save.
    ...(value.draftId ? { p_draft_id: value.draftId } : {}),
  })));
}
