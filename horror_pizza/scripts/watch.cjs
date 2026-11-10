// Usage: npm run test:watch -- [slowMoMilliseconds]   (default 700)
const { spawnSync } = require('node:child_process');
const slow = process.argv[2] || '700';
const r = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--headed', '--timeout=0'],
  { stdio: 'inherit', env: { ...process.env, SLOWMO: slow } }
);
process.exit(r.status ?? 1);
