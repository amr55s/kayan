import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CATEGORY_ALGORITHM_VERSION,
  normalizeCategoryText,
  rankCategorySuggestions,
} from '../../lib/commerce/category-classification.ts';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260824104947_smart_category_classification.sql', import.meta.url),
  'utf8',
);
const editor = readFileSync(
  new URL('../../components/marketplace/merchant/product-editor.tsx', import.meta.url),
  'utf8',
);
const adminPage = readFileSync(
  new URL('../../app/admin/marketplace/orders/page.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../../lib/commerce/operations-actions.ts', import.meta.url),
  'utf8',
);

test('Arabic category normalization removes spelling variants and punctuation deterministically', () => {
  assert.equal(normalizeCategoryText('  أدواتُ منزليّة — جديدة  '), 'ادوات منزليه جديده');
  assert.equal(normalizeCategoryText('إكسسوارات المطبخ'), 'اكسسوارات المطبخ');
  assert.equal(CATEGORY_ALGORITHM_VERSION, 'category-v1');
});

test('category ranking favors product-name evidence and returns at most three explainable matches', () => {
  const result = rankCategorySuggestions({
    name: 'طقم أدوات مطبخ يدوي',
    brand: '',
    description: 'قطعة منزلية مصنوعة محليًا',
    categories: [
      { id: 'kitchen', name: 'أدوات المطبخ' },
      { id: 'home', name: 'المنزل' },
      { id: 'crafts', name: 'منتجات يدوية' },
      { id: 'other', name: 'أخرى' },
    ],
    aliases: [
      { categoryId: 'kitchen', phrase: 'أدوات مطبخ', normalizedPhrase: 'ادوات مطبخ', matchScope: 'name', weight: 100 },
      { categoryId: 'home', phrase: 'منزلية', normalizedPhrase: 'منزليه', matchScope: 'description', weight: 70 },
      { categoryId: 'crafts', phrase: 'يدوي', normalizedPhrase: 'يدوي', matchScope: 'any', weight: 55 },
      { categoryId: 'other', phrase: 'لا يطابق', normalizedPhrase: 'لا يطابق', matchScope: 'any', weight: 100 },
    ],
  });
  assert.equal(result[0]?.categoryId, 'kitchen');
  assert.equal(result[0]?.confidence, 1);
  assert.match(result[0]?.signals[0] ?? '', /^name:/u);
  assert.ok(result.length <= 3);
  assert.ok(result.every((item) => item.signals.length > 0));
});

test('classification persistence is private, auth-bound, rate-limited, and never auto-publishes proposals', () => {
  assert.match(migration, /alter table public\.product_category_proposals enable row level security/u);
  assert.match(migration, /revoke all on table public\.product_category_proposals from anon, authenticated/u);
  assert.match(migration, /not public\.can_catalog_store\(v_product\.store_id\)/u);
  assert.match(migration, /created_at >= now\(\) - interval '1 hour'/u);
  assert.match(migration, /status text not null default 'pending'/u);
  assert.doesNotMatch(migration, /insert into public\.product_categories[\s\S]*p_proposed_name/u);
  assert.match(migration, /set search_path = ''/u);
  assert.match(migration, /unique \(actor_id, idempotency_key\)/u);
  assert.match(migration, /on conflict \(actor_id, idempotency_key\) do nothing/u);
});

test('merchant suggestions remain editable and the admin has a role-scoped review path', () => {
  assert.match(editor, /rankCategorySuggestions/u);
  assert.match(editor, /topSuggestion\?\.confidence >= 0\.88/u);
  assert.match(editor, /aria-pressed=\{categoryId === suggestion\.categoryId\}/u);
  assert.match(editor, /يصل الاقتراح للمراجعة ولا يظهر كقسم عام قبل الاعتماد/u);
  assert.match(migration, /activate_marketplace_admin_capability\([\s\S]*?'catalog_reviewer'/u);
  assert.match(migration, /p_decision not in \('approve_new', 'merge', 'reject'\)/u);
  assert.match(migration, /insert into public\.product_category_aliases/u);
  assert.match(adminPage, /CategoryProposalQueue/u);
  assert.match(actions, /requireMarketplaceAdminRole\(\['catalog_reviewer'\]/u);
});
