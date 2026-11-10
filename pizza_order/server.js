'use strict';
/* Dragon's Crunchy Knights Pizza - local server.
 *
 *   node server.js
 *
 * Then open http://localhost:3000. Owns the SQLite database (data/pizza.db),
 * serves the pages in this folder, and enforces the order rules.
 * Needs Node 22.13 or later (built-in SQLite). No npm packages.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { open } = require('./server/db.js');
const { seedIfNeeded } = require('./server/menu.js');
const { createServer } = require('./server/app.js');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.json');

// config.json is created on first run with a random admin PIN. It is gitignored.
function loadConfig() {
  const defaults = { port: 3000, host: '127.0.0.1', dbPath: 'data/pizza.db' };
  let created = false;
  let config;
  if (fs.existsSync(CONFIG_FILE)) {
    config = Object.assign({}, defaults, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } else {
    config = Object.assign({}, defaults, { adminPin: String(crypto.randomInt(100000, 1000000)) });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
    created = true;
  }
  if (typeof config.adminPin !== 'string' || config.adminPin.length < 4) {
    throw new Error('config.json needs an "adminPin" of at least 4 characters (as text).');
  }
  if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
    console.warn('WARNING: host is "' + config.host + '". This app is meant to listen on this computer only (127.0.0.1).');
  }
  return { config, created };
}

function main() {
  const { config, created } = loadConfig();
  const db = open(path.resolve(ROOT, config.dbPath));
  if (seedIfNeeded(db)) console.log('New database created and loaded with the default menu and coupons.');

  const server = createServer({ db, getPin: () => config.adminPin, rootDir: ROOT });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Port ' + config.port + ' is already in use. The pizza server may already be running: open http://localhost:' + config.port);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    console.log('Dragon\'s Crunchy Knights Pizza is running.');
    console.log('  Order page: http://localhost:' + config.port + '/');
    console.log('  Admin page: http://localhost:' + config.port + '/admin.html');
    console.log('  Rule tests: http://localhost:' + config.port + '/test.html');
    if (created) console.log('  Admin PIN (first run, also saved in config.json): ' + config.adminPin);
    else console.log('  Admin PIN: see config.json');
    console.log('Press Ctrl+C to stop.');
  });
  const stop = () => { server.close(); db.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
