// Usage: npm run test:watch -- [slowMoMilliseconds] [test file or name filters...]
//   npm run test:watch -- 700                  all tests, 700 ms between actions
//   npm run test:watch -- 1000 kitchen         only kitchen.spec.cjs
//   npm run test:watch -- 500 ordering -g "quantity"   ordering tests whose name contains "quantity"
const { spawnSync } = require('node:child_process');
const [first, ...rest] = process.argv.slice(2);
const slowGiven = first !== undefined && /^\d+$/.test(first);
const slow = slowGiven ? first : '700';
const filters = slowGiven ? rest : first === undefined ? [] : [first, ...rest];
const r = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--headed', '--timeout=0', ...filters],
  { stdio: 'inherit', env: { ...process.env, SLOWMO: slow } }
);
process.exit(r.status ?? 1);
