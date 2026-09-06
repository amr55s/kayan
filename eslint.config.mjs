import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // Local documentation caches, duplicated assistant skills, and secondary checkouts are not this application's source.
  globalIgnores([
    '**/.next/**',
    '**/node_modules/**',
    '.heroui-docs/**',
    '.worktrees/**',
    'skills/**',
    'agent/**',
    'data/skills/**',
    '.*/skills/**',
    '**/skills/**',
  ]),
]);
