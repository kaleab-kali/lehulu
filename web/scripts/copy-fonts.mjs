// Copies the Noto Sans Ethiopic web fonts (SIL OFL 1.1) from node_modules into public/fonts.
// They ship next to lehulu.js (not inside it, to keep the script small on 3G) and work offline.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../node_modules/@fontsource/noto-sans-ethiopic/files');
const to = resolve(here, '../public/fonts');
if (!existsSync(from)) {
  console.error('Fonts not found. Run `pnpm install` first.');
  process.exit(1);
}
mkdirSync(to, { recursive: true });
const wanted = /noto-sans-ethiopic-(ethiopic|latin)-(400|600)-normal\.woff2$/;
let n = 0;
for (const f of readdirSync(from)) {
  if (wanted.test(f)) {
    cpSync(resolve(from, f), resolve(to, f));
    n++;
  }
}
console.log(`Copied ${n} font files to public/fonts`);
