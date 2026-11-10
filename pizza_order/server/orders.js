'use strict';
/* Placing and listing orders. The server never trusts what the browser sends
 * for money: it rebuilds the cart through the same js/logic.js the page uses,
 * prices everything from the database, and re-applies the coupon. */
const L = require('../js/logic.js');
const { tx } = require('./db.js');
const M = require('./menu.js');

class OrderError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bad(message) { return new OrderError(400, 'invalid_order', message); }

function classify(message) {
  if (/not available|sold out|not on the menu/i.test(message)) return 'sold_out';
  if (/limited to|Maximum of/i.test(message)) return 'limit';
  return 'invalid_order';
}

// Replays the submitted lines through OrderLogic so every limit and availability rule applies.
function buildCart(menu, rawCart) {
  if (!Array.isArray(rawCart) || rawCart.length === 0) throw new OrderError(400, 'empty', 'Your order is empty.');
  if (rawCart.length > 60) throw bad('Too many lines in the order.');
  const cart = [];
  let n = 0;
  const newId = () => ++n;
  for (const line of rawCart) {
    if (!line || typeof line !== 'object') throw bad('Each order line must be an object.');
    if (!Number.isInteger(line.qty) || line.qty < 1) throw bad('Each line needs a whole-number quantity of at least 1.');
    if (line.qty > L.MAX_ITEMS) throw new OrderError(400, 'limit', L.canAddItems([], line.qty).message);
    let pizza = null;
    if (line.kind === 'pizza') {
      if (typeof line.size !== 'string' || typeof line.crust !== 'string' || !Array.isArray(line.toppings)
          || line.toppings.length > 50 || line.toppings.some((t) => typeof t !== 'string')) {
        throw bad('A pizza needs a size, a crust and a list of toppings.');
      }
      if (new Set(line.toppings).size !== line.toppings.length) throw bad('Each topping can only be chosen once.');
      pizza = { size: line.size, crust: line.crust, toppings: line.toppings.slice() };
    } else if (line.kind === 'side' || line.kind === 'drink') {
      if (typeof line.itemId !== 'string') throw bad('A side or drink needs an itemId.');
    } else {
      throw bad('Unknown item kind.');
    }
    for (let i = 0; i < line.qty; i++) {
      const r = pizza
        ? L.addPizzaLine(menu, cart, pizza, newId)
        : L.addExtraLine(menu, cart, line.kind, line.itemId, newId);
      if (!r.ok) throw new OrderError(400, classify(r.message), r.message);
    }
  }
  return cart;
}

function describePizza(menu, p) {
  const names = menu.toppings.filter((t) => p.toppings.indexOf(t.id) > -1).map((t) => t.name);
  return [L.byId(menu.sizes, p.size).name, L.byId(menu.crusts, p.crust).name, names.length ? names.join(', ') : 'Cheese only']
    .join(' · ');
}

// body: { cart: [...], couponCode?: string }. Returns the receipt, or throws OrderError.
function placeOrder(db, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('The order must be an object.');
  if ('coupons' in body || 'couponCodes' in body) {
    throw new OrderError(400, 'coupon_limit', 'Only one coupon can be used per order. Send a single couponCode.');
  }
  if (body.couponCode !== undefined && body.couponCode !== null && typeof body.couponCode !== 'string') {
    throw new OrderError(400, 'coupon_limit', 'Only one coupon can be used per order. Send a single couponCode.');
  }
  const code = typeof body.couponCode === 'string' ? body.couponCode.trim() : '';
  if (code.length > 20) throw new OrderError(400, 'coupon_invalid', 'Coupon code not recognized.');

  return tx(db, () => {
    const menu = M.readFullMenu(db);
    const cart = buildCart(menu, body.cart);
    const order = { couponId: null };
    let coupon = null;
    if (code) {
      const used = M.usedCouponIds(db);
      const found = L.findCouponByCode(menu, code);
      if (found && used.indexOf(found.id) > -1) {
        throw new OrderError(409, 'coupon_used', 'That coupon has already been used.');
      }
      const r = L.tryApplyCoupon(menu, cart, order, code, used);
      if (!r.ok) throw new OrderError(400, 'coupon_invalid', r.message);
      coupon = r.coupon;
    }
    const subtotal = L.subtotal(menu, cart);
    const discount = L.discount(menu, cart, order, []);
    const total = L.total(menu, cart, order, []);

    const createdAt = new Date().toISOString();
    const orderId = Number(db.prepare(
      'INSERT INTO orders (created_at, subtotal_cents, discount_cents, total_cents, coupon_id, coupon_code) VALUES (?, ?, ?, ?, ?, ?)')
      .run(createdAt, subtotal, discount, total, coupon ? coupon.id : null, coupon ? coupon.code : null).lastInsertRowid);

    const insLine = db.prepare('INSERT INTO order_lines (order_id, kind, description, qty, unit_price_cents) VALUES (?, ?, ?, ?, ?)');
    const insTop = db.prepare('INSERT INTO order_line_toppings (line_id, name) VALUES (?, ?)');
    const lines = cart.map((l) => {
      const unit = L.linePrice(menu, l);
      const description = l.kind === 'pizza' ? describePizza(menu, l) : L.extraItem(menu, l).name;
      const lineId = Number(insLine.run(orderId, l.kind, description, l.qty, unit).lastInsertRowid);
      if (l.kind === 'pizza') {
        menu.toppings.filter((t) => l.toppings.indexOf(t.id) > -1).forEach((t) => insTop.run(lineId, t.name));
      }
      return { kind: l.kind, description, qty: l.qty, unitPrice: unit, lineTotal: unit * l.qty };
    });

    if (coupon) {
      try {
        db.prepare('INSERT INTO coupon_redemptions (coupon_id, order_id, redeemed_at) VALUES (?, ?, ?)')
          .run(coupon.id, orderId, createdAt);
      } catch (err) {
        throw new OrderError(409, 'coupon_used', 'That coupon has already been used.');
      }
    }
    return {
      orderId, createdAt, subtotal, discount, total,
      coupon: coupon ? { code: coupon.code, name: coupon.name } : null,
      lines
    };
  });
}

function listOrders(db, limit) {
  const n = Math.max(1, Math.min(200, Number.isInteger(limit) ? limit : 50));
  const lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id');
  return db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?').all(n).map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    subtotal: o.subtotal_cents,
    discount: o.discount_cents,
    total: o.total_cents,
    couponCode: o.coupon_code,
    lines: lines.all(o.id).map((l) => ({
      kind: l.kind, description: l.description, qty: l.qty, unitPrice: l.unit_price_cents
    }))
  }));
}

module.exports = { placeOrder, listOrders, OrderError };
