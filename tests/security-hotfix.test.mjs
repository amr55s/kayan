import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260810060942_security_hotfix_marketplace.sql',
    import.meta.url,
  ),
  'utf8',
);

function definition(name, nextName) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = nextName
    ? migration.indexOf(`create or replace function public.${nextName}`, start + 1)
    : migration.indexOf('\n-- ', start + 1);
  return migration.slice(start, end === -1 ? migration.length : end);
}

test('merchant branch ownership fields cannot be reassigned by a merchant', () => {
  assert.match(migration, /drop policy if exists "merchants manage own branches"/);
  assert.match(
    migration,
    /create policy "merchants update own branch details"[\s\S]*using \(public\.is_current_merchant_for\(merchant_id\)\)[\s\S]*with check \(public\.is_current_merchant_for\(merchant_id\)\)/,
  );
  const guard = definition('protect_merchant_branch_ownership', 'current_profile');
  assert.match(guard, /new\.merchant_id is distinct from old\.merchant_id/);
  assert.match(guard, /new\.place_id is distinct from old\.place_id/);
  assert.match(guard, /branch_ownership_fields_are_immutable/);
  assert.match(migration, /before insert or update on public\.merchant_branches/);
  assert.doesNotMatch(
    migration,
    /create policy "merchants[^\n]*branches"[\s\S]{0,120}for insert/,
  );
});

test('delivery orders and sensitive driver profile fields are not directly writable', () => {
  assert.match(
    migration,
    /revoke all on table public\.delivery_orders from anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select \([\s\S]*?\) on public\.delivery_orders to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete)[^;]*public\.delivery_orders to authenticated/,
  );
  assert.match(
    migration,
    /revoke all on table public\.driver_profiles from anon, authenticated/,
  );
  const driverAccessStart = migration.indexOf(
    'revoke all on table public.driver_profiles from anon, authenticated',
  );
  const driverAccessEnd = migration.indexOf(
    'revoke all on table public.drivers from anon, authenticated',
    driverAccessStart,
  );
  const driverAccess = migration.slice(driverAccessStart, driverAccessEnd);
  const safeGrant = driverAccess.match(
    /grant select \(([\s\S]*?)\) on public\.driver_profiles to authenticated/,
  );
  assert.ok(safeGrant, 'missing safe driver_profiles select grant');
  assert.match(
    safeGrant[1],
    /avatar_url/,
  );
  assert.doesNotMatch(
    safeGrant[1],
    /contact_phone|whatsapp|avatar_path|legacy_driver_id/,
  );
});

test('legacy place rows expose no contact or payment columns to browser roles', () => {
  assert.match(
    migration,
    /revoke all on table public\.places from anon, authenticated/,
  );
  const grant = migration.match(
    /grant select \(([\s\S]*?)\) on public\.places to anon, authenticated/,
  );
  assert.ok(grant, 'missing explicit safe places column grant');
  assert.match(grant[1], /title/);
  assert.match(grant[1], /recommend_count/);
  assert.doesNotMatch(
    grant[1],
    /phone|whatsapp|instapay_vfcash|telegram_url/,
  );
});

test('public and merchant driver directories contain no contact identifiers', () => {
  const legacy = definition(
    'list_public_legacy_drivers',
    'list_public_registered_drivers',
  );
  const registered = definition(
    'list_public_registered_drivers',
    'list_available_delivery_drivers',
  );
  const merchant = definition(
    'list_available_delivery_drivers',
    'list_driver_delivery_offers',
  );

  assert.match(legacy, /''::text as phone/);
  assert.match(legacy, /null::text as whatsapp/);
  assert.doesNotMatch(legacy, /legacy\.(?:phone|whatsapp)/);
  assert.match(registered, /''::text as phone/);
  assert.match(registered, /null::text as whatsapp/);
  assert.doesNotMatch(
    registered,
    /(?:profile\.phone|driver\.(?:contact_phone|whatsapp)|legacy\.(?:phone|whatsapp))/,
  );
  assert.doesNotMatch(
    merchant,
    /(?:driver|profile|legacy)\.(?:phone|contact_phone|whatsapp)/,
  );
});

test('driver offer RPC masks recipient PII until the order is assigned', () => {
  const offers = definition(
    'list_driver_delivery_offers',
    'list_merchant_delivery_orders',
  );
  for (const field of [
    'recipient_name',
    'recipient_phone',
    'delivery_address',
    'notes',
  ]) {
    assert.match(
      offers,
      new RegExp(
        `when delivery\\.assigned_driver_id = v_driver_id[\\s\\S]*?delivery\\.status in \\('assigned', 'picked_up', 'issue'\\)[\\s\\S]*?then delivery\\.${field}[\\s\\S]*?else null`,
      ),
    );
  }
  assert.match(offers, /delivery\.status = 'open'/);
  assert.match(offers, /delivery\.expires_at > now\(\)/);
});

test('expired offers become rebroadcastable instead of remaining stuck', () => {
  const rebroadcast = definition(
    'rebroadcast_delivery_order',
    'renew_driver_availability',
  );
  const expiry = definition('expire_delivery_offers');

  assert.match(rebroadcast, /v_order\.status not in \('open', 'unassigned'\)/);
  assert.match(rebroadcast, /set status = 'open'/);
  assert.match(rebroadcast, /expires_at = now\(\) \+ interval '10 minutes'/);
  assert.match(expiry, /set status = 'unassigned'/);
  assert.match(expiry, /assigned_driver_id = null/);
  assert.match(expiry, /assigned_at = null/);
});

test('recommendation drift and SECURITY DEFINER defaults are repaired', () => {
  assert.match(
    migration,
    /add column if not exists recommend_count integer not null default 0/,
  );
  assert.match(migration, /places_recommend_count_nonnegative/);
  assert.match(migration, /where namespace\.nspname = 'public'[\s\S]*proc\.prosecdef/);
  assert.match(
    migration,
    /revoke create on schema public from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /alter function %s set search_path = pg_catalog, public[\s\S]*revoke execute on function %s from public, anon/,
  );
  assert.match(
    migration,
    /revoke all on function public\.expire_delivery_offers\(\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.expire_delivery_offers\(\)[\s\S]*to service_role/,
  );
});
