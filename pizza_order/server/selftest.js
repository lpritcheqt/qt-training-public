'use strict';
/* Server-side rule tests. Every test starts its own throwaway in-memory database
 * behind the real HTTP server and talks to it over HTTP, so these check what the
 * page can NOT be trusted to enforce (limits, coupons, prices, login).
 *
 *   node server/selftest.js         run from the command line
 *   GET /api/selftest               used by test.html
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('./db.js');
const M = require('./menu.js');
const L = require('../js/logic.js');
const { createServer } = require('./app.js');

const ROOT = path.resolve(__dirname, '..');

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'Values differ') + ' (expected ' + expected + ', got ' + actual + ')');
}

// A fresh app: in-memory database seeded with the default menu, served on a free port.
async function startFresh() {
  const pin = '246810';
  const db = open(':memory:');
  M.seedIfNeeded(db);
  const server = createServer({ db, getPin: () => pin, rootDir: ROOT });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  const app = {
    db, base, pin,
    async call(method, url, body, headers) {
      const h = Object.assign({}, body !== undefined ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}, headers || {});
      const res = await fetch(base + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }
      return { status: res.status, data, headers: res.headers };
    },
    async login(withPin) {
      const r = await app.call('POST', '/api/admin/login', { pin: withPin === undefined ? pin : withPin });
      const sc = r.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return r;
    },
    // Edit the menu through the admin API: mutate(menu) then PUT.
    async editMenu(mutate) {
      await app.login();
      const g = await app.call('GET', '/api/admin/menu');
      const menu = g.data.menu;
      mutate(menu);
      return app.call('PUT', '/api/admin/menu', { menu });
    },
    count(table) { return db.prepare('SELECT COUNT(*) AS c FROM ' + table).get().c; },
    raw(p, headers) {
      return new Promise((resolve, reject) => {
        const u = new URL(base);
        const req = http.request({ host: u.hostname, port: u.port, path: p, method: 'GET', headers: Object.assign({ Host: u.host }, headers || {}) },
          (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject);
        req.end();
      });
    },
    async close() {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
  return app;
}

const pizza = (toppings, qty, size, crust) => ({ kind: 'pizza', size: size || 'M', crust: crust || 'hand', toppings: toppings || [], qty: qty || 1 });
const side = (itemId, qty) => ({ kind: 'side', itemId: itemId || 'bones', qty: qty || 1 });
const drink = (itemId, qty) => ({ kind: 'drink', itemId: itemId || 'cola', qty: qty || 1 });
const order = (t, cart, couponCode, extra) => t.call('POST', '/api/orders', Object.assign({ cart, couponCode }, extra || {}));
const FIVE = ['pepperoni', 'sausage', 'ham', 'mushroom', 'onion'];

function buildRules(opts) {
  const rules = [
    {
      id: 'Server 1', name: 'Each coupon can only be used once (enforced by the database)',
      description: 'A redeemed coupon is refused on every later order, in any case, even for orders submitted at the same moment.',
      tests: [
        { name: 'The second order with the same coupon is refused (409) and only one redemption is stored', run: async (t) => {
          const a = await order(t, [side('bones', 2)], 'KNIGHT10');
          eq(a.status, 201, 'first order'); eq(a.data.total, 898, 'first order total');
          const b = await order(t, [side('bones', 2)], 'KNIGHT10');
          eq(b.status, 409); eq(b.data.error.code, 'coupon_used');
          eq(t.count('coupon_redemptions'), 1, 'redemptions'); eq(t.count('orders'), 1, 'orders saved');
        } },
        { name: 'Coupon codes are not case sensitive', run: async (t) => {
          eq((await order(t, [side('bones', 2)], 'KNIGHT10')).status, 201);
          eq((await order(t, [side('bones', 2)], 'knight10')).status, 409);
        } },
        { name: 'Two orders sent at the same moment: exactly one wins', run: async (t) => {
          const [a, b] = await Promise.all([order(t, [side('bones', 2)], 'HOARD20'), order(t, [side('bones', 2)], 'HOARD20')]);
          eq([a.status, b.status].sort().join(','), '201,409', 'statuses');
          eq(t.count('coupon_redemptions'), 1); eq(t.count('orders'), 1);
        } },
        { name: 'The coupon lookup hides a used coupon', run: async (t) => {
          eq((await t.call('POST', '/api/coupons/lookup', { code: 'SLAYER3' })).status, 200, 'before use');
          await order(t, [side('bones', 2)], 'SLAYER3');
          const r = await t.call('POST', '/api/coupons/lookup', { code: 'SLAYER3' });
          eq(r.status, 409); eq(r.data.error.code, 'coupon_used');
        } },
        { name: 'An admin can mark a coupon unused so it works again', run: async (t) => {
          await order(t, [side('bones', 2)], 'KNIGHT10');
          eq((await order(t, [side('bones', 2)], 'KNIGHT10')).status, 409);
          await t.login();
          eq((await t.call('POST', '/api/admin/coupons/c-knight10/unuse', {})).status, 200);
          eq((await order(t, [side('bones', 2)], 'KNIGHT10')).status, 201, 'works again');
        } }
      ]
    },
    {
      id: 'Server 2', name: 'Only one coupon can be used per order (enforced by the server)',
      description: 'An order that tries to carry more than one coupon is refused and nothing is saved.',
      tests: [
        { name: 'A list of coupons is refused', run: async (t) => {
          const r = await order(t, [side('bones', 2)], undefined, { coupons: ['KNIGHT10', 'HOARD20'] });
          eq(r.status, 400); eq(r.data.error.code, 'coupon_limit');
          eq(t.count('orders'), 0); eq(t.count('coupon_redemptions'), 0);
        } },
        { name: 'A couponCode that is not a single text value is refused', run: async (t) => {
          const r = await order(t, [side('bones', 2)], ['KNIGHT10', 'HOARD20']);
          eq(r.status, 400); eq(t.count('orders'), 0);
        } }
      ]
    },
    {
      id: 'Server 3', name: 'Order limits are enforced even if the page is bypassed',
      description: 'No more than 20 items in any combination and no more than 5 toppings per pizza, checked again on the server.',
      tests: [
        { name: '21 items in one line is refused', run: async (t) => {
          const r = await order(t, [side('bones', 21)]);
          eq(r.status, 400); eq(r.data.error.code, 'limit'); eq(t.count('orders'), 0);
        } },
        { name: '21 items spread over several lines is refused', run: async (t) => {
          const r = await order(t, [pizza([], 8), side('bones', 7), drink('cola', 6)]);
          eq(r.status, 400); eq(r.data.error.code, 'limit'); eq(t.count('orders'), 0);
        } },
        { name: 'Exactly 20 items (8 pizzas + 6 sides + 6 drinks) is accepted', run: async (t) => {
          const r = await order(t, [pizza([], 8), side('bones', 6), drink('cola', 6)]);
          eq(r.status, 201, JSON.stringify(r.data)); eq(t.count('orders'), 1);
        } },
        { name: 'A pizza with 6 toppings is refused', run: async (t) => {
          const r = await order(t, [pizza(FIVE.concat(['olive']))]);
          eq(r.status, 400); eq(r.data.error.code, 'limit'); eq(t.count('orders'), 0);
        } },
        { name: 'A pizza with exactly 5 toppings is accepted', run: async (t) => {
          eq((await order(t, [pizza(FIVE)])).status, 201);
        } },
        { name: 'The same topping twice is refused', run: async (t) => {
          eq((await order(t, [pizza(['pepperoni', 'pepperoni'])])).status, 400);
        } }
      ]
    },
    {
      id: 'Server 4', name: 'The customer never owes a negative amount and the server sets every price',
      description: 'Prices and totals sent by the browser are ignored. A coupon can never make the total negative.',
      tests: [
        { name: 'Prices and totals sent by the client are ignored', run: async (t) => {
          const r = await t.call('POST', '/api/orders', {
            cart: [{ kind: 'side', itemId: 'bones', qty: 2, unitPrice: 1, price: 1, total: 0 }], total: 0, subtotal: 0
          });
          eq(r.status, 201); eq(r.data.total, 998, 'server price');
          eq(t.db.prepare('SELECT total_cents FROM orders').get().total_cents, 998, 'stored total');
        } },
        { name: 'A $100 coupon on a $6.98 order leaves $0.00, not a negative balance', run: async (t) => {
          const e = await t.editMenu((m) => m.coupons.push({ id: 'big', name: 'Big', code: 'BIG100', type: 'amount', value: 10000 }));
          eq(e.status, 200, JSON.stringify(e.data));
          const r = await order(t, [side('bones', 1), drink('water', 1)], 'BIG100');
          eq(r.status, 201); eq(r.data.discount, 698, 'discount capped at subtotal'); eq(r.data.total, 0, 'total');
        } },
        { name: '100% off leaves $0.00', run: async (t) => {
          await t.editMenu((m) => m.coupons.push({ id: 'all', name: 'All', code: 'ALL100', type: 'percent', value: 100 }));
          const r = await order(t, [side('bones', 2)], 'ALL100');
          eq(r.status, 201); eq(r.data.total, 0);
        } },
        { name: 'A $5 coupon on a $4.99 item is refused and nothing is owed or saved', run: async (t) => {
          await t.editMenu((m) => m.coupons.push({ id: 'five', name: 'Five', code: 'FIVE', type: 'amount', value: 500 }));
          const r = await order(t, [side('bones', 1)], 'FIVE');
          eq(r.status, 400); eq(r.data.error.code, 'coupon_invalid');
          eq(t.count('orders'), 0); eq(t.count('coupon_redemptions'), 0);
        } },
        { name: 'A free-side coupon needs a side in the order', run: async (t) => {
          const r = await order(t, [drink('cola', 3)], 'FREESIDE');
          eq(r.status, 400); assert(/side/.test(r.data.error.message), r.data.error.message);
        } },
        { name: 'The database itself rejects a negative total', run: async (t) => {
          let threw = false;
          try { t.db.prepare("INSERT INTO orders (created_at, subtotal_cents, discount_cents, total_cents) VALUES ('x', 0, 0, -1)").run(); }
          catch (e) { threw = /CHECK/.test(e.message); }
          assert(threw, 'negative total should violate a CHECK constraint');
        } }
      ]
    },
    {
      id: 'Server 5', name: 'Every coupon needs a purchase of at least $5.00 (server)',
      description: 'A coupon on an order under $5.00 is refused.',
      tests: [
        { name: 'A $1.99 order with a coupon is refused; a $6.98 order is accepted', run: async (t) => {
          eq((await order(t, [drink('water', 1)], 'KNIGHT10')).status, 400, 'under $5');
          eq((await order(t, [side('bones', 1), drink('water', 1)], 'KNIGHT10')).status, 201, 'over $5');
        } }
      ]
    },
    {
      id: 'Server 6', name: 'Sold-out items and inactive coupons cannot be ordered (server)',
      description: 'Unavailable items and inactive coupons are refused, with a clear reason.',
      tests: [
        { name: 'A sold-out topping (Bacon) is refused', run: async (t) => {
          const r = await order(t, [pizza(['bacon'])]);
          eq(r.status, 400); eq(r.data.error.code, 'sold_out');
        } },
        { name: 'A side an admin marks sold out is refused', run: async (t) => {
          eq((await t.editMenu((m) => { m.sides[0].available = false; })).status, 200);
          const r = await order(t, [side('bones')]);
          eq(r.status, 400); eq(r.data.error.code, 'sold_out');
          eq((await t.call('GET', '/api/menu')).data.sides[0].available, false, 'public menu shows it sold out');
        } },
        { name: 'An inactive coupon is refused by lookup and by the order', run: async (t) => {
          await t.editMenu((m) => { m.coupons[1].available = false; });
          const look = await t.call('POST', '/api/coupons/lookup', { code: 'HOARD20' });
          eq(look.status, 409); eq(look.data.error.code, 'coupon_unavailable');
          eq((await order(t, [side('bones', 2)], 'HOARD20')).status, 400);
        } }
      ]
    },
    {
      id: 'Server 7', name: 'Menu edits are validated and saved all-or-nothing',
      description: 'A bad menu is rejected and the saved menu is left exactly as it was.',
      tests: [
        { name: 'Invalid menus are rejected and nothing changes', run: async (t) => {
          const before = JSON.stringify((await t.call('GET', '/api/menu')).data);
          eq((await t.editMenu((m) => { m.sizes[0].price = -5; })).status, 400, 'negative price');
          eq((await t.editMenu((m) => { m.sides[0].price = 4.5; })).status, 400, 'fractional cents');
          eq((await t.editMenu((m) => { m.coupons.push({ id: 'd', name: 'Dup', code: 'knight10', type: 'amount', value: 100 }); })).status, 400, 'duplicate code');
          eq((await t.editMenu((m) => { m.sides[0].image = '../../server.js'; })).status, 400, 'image path escape');
          eq((await t.editMenu((m) => { m.sizes.forEach((s) => { s.available = false; }); })).status, 400, 'no size available');
          eq(JSON.stringify((await t.call('GET', '/api/menu')).data), before, 'menu unchanged');
        } },
        { name: 'A valid edit is saved and survives', run: async (t) => {
          eq((await t.editMenu((m) => { m.sizes[0].name = 'Tiny'; m.toppingBase = 200; })).status, 200);
          const m = (await t.call('GET', '/api/menu')).data;
          eq(m.sizes[0].name, 'Tiny'); eq(m.toppingBase, 200);
        } }
      ]
    },
    {
      id: 'Server 8', name: 'Order history is a snapshot',
      description: 'Changing a menu price later never changes an order that was already placed.',
      tests: [
        { name: 'A later price change leaves the stored order untouched', run: async (t) => {
          const r = await order(t, [side('bones', 2)]);
          eq(r.status, 201);
          await t.editMenu((m) => { m.sides[0].price = 999; });
          const list = await t.call('GET', '/api/admin/orders');
          eq(list.data.orders[0].lines[0].unitPrice, 499, 'unit price'); eq(list.data.orders[0].total, 998, 'total');
          eq((await t.call('GET', '/api/menu')).data.sides[0].price, 999, 'new price is live');
        } },
        { name: 'Deleting a coupon keeps the order that used it', run: async (t) => {
          eq((await order(t, [side('bones', 2)], 'KNIGHT10')).status, 201);
          eq((await t.editMenu((m) => { m.coupons = m.coupons.filter((c) => c.id !== 'c-knight10'); })).status, 200);
          eq(t.count('orders'), 1, 'order kept'); eq(t.count('coupon_redemptions'), 0, 'redemption removed with the coupon');
          const o = t.db.prepare('SELECT coupon_id, coupon_code FROM orders').get();
          eq(o.coupon_id, null); eq(o.coupon_code, 'KNIGHT10');
        } }
      ]
    },
    {
      id: 'Server 9', name: 'Admin changes need the PIN and the server only serves the public pages',
      description: 'Admin API calls need a login, the PIN locks out guessing, and the database and config are never downloadable.',
      tests: [
        { name: 'Every admin route refuses a visitor who is not logged in (401)', run: async (t) => {
          const calls = [['GET', '/api/admin/menu'], ['PUT', '/api/admin/menu', { menu: {} }], ['POST', '/api/admin/menu/reset', {}],
            ['POST', '/api/admin/coupons/unuse-all', {}], ['POST', '/api/admin/coupons/c-knight10/unuse', {}],
            ['GET', '/api/admin/orders'], ['GET', '/api/admin/export'], ['PUT', '/api/admin/rules', { rules: [] }]];
          for (const c of calls) eq((await t.call(c[0], c[1], c[2])).status, 401, c[0] + ' ' + c[1]);
        } },
        { name: 'A wrong PIN is refused and logging in with the right PIN works', run: async (t) => {
          eq((await t.login('000000')).status, 401);
          eq((await t.login()).status, 200);
          eq((await t.call('GET', '/api/admin/session')).data.loggedIn, true);
          await t.call('POST', '/api/admin/logout', {});
          eq((await t.call('GET', '/api/admin/menu')).status, 401, 'after logout');
        } },
        { name: 'Five wrong PINs lock the login, even for the right PIN', run: async (t) => {
          for (let i = 0; i < 5; i++) eq((await t.login('1111' + i)).status, 401);
          const r = await t.login();
          eq(r.status, 429, 'locked'); assert(r.data.error.retryAfter > 0, 'tells how long to wait');
        } },
        { name: 'The public menu never contains coupons', run: async (t) => {
          const m = (await t.call('GET', '/api/menu')).data;
          assert(!('coupons' in m), 'coupons must not be public');
        } },
        { name: 'Database, config and server files cannot be downloaded', run: async (t) => {
          for (const p of ['/config.json', '/data/pizza.db', '/server/db.js', '/server.js', '/package.json',
                           '/js/../server.js', '/js/..%2fserver.js', '/server/seed/default-menu.json', '/.gitignore']) {
            eq(await t.raw(p), 404, p);
          }
          for (const p of ['/', '/admin.html', '/test.html', '/js/logic.js', '/images/logo.svg']) eq(await t.raw(p), 200, p);
        } },
        { name: 'A request for another host name or from another site is refused', run: async (t) => {
          eq(await t.raw('/api/menu', { Host: 'evil.example.com' }), 403, 'bad Host');
          const r = await t.call('POST', '/api/orders', { cart: [side('bones', 2)] }, { Origin: 'http://evil.example.com' });
          eq(r.status, 403, 'bad Origin'); eq(t.count('orders'), 0);
        } },
        { name: 'Oversized and malformed request bodies are refused', run: async (t) => {
          const big = await t.call('POST', '/api/orders', { cart: [], pad: 'x'.repeat(300 * 1024) });
          eq(big.status, 413);
          const res = await fetch(t.base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
          eq(res.status, 400);
        } }
      ]
    },
    {
      id: 'Server 10', name: 'The database keeps its data safe',
      description: 'Constraints reject bad rows and data survives closing and reopening the database file.',
      tests: [
        { name: 'CHECK and foreign-key constraints reject bad rows', run: async (t) => {
          const bad = (sql) => { try { t.db.exec(sql); return false; } catch (e) { return true; } };
          assert(bad("INSERT INTO sizes VALUES ('Z','Z','',-1,1,1,9)"), 'negative price');
          assert(bad("INSERT INTO coupons VALUES ('z','Z','ZZ','mystery',1,1,9)"), 'unknown coupon type');
          assert(bad("INSERT INTO order_lines (order_id, kind, description, qty, unit_price_cents) VALUES (999,'side','x',1,1)"), 'orphan order line');
          assert(bad("INSERT INTO order_lines (order_id, kind, description, qty, unit_price_cents) VALUES (1,'side','x',21,1)"), 'quantity over 20');
        } },
        { name: 'Data survives reopening the database file', run: async () => {
          const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-test-')), 'pizza.db');
          try {
            let db = open(file);
            M.seedIfNeeded(db);
            db.prepare("INSERT INTO orders (created_at, subtotal_cents, discount_cents, total_cents) VALUES ('now', 100, 0, 100)").run();
            db.close();
            db = open(file);
            eq(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c, 1, 'order kept');
            eq(M.seedIfNeeded(db), false, 'does not reseed');
            eq(Number(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value), 1, 'schema version');
            db.close();
          } finally { fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
        } }
      ]
    }
  ];

  if (opts.liveDb) {
    rules.push({
      id: 'Server 11', name: 'Live data: no coupon in the real database can create a negative balance',
      description: 'Every coupon currently saved in the database is checked against many carts built from the real menu.',
      tests: [{
        name: 'Every live coupon is safe on every generated cart', run: async () => {
          const menu = M.readFullMenu(opts.liveDb);
          const avail = (list) => list.filter((x) => x.available !== false);
          const tops = avail(menu.toppings).map((x) => x.id);
          const carts = [];
          let n = 0;
          avail(menu.sizes).forEach((s) => avail(menu.crusts).forEach((c) => {
            for (let k = 0; k <= Math.min(5, tops.length); k++) {
              carts.push([{ id: ++n, kind: 'pizza', size: s.id, crust: c.id, toppings: tops.slice(0, k), qty: 1 }]);
            }
          }));
          const extras = menu.sides.map((x) => ({ kind: 'side', itemId: x.id })).concat(menu.drinks.map((x) => ({ kind: 'drink', itemId: x.id })));
          extras.forEach((x, i) => {
            for (let q = 1; q <= 3; q++) carts.push([{ id: ++n, kind: x.kind, itemId: x.itemId, qty: q }]);
            extras.forEach((y, j) => { if (j > i) carts.push([{ id: ++n, kind: x.kind, itemId: x.itemId, qty: 1 }, { id: ++n, kind: y.kind, itemId: y.itemId, qty: 1 }]); });
          });
          assert(carts.length > 0, 'no carts generated');
          carts.forEach((cart) => menu.coupons.forEach((c) => {
            const sub = L.subtotal(menu, cart);
            const r = L.evaluateCoupon(menu, cart, c, { usedIds: [] });
            if (sub < L.COUPON_MIN_PURCHASE) { assert(!r.ok, c.code + ' must be refused under the minimum'); return; }
            if (!r.ok) return;
            assert(r.amount >= 0 && r.amount <= sub, c.code + ': discount ' + r.amount + ' outside 0..' + sub);
            assert(L.total(menu, cart, { couponId: c.id }, []) >= 0, c.code + ': negative total');
          }));
        }
      }]
    });
  }
  return rules;
}

async function runSelfTests(opts) {
  const results = [];
  for (const rule of buildRules(opts || {})) {
    const tests = [];
    for (const test of rule.tests) {
      let app = null;
      try {
        app = await startFresh();
        await test.run(app);
        tests.push({ name: test.name, ok: true, message: '' });
      } catch (err) {
        tests.push({ name: test.name, ok: false, message: err && err.message ? err.message : String(err) });
      } finally {
        if (app) await app.close();
      }
    }
    results.push({
      id: rule.id, name: rule.name, description: rule.description, tests,
      status: tests.every((x) => x.ok) ? 'pass' : 'fail'
    });
  }
  return { rules: results };
}

module.exports = { runSelfTests };

if (require.main === module) {
  (async () => {
    let liveDb = null;
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
      const file = path.resolve(ROOT, cfg.dbPath || 'data/pizza.db');
      if (fs.existsSync(file)) liveDb = open(file);
    } catch (e) { /* no config yet: skip the live-data check */ }
    const { rules } = await runSelfTests({ liveDb });
    let failed = 0;
    rules.forEach((r) => {
      console.log((r.status === 'pass' ? 'PASS' : 'FAIL') + '  ' + r.id + ': ' + r.name);
      r.tests.forEach((t) => {
        if (!t.ok) { failed++; console.log('        x ' + t.name + '\n          ' + t.message); }
      });
    });
    const total = rules.reduce((n, r) => n + r.tests.length, 0);
    console.log('\n' + (failed ? 'FAILED' : 'ALL PASSED') + ': ' + (total - failed) + ' of ' + total + ' server tests passed' +
      (liveDb ? '' : ' (live-data check skipped: no database yet)'));
    if (liveDb) liveDb.close();
    process.exit(failed ? 1 : 0);
  })();
}
