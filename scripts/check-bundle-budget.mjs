import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const nextRoot = path.join(root, '.next');
const chunksRoot = path.join(nextRoot, 'static', 'chunks');

const budgets = {
  rootMainGzipBytes: 250 * 1024,
  largestRootChunkGzipBytes: 150 * 1024,
  allCssGzipBytes: 90 * 1024,
};

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function compressedBytes(relativePath) {
  const bytes = await readFile(path.join(nextRoot, relativePath));
  return gzipSync(bytes, { level: 9 }).byteLength;
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(nextRoot, 'build-manifest.json'), 'utf8'),
  );
  if (!Array.isArray(manifest.rootMainFiles) || manifest.rootMainFiles.length === 0) {
    throw new Error('Next.js build manifest has no rootMainFiles. Run npm run build first.');
  }

  const rootChunks = await Promise.all(
    manifest.rootMainFiles.map(async (file) => ({
      file,
      gzipBytes: await compressedBytes(file),
    })),
  );
  const rootMainGzipBytes = rootChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
  const largestRootChunk = rootChunks.reduce(
    (largest, chunk) => chunk.gzipBytes > largest.gzipBytes ? chunk : largest,
    rootChunks[0],
  );

  const cssFiles = (await readdir(chunksRoot)).filter((file) => file.endsWith('.css'));
  const cssSizes = await Promise.all(
    cssFiles.map((file) => compressedBytes(path.join('static', 'chunks', file))),
  );
  const allCssGzipBytes = cssSizes.reduce((total, bytes) => total + bytes, 0);

  const measurements = {
    rootMainGzipBytes,
    largestRootChunkGzipBytes: largestRootChunk.gzipBytes,
    allCssGzipBytes,
  };
  const failures = Object.entries(measurements)
    .filter(([name, value]) => value > budgets[name])
    .map(([name, value]) => `${name}: ${kibibytes(value)} > ${kibibytes(budgets[name])}`);

  console.log([
    `Root main JS (gzip): ${kibibytes(rootMainGzipBytes)} / ${kibibytes(budgets.rootMainGzipBytes)}`,
    `Largest root JS chunk (gzip): ${kibibytes(largestRootChunk.gzipBytes)} / ${kibibytes(budgets.largestRootChunkGzipBytes)} (${largestRootChunk.file})`,
    `All emitted CSS (gzip): ${kibibytes(allCssGzipBytes)} / ${kibibytes(budgets.allCssGzipBytes)}`,
  ].join('\n'));

  if (failures.length) {
    throw new Error(`Production bundle budget exceeded. ${failures.join(' | ')}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
