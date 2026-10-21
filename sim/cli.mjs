// `npm run sim`: loads sim/main.ts through Vite's module runner (TypeScript, no build step,
// no extra dependency), runs it, and writes the reports to sim/out/ (gitignored).
// Arguments pass through, e.g. `npm run sim -- --days 30 --seeds 5`. `--out <dir>` writes the
// reports there instead of sim/out (parallel runs don't collide).
import { runnerImport } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const { module } = await runnerImport(join(here, 'main.ts'), { configFile: false, logLevel: 'error' });
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const out = oi >= 0 && argv[oi + 1] ? resolve(process.cwd(), argv[oi + 1]) : join(here, 'out');
const { code, files } = await module.main(argv);
mkdirSync(out, { recursive: true });
for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
console.log(`Wrote ${Object.keys(files).map((f) => (r => (r.startsWith('..') ? join(out, f) : r))(relative(process.cwd(), join(out, f)))).join(', ')}`);
process.exit(code ?? 0);
