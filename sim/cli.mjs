// `npm run sim`: loads sim/main.ts through Vite's module runner (TypeScript, no build step,
// no extra dependency), runs it, and writes the reports to sim/out/ (gitignored).
// Arguments pass through, e.g. `npm run sim -- --days 30 --seeds 5`.
import { runnerImport } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const { module } = await runnerImport(join(here, 'main.ts'), { configFile: false, logLevel: 'error' });
const { code, files } = await module.main(process.argv.slice(2));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
console.log(`Wrote ${Object.keys(files).map((f) => join('sim/out', f)).join(', ')}`);
process.exit(code ?? 0);
