'use strict';
/* Menu, coupons, redemptions and custom rules: reading and writing SQLite.
 * Reads return the same JSON shape the browser used before the database
 * (js/menu.js DEFAULT_MENU), so js/logic.js and js/app.js work unchanged. */
const fs = require('node:fs');
const path = require('node:path');
const { tx, getMeta, setMeta } = require('./db.js');
const { validateMenu } = require('../js/menu.js');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CODE_RE = /^[A-Z0-9_-]{1,20}$/;
const IMG_RE = /^images\/[A-Za-z0-9_\-\/.]{1,150}$/;
const COUPON_TYPES = ['percent', 'amount', 'freeSide', 'freeDrink'];

function unavailable(row) { return row.available ? {} : { available: false }; }

// ---- Reading ---------------------------------------------------------------
function readMenu(db) {
  const rows = (sql, ...args) => db.prepare(sql).all(...args);
  const base = db.prepare("SELECT value FROM settings WHERE key = 'toppingBase'").get();
  return {
    sizes: rows('SELECT * FROM sizes ORDER BY sort').map((r) => Object.assign(
      { id: r.id, name: r.name, detail: r.detail, price: r.price_cents, toppingMult: r.topping_mult }, unavailable(r))),
    crusts: rows('SELECT * FROM crusts ORDER BY sort').map((r) => Object.assign(
      { id: r.id, name: r.name, price: r.price_cents }, unavailable(r))),
    toppingBase: base ? Number(base.value) : 0,
    toppings: rows('SELECT * FROM toppings ORDER BY sort').map((r) => Object.assign(
      { id: r.id, name: r.name, emoji: r.emoji }, unavailable(r))),
    sides: readExtras(db, 'side'),
    drinks: readExtras(db, 'drink')
  };
}

function readExtras(db, kind) {
  return db.prepare('SELECT * FROM extras WHERE kind = ? ORDER BY sort').all(kind).map((r) => Object.assign(
    { id: r.id, name: r.name, desc: r.description, price: r.price_cents, image: r.image }, unavailable(r)));
}

function readCoupons(db) {
  return db.prepare('SELECT * FROM coupons ORDER BY sort').all().map((r) => Object.assign(
    { id: r.id, name: r.name, code: r.code, type: r.type, value: r.value }, unavailable(r)));
}

function readFullMenu(db) {
  return Object.assign(readMenu(db), { coupons: readCoupons(db) });
}

// { couponId: { orderId, redeemedAt } }
function readRedemptions(db) {
  const out = {};
  db.prepare('SELECT coupon_id, order_id, redeemed_at FROM coupon_redemptions').all().forEach((r) => {
    out[r.coupon_id] = { orderId: r.order_id, redeemedAt: r.redeemed_at };
  });
  return out;
}

function usedCouponIds(db) {
  return db.prepare('SELECT coupon_id FROM coupon_redemptions').all().map((r) => r.coupon_id);
}

function findCouponByCode(db, code) {
  const r = db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(code).trim());
  return r ? Object.assign({ id: r.id, name: r.name, code: r.code, type: r.type, value: r.value }, unavailable(r)) : null;
}

// ---- Validation ------------------------------------------------------------
// Copies only the known fields, checks types and lengths, then runs the shared
// validateMenu(). Returns { menu, problems }; menu is only usable if problems is empty.
function sanitizeMenu(input) {
  const problems = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { menu: null, problems: ['The menu must be an object.'] };
  }
  const text = (v, max, label) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') { problems.push(label + ' must be text.'); return ''; }
    v = v.trim();
    if (v.length > max) { problems.push(label + ' is too long (max ' + max + ' characters).'); return v.slice(0, max); }
    return v;
  };
  const cents = (v, label) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1000000) {
      problems.push(label + ' must be a whole number of cents from 0 to 1,000,000.');
      return 0;
    }
    return v;
  };
  const mapList = (name, fn) => {
    const arr = input[name];
    if (!Array.isArray(arr)) { problems.push('Missing ' + name + ' list.'); return []; }
    if (arr.length > 200) { problems.push('Too many ' + name + ' (max 200).'); return []; }
    return arr.map((it, i) => {
      const label = name + ' item ' + (i + 1);
      if (!it || typeof it !== 'object') { problems.push(label + ' is not valid.'); return null; }
      if (typeof it.id !== 'string' || !ID_RE.test(it.id)) problems.push(label + ' has an invalid id.');
      const out = fn(it, label);
      out.id = String(it.id);
      out.name = text(it.name, 80, label + ' name');
      if (it.available === false) out.available = false;
      return out;
    }).filter(Boolean);
  };
  const image = (v, label) => {
    const s = text(v, 200, label);
    if (s && (!IMG_RE.test(s) || s.indexOf('..') > -1)) problems.push(label + ' must be a path like images/sides/name.svg.');
    return s;
  };

  const menu = {
    sizes: mapList('sizes', (it, l) => ({
      detail: text(it.detail, 20, l + ' detail'),
      price: cents(it.price, l + ' price'),
      toppingMult: (typeof it.toppingMult === 'number' && isFinite(it.toppingMult) && it.toppingMult >= 0 && it.toppingMult <= 10)
        ? it.toppingMult : (problems.push(l + ' topping multiplier must be between 0 and 10.'), 0)
    })),
    crusts: mapList('crusts', (it, l) => ({ price: cents(it.price, l + ' price') })),
    toppingBase: cents(input.toppingBase, 'Topping base price'),
    toppings: mapList('toppings', (it, l) => ({ emoji: text(it.emoji, 16, l + ' icon') })),
    sides: mapList('sides', (it, l) => ({
      desc: text(it.desc, 300, l + ' description'), price: cents(it.price, l + ' price'), image: image(it.image, l + ' image')
    })),
    drinks: mapList('drinks', (it, l) => ({
      desc: text(it.desc, 300, l + ' description'), price: cents(it.price, l + ' price'), image: image(it.image, l + ' image')
    })),
    coupons: mapList('coupons', (it, l) => {
      const code = text(it.code, 20, l + ' code').toUpperCase();
      if (code && !CODE_RE.test(code)) problems.push(l + ' code may only use letters, numbers, - and _.');
      const type = COUPON_TYPES.indexOf(it.type) > -1 ? it.type : (problems.push(l + ' needs a valid type.'), 'percent');
      let value = typeof it.value === 'number' && isFinite(it.value) ? it.value : (problems.push(l + ' needs a numeric value.'), 0);
      if (type === 'amount' && !Number.isInteger(value)) { problems.push(l + ' amount must be whole cents.'); value = 0; }
      if (type === 'freeSide' || type === 'freeDrink') value = 0;
      return { code, type, value };
    })
  };
  validateMenu(menu).forEach((p) => { if (problems.indexOf(p) < 0) problems.push(p); });
  return { menu, problems };
}

// ---- Writing ---------------------------------------------------------------
// Replaces the whole menu in one transaction. menu must come from sanitizeMenu().
// Coupons are upserted (not deleted and re-added) so redemptions and order
// history keep pointing at them.
function replaceMenu(db, menu) {
  tx(db, () => {
    ['sizes', 'crusts', 'toppings', 'extras'].forEach((t) => db.exec('DELETE FROM ' + t));
    const flag = (it) => (it.available === false ? 0 : 1);
    let ins = db.prepare('INSERT INTO sizes (id, name, detail, price_cents, topping_mult, available, sort) VALUES (?, ?, ?, ?, ?, ?, ?)');
    menu.sizes.forEach((it, i) => ins.run(it.id, it.name, it.detail || '', it.price, it.toppingMult, flag(it), i));
    ins = db.prepare('INSERT INTO crusts (id, name, price_cents, available, sort) VALUES (?, ?, ?, ?, ?)');
    menu.crusts.forEach((it, i) => ins.run(it.id, it.name, it.price, flag(it), i));
    ins = db.prepare('INSERT INTO toppings (id, name, emoji, available, sort) VALUES (?, ?, ?, ?, ?)');
    menu.toppings.forEach((it, i) => ins.run(it.id, it.name, it.emoji || '', flag(it), i));
    ins = db.prepare('INSERT INTO extras (kind, id, name, description, price_cents, image, available, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    menu.sides.forEach((it, i) => ins.run('side', it.id, it.name, it.desc || '', it.price, it.image || '', flag(it), i));
    menu.drinks.forEach((it, i) => ins.run('drink', it.id, it.name, it.desc || '', it.price, it.image || '', flag(it), i));
    db.prepare("INSERT INTO settings (key, value) VALUES ('toppingBase', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(String(menu.toppingBase));

    // Coupons: park every code first so two coupons can swap codes, then upsert.
    const keep = new Set(menu.coupons.map((c) => c.id));
    db.prepare('SELECT id FROM coupons').all().forEach((r) => {
      if (!keep.has(r.id)) db.prepare('DELETE FROM coupons WHERE id = ?').run(r.id);
    });
    db.exec("UPDATE coupons SET code = '~' || id");
    const up = db.prepare(`INSERT INTO coupons (id, name, code, type, value, available, sort) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, code = excluded.code, type = excluded.type,
        value = excluded.value, available = excluded.available, sort = excluded.sort`);
    menu.coupons.forEach((c, i) => up.run(c.id, c.name, c.code, c.type, c.value, flag(c), i));
  });
}

function unuseCoupon(db, couponId) {
  return db.prepare('DELETE FROM coupon_redemptions WHERE coupon_id = ?').run(couponId).changes;
}
function unuseAllCoupons(db) {
  return db.prepare('DELETE FROM coupon_redemptions').run().changes;
}

// ---- Custom rules (test.html) ----------------------------------------------
function readRules(db) {
  return db.prepare('SELECT * FROM custom_rules ORDER BY sort').all()
    .map((r) => ({ id: r.id, name: r.name, description: r.description, code: r.code }));
}

function sanitizeRules(input) {
  const problems = [];
  if (!Array.isArray(input)) return { rules: null, problems: ['rules must be a list.'] };
  if (input.length > 200) return { rules: null, problems: ['Too many rules (max 200).'] };
  const seen = new Set();
  const rules = input.map((r, i) => {
    const label = 'Rule ' + (i + 1);
    if (!r || typeof r !== 'object') { problems.push(label + ' is not valid.'); return null; }
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) problems.push(label + ' has an invalid id.');
    else if (seen.has(r.id)) problems.push(label + ' has a duplicate id.');
    else seen.add(r.id);
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name || name.length > 120) problems.push(label + ' needs a name (up to 120 characters).');
    const description = typeof r.description === 'string' ? r.description.trim() : '';
    if (description.length > 500) problems.push(label + ' description is too long (max 500).');
    const code = typeof r.code === 'string' ? r.code : '';
    if (code.length > 20000) problems.push(label + ' code is too long (max 20,000 characters).');
    return { id: String(r.id), name, description, code };
  }).filter(Boolean);
  return { rules, problems };
}

function replaceRules(db, rules) {
  tx(db, () => {
    db.exec('DELETE FROM custom_rules');
    const ins = db.prepare('INSERT INTO custom_rules (id, name, description, code, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    rules.forEach((r, i) => ins.run(r.id, r.name, r.description, r.code, i, now));
  });
}

// ---- Seeding ---------------------------------------------------------------
const SEED_DIR = path.join(__dirname, 'seed');
function readSeedMenu() { return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'default-menu.json'), 'utf8')); }
function readSeedRules() { return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'custom-rules.json'), 'utf8')); }

// First run only: load the default menu and rules. Never reseeds after that.
function seedIfNeeded(db) {
  if (getMeta(db, 'seeded') === '1') return false;
  const { menu, problems } = sanitizeMenu(readSeedMenu());
  if (problems.length) throw new Error('Seed menu is invalid: ' + problems.join('; '));
  replaceMenu(db, menu);
  const seeded = sanitizeRules(readSeedRules());
  if (seeded.problems.length) throw new Error('Seed rules are invalid: ' + seeded.problems.join('; '));
  replaceRules(db, seeded.rules);
  setMeta(db, 'seeded', '1');
  return true;
}

// Admin "Reset to default menu": restores the default menu (and coupons); orders and redemptions are kept.
function resetMenuToDefault(db) {
  const { menu, problems } = sanitizeMenu(readSeedMenu());
  if (problems.length) throw new Error('Seed menu is invalid: ' + problems.join('; '));
  replaceMenu(db, menu);
}

module.exports = {
  readMenu, readCoupons, readFullMenu, readRedemptions, usedCouponIds, findCouponByCode,
  sanitizeMenu, replaceMenu, unuseCoupon, unuseAllCoupons,
  readRules, sanitizeRules, replaceRules,
  seedIfNeeded, resetMenuToDefault, readSeedMenu
};
