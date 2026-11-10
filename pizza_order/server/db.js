'use strict';
/* SQLite access for the pizza app (Node's built-in node:sqlite, no npm packages).
 * Opening, migrations and transactions live here. */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// MIGRATIONS[i] upgrades the database from version i + 1 to version i + 2.
// Add a function here for every schema change after version 1.
const MIGRATIONS = [];
const SCHEMA_VERSION = 1 + MIGRATIONS.length;

// Run fn inside one transaction; any error rolls everything back.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) { /* already rolled back */ }
    throw err;
  }
}

function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function migrate(db) {
  const hasMeta = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  if (!hasMeta) {
    tx(db, () => { db.exec(SCHEMA); setMeta(db, 'schema_version', 1); });
  }
  let version = Number(getMeta(db, 'schema_version'));
  if (version > SCHEMA_VERSION) {
    throw new Error('This database is from a newer version of the app (schema ' + version + ').');
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version - 1];
    tx(db, () => { step(db); setMeta(db, 'schema_version', version + 1); });
    version++;
  }
}

// file may be ':memory:' (used by the self-tests).
function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

module.exports = { open, tx, getMeta, setMeta, SCHEMA_VERSION };
