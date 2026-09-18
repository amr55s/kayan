import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('marketplace reuses the real main header and keeps its content server-rendered', () => {
  const shell = read('components/marketplace/marketplace-shell.tsx');
  assert.match(shell, /import \{ Header \} from '@\/components\/layout\/Header'/);
  assert.match(shell, /<Header \/>/);
  assert.match(shell, /id="main-content"/);
  assert.doesNotMatch(shell, /['"]use client['"]/);
});

test('shared theme preserves main identity and explicitly discovers route/component classes', () => {
  const css = read('app/globals.css');
  for (const contract of [
    '--dairtak-orange: #ff7a1a', '--dairtak-navy: #09090b', '--dairtak-bg: #fafafa',
    '--dairtak-card-radius: 1.5rem',
    '--dairtak-content-width: 90rem', '--accent: var(--dairtak-orange-deep)',
    '--field-radius: var(--dairtak-control-radius)',
    '@source "../components/marketplace"', '@source "./onboarding"',
  ]) assert.ok(css.includes(contract), contract);
  const marketplaceCss = read('components/marketplace/marketplace.module.css');
  assert.doesNotMatch(marketplaceCss, /#f97316|--heroui-primary/);
  assert.match(marketplaceCss, /prefers-reduced-motion: reduce/);
  assert.match(marketplaceCss, /border-radius: var\(--dairtak-card-radius\)/);
});

function marketplaceFiles(directory = 'components/marketplace') {
  return readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? entry.name === 'chat' ? [] : marketplaceFiles(`${directory}/${entry.name}`)
      : entry.name.endsWith('.tsx') ? [`${directory}/${entry.name}`] : []);
}

test('marketplace navigation never nests a button inside a link', () => {
  for (const file of marketplaceFiles()) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(node, insideLink = false) {
      if (ts.isJsxElement(node)) {
        const name = node.openingElement.tagName.getText(source);
        assert.ok(!(insideLink && /^(Button(\.Root)?|button)$/.test(name)), `${file}: nested ${name}`);
        insideLink ||= /^(Link|DairtakLink|a)$/.test(name);
      }
      ts.forEachChild(node, (child) => walk(child, insideLink));
    }
    walk(source);
  }
});

test('catalog filters use HeroUI, remain sidebar/drawer based and restore values from the URL', () => {
  const filters = read('components/marketplace/catalog-filters.tsx');
  const catalog = read('components/marketplace/catalog-view.tsx');
  const select = read('components/ui/dairtak-select.tsx');
  assert.match(filters, /method="get"/);
  assert.match(filters, /key=\{JSON\.stringify/);
  for (const name of ['category', 'store', 'rating', 'sort']) assert.match(filters, new RegExp(`name="${name}"`));
  assert.doesNotMatch(filters, /<select\b/);
  assert.match(select, /@heroui\/react\/select/);
  assert.match(select, /type="hidden" name=\{name\} value=\{value\}/);
  assert.match(catalog, /<aside className=\{styles\.catalogSidebar\}/);
  assert.match(catalog, /<Drawer state=/);
  assert.match(catalog, /Drawer.Backdrop[^>]*dairtak-theme/);
  assert.match(catalog, /headingLevel=\{2\}/);
  // Closing the portal synchronously detaches the native GET form before submit.
  assert.doesNotMatch(catalog, /onApply=\{\(\) => mobileDrawerState\.close\(\)\}/);
  // A positioned document body offsets HeroUI's flipped (bottom-anchored) portal
  // by the document height, potentially selecting the item under the trigger.
  assert.doesNotMatch(read('app/globals.css'), /html,\s*body\s*\{[^}]*position:\s*relative/s);
});

test('signed-in public header opens workspaces, not a second skip target or onboarding dump', () => {
  const header = read('components/layout/Header.tsx');
  const directory = read('components/directory/DirectoryView.tsx');
  assert.match(header, /setDashboardPath\(userData\.user \? '\/workspaces' : null\)/);
  assert.match(header, /dashboardPath \?\? '\/signin'/);
  assert.match(directory, /className="dairtak-theme /);
  assert.doesNotMatch(read('components/marketplace/marketplace.module.css'), /\.skipLink\b/);
});

test('loading skeletons never claim the unique main landmark', () => {
  const home = read('app/loading.tsx');
  const services = read('app/services/loading.tsx');
  const page = read('app/page.tsx');
  assert.doesNotMatch(home, /id=["']main-content["']/);
  assert.doesNotMatch(services, /id=["']main-content["']/);
  assert.match(home, /aria-busy="true"/);
  assert.match(page, /<Suspense fallback=\{<Loading \/>\}>/);
  assert.match(page, /<DirectoryView/);
});

test('filled orange chrome uses white foreground, while white inputs keep dark text', () => {
  const css = read('app/globals.css');
  assert.match(css, /--accent-foreground:\s*var\(--kayan-white\)/);
  assert.match(css, /\.dairtak-button \{ background: var\(--dairtak-orange-deep\); color: #fff; \}/);
  assert.match(css, /::selection \{\s*background: var\(--dairtak-orange-deep\);\s*color: #fff;/);
  assert.match(css, /caret-color: var\(--kayan-black\)/);
  assert.match(css, /caret-color: var\(--field-foreground\)/);
  const onboarding = read('components/onboarding/onboarding.module.css');
  assert.match(onboarding, /aria-current='step'\] \.stepNumber \{ background: var\(--dairtak-orange-deep\); color: #fff; \}/);
});

test('onboarding draft recovery survives reload and re-auth without dropping local fields', () => {
  const wizard = read('components/onboarding/onboarding-wizard.tsx');
  const actions = read('lib/onboarding/actions.ts');
  assert.match(wizard, /window\.sessionStorage/);
  assert.match(wizard, /window\.localStorage/);
  assert.match(wizard, /!initialDraft && candidate && canRestoreDraftRecovery/);
  assert.match(wizard, /target="_blank"/);
  assert.match(wizard, /إعادة الحفظ/);
  assert.match(actions, /code: 'schema'/);
  assert.match(actions, /تعديلاتك ما زالت في هذه الصفحة/);
});
