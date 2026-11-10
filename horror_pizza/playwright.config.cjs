const { defineConfig } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

module.exports = defineConfig({
  testDir: 'tests',
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/markdown-reporter.cjs']],
  use: {
    baseURL: 'http://localhost:3199',
    channel: 'chrome',
    launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
  },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/index.js',
    url: 'http://localhost:3199/api/menu',
    env: { PORT: '3199', DB_PATH: path.join(os.tmpdir(), `slashers-test-${Date.now()}.db`) },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
