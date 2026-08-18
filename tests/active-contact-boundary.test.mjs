import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const externalContactPattern = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)|href=\{?[`'"]tel:/i;

test('active routes expose no external messaging or click-to-call shortcuts', () => {
  const activeRouteSurfaces = [
    'app/layout.tsx',
    'app/page.tsx',
    'app/services/page.tsx',
    'app/guide/page.tsx',
    'app/share/page.tsx',
    'app/admin/page.tsx',
    'app/merchant/page.tsx',
    'app/driver/page.tsx',
    'components/marketing/PublicShareHub.tsx',
    'components/admin/MarketingCenter.tsx',
    'components/operations/AdminWorkspace.tsx',
    'components/operations/MerchantOrderWorkspace.tsx',
    'components/operations/DriverWorkspace.tsx',
  ];

  for (const file of activeRouteSurfaces) {
    assert.doesNotMatch(
      read(file),
      externalContactPattern,
      `${file} must keep communication inside the application`,
    );
  }
});

test('active editors retain legacy data without collecting or publishing it', () => {
  const editors = [
    'components/admin/EditPlaceModal.tsx',
    'components/admin/EditRequestModal.tsx',
    'components/admin/DriverManager.tsx',
    'components/operations/MerchantOrderWorkspace.tsx',
  ];

  for (const file of editors) {
    const source = read(file);
    assert.doesNotMatch(source, externalContactPattern);
    assert.doesNotMatch(source, /<Input[\s\S]{0,300}(?:name|label)=["'][^"']*(?:whatsapp|واتس)/i);
  }

  const driverWorkspace = read('components/operations/DriverWorkspace.tsx');
  const services = read('app/services/page.tsx');
  assert.doesNotMatch(driverWorkspace, /\{order\.recipient_phone\}/);
  assert.doesNotMatch(services, /item\.(?:phone|whatsapp)/i);
  assert.match(driverWorkspace, /لا يظهر في دليل الكباتن العام/);
});

test('native sharing degrades to an in-site copy surface', () => {
  const hub = read('components/marketing/PublicShareHub.tsx');
  assert.match(hub, /navigator\.share/);
  assert.match(hub, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(hub, /<textarea[\s\S]{0,160}readOnly[\s\S]{0,160}value=\{text\}/);
  assert.match(hub, /حدّد النص التالي وانسخه من داخل الموقع/);
  assert.doesNotMatch(hub, externalContactPattern);
});
