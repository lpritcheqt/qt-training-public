/* Order business rules. Pure functions with no DOM access, shared by
 * index.html (js/app.js) and test.html (js/rules.js), so the tests exercise the
 * same code the order page runs.
 *
 * Money is in cents. Cart line shapes:
 *   pizza:       { id, kind:'pizza', size, crust, toppings:[ids], qty }
 *   side/drink:  { id, kind:'side'|'drink', itemId, qty }
 * An order is { couponId: string|null } - a single value, so an order can
 * never hold more than one coupon.
 */
var OrderLogic = (function () {
  'use strict';

  var MAX_ITEMS = 20;              // any combination of pizzas, sides and drinks
  var MAX_TOPPINGS = 5;            // per pizza
  var COUPON_MIN_PURCHASE = 500;   // every coupon needs a purchase of at least $5.00
  var EXTRA_LISTS = { side: 'sides', drink: 'drinks' };

  function money(cents) { return '$' + (cents / 100).toFixed(2); }
  function byId(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }
  function isAvailable(item) { return !!item && item.available !== false; }
  function ok() { return { ok: true, message: '' }; }
  function fail(message) { return { ok: false, message: message }; }

  // ---- Pricing -----------------------------------------------------------
  function toppingPrice(menu, sizeId) {
    return Math.round(menu.toppingBase * byId(menu.sizes, sizeId).toppingMult);
  }
  function pizzaPrice(menu, p) {
    return byId(menu.sizes, p.size).price +
           byId(menu.crusts, p.crust).price +
           p.toppings.length * toppingPrice(menu, p.size);
  }
  function extraItem(menu, l) { return byId(menu[EXTRA_LISTS[l.kind]], l.itemId); }
  // Price of ONE unit of a cart line.
  function linePrice(menu, l) {
    if (l.kind === 'pizza') return pizzaPrice(menu, l);
    var item = extraItem(menu, l);
    return item ? item.price : 0;
  }
  function subtotal(menu, cart) {
    return cart.reduce(function (sum, l) { return sum + linePrice(menu, l) * l.qty; }, 0);
  }
  function itemCount(cart) {
    return cart.reduce(function (n, l) { return n + l.qty; }, 0);
  }
  function pizzaKey(p) { return [p.size, p.crust, p.toppings.slice().sort().join(',')].join('|'); }
  function findLine(cart, id) { return cart.filter(function (l) { return l.id === id; })[0]; }

  // ---- Limits ------------------------------------------------------------
  function canAddItems(cart, n) {
    n = n === undefined ? 1 : n;
    if (itemCount(cart) + n > MAX_ITEMS) return fail('Orders are limited to ' + MAX_ITEMS + ' items.');
    return ok();
  }

  // Returns { ok, toppings, message }. Never lets a pizza exceed MAX_TOPPINGS.
  function toggleTopping(toppings, id, on) {
    var list = toppings.slice();
    var i = list.indexOf(id);
    if (on) {
      if (i > -1) return { ok: true, toppings: list, message: '' };
      if (list.length >= MAX_TOPPINGS) {
        return { ok: false, toppings: list, message: 'Maximum of ' + MAX_TOPPINGS + ' toppings per pizza.' };
      }
      list.push(id);
    } else if (i > -1) {
      list.splice(i, 1);
    }
    return { ok: true, toppings: list, message: '' };
  }

  // ---- Cart operations ---------------------------------------------------
  function checkPizza(menu, p) {
    if (p.toppings.length > MAX_TOPPINGS) return fail('Maximum of ' + MAX_TOPPINGS + ' toppings per pizza.');
    if (!isAvailable(byId(menu.sizes, p.size))) return fail('That size is not available.');
    if (!isAvailable(byId(menu.crusts, p.crust))) return fail('That crust is not available.');
    for (var i = 0; i < p.toppings.length; i++) {
      if (!isAvailable(byId(menu.toppings, p.toppings[i]))) return fail('A selected topping is not available.');
    }
    return ok();
  }

  function addPizzaLine(menu, cart, p, newId) {
    var v = checkPizza(menu, p);
    if (!v.ok) return v;
    var room = canAddItems(cart, 1);
    if (!room.ok) return room;
    var same = cart.filter(function (l) { return l.kind === 'pizza' && pizzaKey(l) === pizzaKey(p); })[0];
    if (same) same.qty += 1;
    else cart.push({ id: newId(), kind: 'pizza', size: p.size, crust: p.crust, toppings: p.toppings.slice(), qty: 1 });
    return ok();
  }

  // Replace the contents of an existing pizza line. The item count never grows.
  function updatePizzaLine(menu, cart, lineId, p) {
    var line = findLine(cart, lineId);
    if (!line || line.kind !== 'pizza') return fail('That pizza is no longer in the order.');
    var v = checkPizza(menu, p);
    if (!v.ok) return v;
    var other = cart.filter(function (l) { return l !== line && l.kind === 'pizza' && pizzaKey(l) === pizzaKey(p); })[0];
    if (other) {
      other.qty += line.qty;
      cart.splice(cart.indexOf(line), 1);
    } else {
      line.size = p.size; line.crust = p.crust; line.toppings = p.toppings.slice();
    }
    return ok();
  }

  function addExtraLine(menu, cart, kind, itemId, newId) {
    var list = EXTRA_LISTS[kind];
    var item = list && byId(menu[list], itemId);
    if (!item) return fail('That item is not on the menu.');
    if (!isAvailable(item)) return fail('That item is sold out.');
    var room = canAddItems(cart, 1);
    if (!room.ok) return room;
    var same = cart.filter(function (l) { return l.kind === kind && l.itemId === itemId; })[0];
    if (same) same.qty += 1;
    else cart.push({ id: newId(), kind: kind, itemId: itemId, qty: 1 });
    return ok();
  }

  function changeQty(cart, lineId, delta) {
    var line = findLine(cart, lineId);
    if (!line) return fail('That item is no longer in the order.');
    if (delta > 0) {
      var room = canAddItems(cart, delta);
      if (!room.ok) return room;
    }
    line.qty += delta;
    if (line.qty <= 0) cart.splice(cart.indexOf(line), 1);
    return ok();
  }

  function removeLine(cart, lineId) {
    var line = findLine(cart, lineId);
    if (line) cart.splice(cart.indexOf(line), 1);
  }

  function duplicateLine(cart, lineId, newId) {
    var line = findLine(cart, lineId);
    if (!line || line.kind !== 'pizza') return fail('Only pizzas can be duplicated.');
    var room = canAddItems(cart, 1);
    if (!room.ok) return room;
    cart.splice(cart.indexOf(line) + 1, 0,
      { id: newId(), kind: 'pizza', size: line.size, crust: line.crust, toppings: line.toppings.slice(), qty: 1 });
    return ok();
  }

  // ---- Coupons -----------------------------------------------------------
  // ctx: { appliedCouponId, usedIds[] }. Returns { ok, amount, message }.
  // The discount is always clamped to 0..subtotal, so the balance can never go
  // below zero and the customer is never owed money.
  function evaluateCoupon(menu, cart, c, ctx) {
    ctx = ctx || {};
    function no(message) { return { ok: false, amount: 0, message: message }; }
    var sub = subtotal(menu, cart);
    if (!c || c.available === false) return no('That coupon is not available.');
    if (c.id !== ctx.appliedCouponId && (ctx.usedIds || []).indexOf(c.id) > -1) return no('That coupon has already been used.');
    if (sub < COUPON_MIN_PURCHASE) return no('Coupons require a purchase of at least ' + money(COUPON_MIN_PURCHASE) + '.');
    var amount;
    var v = Number(c.value);
    if (c.type === 'percent') {
      if (!isFinite(v)) return no('That coupon is not set up correctly.');
      amount = Math.round(sub * Math.min(Math.max(v, 0), 100) / 100);
    } else if (c.type === 'amount') {
      if (!isFinite(v)) return no('That coupon is not set up correctly.');
      amount = v;
    } else if (c.type === 'freeSide' || c.type === 'freeDrink') {
      var kind = c.type === 'freeSide' ? 'side' : 'drink';
      var prices = cart.filter(function (l) { return l.kind === kind; })
                       .map(function (l) { return linePrice(menu, l); });
      if (!prices.length) return no('Add a ' + kind + ' to your order to use this coupon.');
      amount = Math.min.apply(null, prices);        // the lowest-priced one is free
    } else {
      return no('That coupon is not set up correctly.');
    }
    amount = Math.max(0, Math.min(amount, sub));
    return { ok: true, amount: amount, message: '' };
  }

  function findCouponByCode(menu, code) {
    var want = String(code || '').trim().toUpperCase();
    return (menu.coupons || []).filter(function (c) { return String(c.code).trim().toUpperCase() === want; })[0];
  }

  // Only one coupon may be on an order: refuses if one is already applied.
  function tryApplyCoupon(menu, cart, order, code, usedIds) {
    if (order.couponId) {
      return { ok: false, message: 'Only one coupon can be used per order. Remove the current coupon first.' };
    }
    if (!String(code || '').trim()) return { ok: false, message: 'Enter a coupon code.' };
    var c = findCouponByCode(menu, code);
    if (!c) return { ok: false, message: 'Coupon code not recognized.' };
    var r = evaluateCoupon(menu, cart, c, { appliedCouponId: null, usedIds: usedIds });
    if (!r.ok) return { ok: false, message: r.message };
    order.couponId = c.id;
    return { ok: true, coupon: c, message: 'Coupon applied: ' + c.name + '.' };
  }

  function removeCoupon(order) { order.couponId = null; }

  // If the cart changed so the coupon no longer qualifies, drop it. Returns a message or null.
  function revalidateCoupon(menu, cart, order, usedIds) {
    if (!order.couponId) return null;
    var c = byId(menu.coupons, order.couponId);
    var r = c && evaluateCoupon(menu, cart, c, { appliedCouponId: order.couponId, usedIds: usedIds });
    if (!r || !r.ok) {
      order.couponId = null;
      return 'Coupon removed. ' + (r ? r.message : 'It is no longer available.');
    }
    return null;
  }

  function discount(menu, cart, order, usedIds) {
    if (!order.couponId) return 0;
    var c = byId(menu.coupons, order.couponId);
    var r = c && evaluateCoupon(menu, cart, c, { appliedCouponId: order.couponId, usedIds: usedIds });
    return r && r.ok ? r.amount : 0;
  }

  // What the customer pays. Never below zero.
  function total(menu, cart, order, usedIds) {
    return Math.max(0, subtotal(menu, cart) - discount(menu, cart, order, usedIds));
  }

  return {
    MAX_ITEMS: MAX_ITEMS, MAX_TOPPINGS: MAX_TOPPINGS, COUPON_MIN_PURCHASE: COUPON_MIN_PURCHASE,
    EXTRA_LISTS: EXTRA_LISTS,
    money: money, byId: byId, isAvailable: isAvailable,
    toppingPrice: toppingPrice, pizzaPrice: pizzaPrice, extraItem: extraItem, linePrice: linePrice,
    subtotal: subtotal, itemCount: itemCount, findLine: findLine,
    canAddItems: canAddItems, toggleTopping: toggleTopping,
    addPizzaLine: addPizzaLine, updatePizzaLine: updatePizzaLine, addExtraLine: addExtraLine,
    changeQty: changeQty, removeLine: removeLine, duplicateLine: duplicateLine,
    evaluateCoupon: evaluateCoupon, findCouponByCode: findCouponByCode,
    tryApplyCoupon: tryApplyCoupon, removeCoupon: removeCoupon, revalidateCoupon: revalidateCoupon,
    discount: discount, total: total
  };
})();
