import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const mediaPath = new URL('../../lib/commerce/chat/media.ts', import.meta.url);
const routePath = new URL('../../app/api/marketplace/chat/attachments/route.ts', import.meta.url);
const migrationPath = new URL('../../supabase/migrations/20260829100000_marketplace_chat_private_media.sql', import.meta.url);

const read = (url) => readFileSync(url, 'utf8');

test('private chat media has a server-only contract and no client-controlled object locator', () => {
  assert.equal(existsSync(mediaPath), true);
  const source = read(mediaPath);
  assert.match(source, /MAX_CHAT_ATTACHMENT_BYTES\s*=\s*8\s*\*\s*1024\s*\*\s*1024/u);
  assert.match(source, /chat\/\$\{input\.conversationId\}\/\$\{input\.userId\}\/\$\{input\.sha256\}\.\$\{extension\}/u);
  assert.match(source, /createPrivateStageUpload/u);
  assert.match(source, /getPrivateMediaBucketName/u);
  assert.match(source, /createPrivateMediaDownload\(attachment\.objectKey, 60\)/u);
  assert.match(source, /sharp\(/u);
  assert.match(source, /4096/u);
  assert.match(source, /createHash\('sha256'\)/u);
  assert.doesNotMatch(source, /input\.(?:bucket|objectKey|key)/u);
  assert.doesNotMatch(source, /public-read/u);
});

test('attachment route enforces same-origin auth and completion validation', () => {
  assert.equal(existsSync(routePath), true);
  const source = read(routePath);
  assert.match(source, /requestOrigin\(request\)/u);
  assert.match(source, /supabase\.auth\.getUser\(\)/u);
  assert.match(source, /beginChatAttachment/u);
  assert.match(source, /completeChatAttachment/u);
  assert.match(source, /deletePendingChatAttachment/u);
  assert.match(source, /cache-control': 'private, no-store'/u);
  assert.doesNotMatch(source, /bucket.*request|objectKey.*request|key.*request/iu);
});

test('migration keeps attachment metadata RPC-only and participant-scoped', () => {
  assert.equal(existsSync(migrationPath), true);
  const sql = read(migrationPath);
  assert.match(sql, /create table public\.marketplace_chat_attachments/u);
  assert.match(sql, /alter table public\.marketplace_chat_attachments enable row level security/u);
  assert.match(sql, /revoke all on table public\.marketplace_chat_attachments from public, anon, authenticated/u);
  assert.match(sql, /create_my_marketplace_chat_attachment/u);
  assert.match(sql, /complete_my_marketplace_chat_attachment/u);
  assert.match(sql, /get_my_marketplace_chat_attachment/u);
  assert.match(sql, /discard_my_marketplace_chat_attachment/u);
  assert.match(sql, /can_send_marketplace_chat_thread\(p_thread_id\)/u);
  assert.match(sql, /can_access_marketplace_chat_thread\(v_attachment\.thread_id\)/u);
  assert.match(sql, /chat\//u);
});

test('composer offers explicit one-off location consent and image attachment affordances', () => {
  const composer = read(new URL('../../components/marketplace/chat/message-composer.tsx', import.meta.url));
  const card = read(new URL('../../components/marketplace/chat/message-card.tsx', import.meta.url));
  assert.match(composer, /type="file"/u);
  assert.match(composer, /accept="image\/jpeg,image\/png,image\/webp,image\/avif"/u);
  assert.match(composer, /مشاركة موقعي مرة واحدة/u);
  assert.match(composer, /navigator\.geolocation\.getCurrentPosition/u);
  assert.doesNotMatch(composer, /watchPosition/u);
  assert.match(card, /attachment\.url/u);
  assert.match(card, /loading="lazy"/u);
});
