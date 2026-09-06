import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicMediaUrl, readPrivateMediaObject, writePublicMediaObject } from '@/lib/media/spaces';

const jobSchema = z.object({ id: z.uuid(), token: z.uuid(), draftId: z.uuid(), assets: z.array(z.object({
  id: z.uuid(), key: z.string().regex(/^onboarding\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})).max(7).refine(assets => new Set(assets.map(asset => asset.id)).size === assets.length) });
const leaseSchema = z.object({ draft_id: z.uuid(), workspace_id: z.uuid(), status: z.literal('processing'),
  lease_token: z.uuid(), lease_until: z.string().datetime({ offset: true }),
});
const draftSchema = z.object({ user_id: z.uuid(), request_id: z.uuid(), status: z.literal('submitted') });
const MAX_BYTES = 3 * 1024 * 1024;
const MIN_LEASE_MS = 15_000;

/** One bounded, leased job. Retrying uses the same immutable content-addressed object keys. */
export async function processOnboardingPublication() {
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc('claim_onboarding_publication_job');
  if (error) throw new Error('onboarding_publication_claim_failed');
  if (!data) return { completed: 0 };
  const job = jobSchema.parse(data);
  // The claim is a snapshot. Fail closed if approval or lease changed while reading images.
  // S3 writes cannot be transactional with PostgreSQL; finish also locks/rechecks approval.
  async function requireLiveApproval() {
    const { data: rawLease, error: leaseError } = await admin.from('onboarding_publication_jobs')
      .select('draft_id,workspace_id,status,lease_token,lease_until').eq('id', job.id).maybeSingle();
    const lease = leaseSchema.safeParse(rawLease);
    if (leaseError || !lease.success || lease.data.draft_id !== job.draftId || lease.data.lease_token !== job.token
      || Date.parse(lease.data.lease_until) - Date.now() < MIN_LEASE_MS) {
      throw new Error('onboarding_publication_lease_unavailable');
    }
    const { data: rawDraft, error: draftError } = await admin.from('onboarding_drafts')
      .select('user_id,request_id,status').eq('id', job.draftId).maybeSingle();
    const draft = draftSchema.safeParse(rawDraft);
    if (draftError || !draft.success) throw new Error('onboarding_publication_draft_unavailable');
    const [workspace, request] = await Promise.all([
      admin.from('activity_workspaces').select('id').eq('id', lease.data.workspace_id).eq('status', 'approved').maybeSingle(),
      admin.from('account_requests').select('id').eq('id', draft.data.request_id)
        .eq('auth_user_id', draft.data.user_id).eq('workspace_id', lease.data.workspace_id).eq('status', 'approved').maybeSingle(),
    ]);
    if (workspace.error || !workspace.data || request.error || !request.data) {
      throw new Error('onboarding_publication_not_approved');
    }
    return draft.data.user_id;
  }
  const ownerId = await requireLiveApproval();
  // Validate all references before reading, and all checksums before making any copy public.
  for (const asset of job.assets) {
    if (asset.key !== `onboarding/${ownerId}/${job.draftId}/${asset.id}.webp`) {
      throw new Error('onboarding_publication_owner_mismatch');
    }
  }
  const prepared: { key: string; bytes: Buffer; sha256: string }[] = [];
  for (let index = 0; index < job.assets.length; index += 3) {
    prepared.push(...await Promise.all(job.assets.slice(index, index + 3).map(async asset => {
      const bytes = await readPrivateMediaObject(asset.key, MAX_BYTES);
      if (bytes.length < 32 || bytes.length > MAX_BYTES
        || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
        throw new Error('onboarding_publication_checksum_mismatch');
      }
      return { bytes, sha256: asset.sha256,
        key: `directory/onboarding/${job.draftId}/${asset.id}-${asset.sha256}.webp` };
    })));
  }
  const urls: string[] = [];
  // At most seven 3MB images in memory, three transfers at a time, stable gallery order.
  for (let index = 0; index < prepared.length; index += 3) {
    await requireLiveApproval();
    const batch = await Promise.all(prepared.slice(index, index + 3).map(async asset => {
      await writePublicMediaObject({ objectKey: asset.key, body: asset.bytes, contentType: 'image/webp', checksumSha256: asset.sha256 });
      return getPublicMediaUrl(asset.key);
    }));
    urls.push(...batch);
  }
  await requireLiveApproval();
  try {
    const { error: completeError } = await admin.rpc('finish_onboarding_publication_job', {
      p_job_id: job.id, p_token: job.token, p_urls: urls,
    });
    if (completeError) throw new Error('onboarding_publication_complete_failed');
  } catch {
    // A lost acknowledgement must not delete objects or falsely report an already-finished job.
    const { data: completed, error: completionError } = await admin.from('onboarding_publication_jobs')
      .select('id').eq('id', job.id).eq('draft_id', job.draftId).eq('status', 'complete').maybeSingle();
    if (completionError || !completed) throw new Error('onboarding_publication_complete_failed');
  }
  return { completed: 1 };
}
