import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import ExcelJS from 'exceljs';
import {
  createCommissionStatementCsv,
  createCommissionStatementWorkbook,
} from '../../lib/commerce/excel/commission-statement-workbook.ts';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const statement = {
  id: '11111111-1111-4111-8111-111111111111',
  store_id: '22222222-2222-4222-8222-222222222222',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  status: 'issued',
  gross_piastres: '100000',
  commission_rate: '0.0700',
  commission_piastres: '7000',
  manual_adjustment_piastres: '-500',
  total_due_piastres: '6500',
  issued_at: '2026-08-01T10:00:00.000Z',
  paid_at: null,
  notes: '=HYPERLINK("https://attacker.invalid")',
  entries: [{
    id: '33333333-3333-4333-8333-333333333333',
    order_id: '44444444-4444-4444-8444-444444444444',
    entry_type: '+SUM(A1:A2)',
    gross_piastres: '100000',
    commission_piastres: '7000',
    recognized_at: '2026-07-15T12:00:00.000Z',
  }],
};

test('commission workbook roundtrips typed money, formulas and formula-safe text', async () => {
  const bytes = await createCommissionStatementWorkbook(statement);
  assert.ok(bytes.length > 1_000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const summary = workbook.getWorksheet('Statement');
  const entries = workbook.getWorksheet('Entries');
  assert.ok(summary);
  assert.ok(entries);
  assert.equal(summary.getCell('B6').value, 1000);
  assert.equal(summary.getCell('B10').value, 65);
  assert.equal(summary.getCell('B12').value, "'=HYPERLINK(\"https://attacker.invalid\")");
  assert.equal(entries.getCell('B2').value, "'+SUM(A1:A2)");
  assert.equal(entries.getCell('D2').value, 1000);
  assert.deepEqual(summary.getCell('B17').value, { formula: 'B6-B15' });
  assert.equal(entries.pageSetup.printTitlesRow, '1:1');
});

test('commission CSV fallback is UTF-8, typed and neutralizes formulas', () => {
  const csv = createCommissionStatementCsv(statement).toString('utf8');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"gross_egp","1000"/u);
  assert.match(csv, /"notes","'=HYPERLINK\(""https:\/\/attacker\.invalid""\)"/u);
  assert.match(csv, /"'\+SUM\(A1:A2\)"/u);
});

test('commission export route is role-scoped and never bypasses the authenticated DTO', () => {
  const route = read('app/api/marketplace/commissions/[id]/export/route.ts');
  const memberships = read('supabase/migrations/20260818180000_granular_admin_memberships.sql');
  assert.match(route, /getCurrentProfile/u);
  assert.match(route, /requireMarketplaceAdminRole\(\['finance'\]/u);
  assert.match(route, /getMyCommissionStatement\(id\)/u);
  assert.match(route, /profile\.role === 'admin'/u);
  assert.match(route, /\['merchant', 'admin'\]\.includes\(profile\.role\)/u);
  assert.doesNotMatch(route, /createAdminClient|service_role|\.from\(/u);
  assert.match(memberships, /array\['super_admin','finance'\]/u);
});

test('commission detail exposes XLSX, CSV and print-friendly statement views', () => {
  const detail = read('components/commerce-operations/finance-detail.tsx');
  const styles = read('components/commerce-operations/commerce-operations.module.css');
  assert.match(detail, /format=xlsx/u);
  assert.match(detail, /format=csv/u);
  assert.match(detail, /PrintStatementButton/u);
  assert.match(detail, /<table/u);
  assert.match(styles, /@media print/u);
  assert.match(styles, /table-header-group/u);
  assert.match(styles, /\.noPrint/u);
});
