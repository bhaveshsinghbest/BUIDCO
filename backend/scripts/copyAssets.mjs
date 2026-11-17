/**
 * Copy non-TypeScript assets from src/ into dist/ after a build.
 *
 * `tsc` only emits .ts, so data files that live beside a module — currently
 * src/lib/hindiSearch/searchSynonyms.json — are absent from dist/ and the
 * compiled module throws on startup. Keeping the dictionary as real JSON is
 * deliberate (a non-developer can edit it), so the build copies it instead.
 *
 * Fails loudly: a silent miss here would ship a server whose search has
 * quietly lost Hindi support.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Paths are relative to src/ and keep their layout under dist/. */
const ASSETS = ['lib/hindiSearch/searchSynonyms.json'];

let copied = 0;
for (const rel of ASSETS) {
  const from = join(root, 'src', rel);
  const to = join(root, 'dist', rel);
  if (!existsSync(from)) {
    console.error(`copyAssets: missing source asset ${rel}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  copied += 1;
  console.log(`copyAssets: ${rel}`);
}
console.log(`copyAssets: ${copied} asset(s) copied into dist/`);
