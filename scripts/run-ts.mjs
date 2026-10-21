import { runnerImport } from 'vite';
const [file, ...rest] = process.argv.slice(2);
process.argv = [process.argv[0], file, ...rest];
await runnerImport(file, { configFile: false, logLevel: 'error' });
