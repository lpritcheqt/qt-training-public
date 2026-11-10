/* Built-in business rules and their tests (like unit tests in C#).
 * Run them from test.html. Each rule has one or more tests; a rule passes only
 * if every test in it passes. Tests use fixed fixture data (fixtureMenu) so
 * edits made on the admin page can't change the outcome, plus a few checks
 * against the live menu.
 *
 * To add a rule, append an entry to BUILTIN_RULES. Rules with no tests (or
 * manual:true) are listed as MANUAL: nothing automatic checks them.
 */
var L = OrderLogic;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'Values differ') + ' (expected ' + expected + ', got ' + actual + ')');
  }
}
function makeIds() { var n = 1000; return function () { return ++n; }; }

// A small, fixed menu used by the tests. Prices in cents.
function fixtureMenu() {
  var tops = [];
  for (var i = 1; i <= 8; i++) tops.push({ id: 't' + i, name: 'Topping ' + i, emoji: '' });
  tops.push({ id: 'tsold', name: 'Sold Out Topping', emoji: '', available: false });
  return {
    sizes: [
      { id: 'M', name: 'Medium', detail: '12"', price: 1000, toppingMult: 1 },
      { id: 'L', name: 'Large',  detail: '14"', price: 1500, toppingMult: 1.5 }
    ],
    crusts: [
      { id: 'hand', name: 'Hand-Tossed', price: 0 },
      { id: 'deep', name: 'Deep Dish',   price: 200 }
    ],
    toppingBase: 100,
    toppings: tops,
    sides: [
      { id: 's499', name: 'Side 4.99', price: 499 },
      { id: 's500', name: 'Side 5.00', price: 500 },
      { id: 's100', name: 'Side 1.00', price: 100 },
      { id: 'ssold', name: 'Sold Out Side', price: 300, available: false }
    ],
    drinks: [
      { id: 'd229', name: 'Drink 2.29', price: 229 },
      { id: 'd100', name: 'Drink 1.00', price: 100 }
    ],
    coupons: [
      { id: 'pct10',     name: '10% off',     code: 'PCT10',     type: 'percent',   value: 10 },
      { id: 'pct100',    name: '100% off',    code: 'PCT100',    type: 'percent',   value: 100 },
      { id: 'amt3',      name: '$3 off',      code: 'AMT3',      type: 'amount',    value: 300 },
      { id: 'amt5',      name: '$5 off',      code: 'AMT5',      type: 'amount',    value: 500 },
      { id: 'amt100',    name: '$100 off',    code: 'AMT100',    type: 'amount',    value: 10000 },
      { id: 'freeside',  name: 'Free side',   code: 'FREESIDE',  type: 'freeSide',  value: 0 },
      { id: 'freedrink', name: 'Free drink',  code: 'FREEDRINK', type: 'freeDrink', value: 0 },
      { id: 'off',       name: 'Inactive',    code: 'OFF',       type: 'amount',    value: 300, available: false }
    ]
  };
}

// Build a cart directly: { pizzas:[[toppingIds],...], sides:{id:qty}, drinks:{id:qty} }
function cartOf(spec) {
  var cart = [], n = 0;
  (spec.pizzas || []).forEach(function (t) {
    cart.push({ id: ++n, kind: 'pizza', size: 'M', crust: 'hand', toppings: t.slice(), qty: 1 });
  });
  ['side', 'drink'].forEach(function (kind) {
    var src = spec[kind + 's'] || {};
    Object.keys(src).forEach(function (id) {
      if (src[id] > 0) cart.push({ id: ++n, kind: kind, itemId: id, qty: src[id] });
    });
  });
  return cart;
}

function newOrder() { return { couponId: null }; }
function topN(n) { var a = []; for (var i = 1; i <= n; i++) a.push('t' + i); return a; }

// Checks that must hold for any coupon on any cart.
function checkInvariants(menu, cart, coupon, label) {
  var sub = L.subtotal(menu, cart);
  var r = L.evaluateCoupon(menu, cart, coupon, { usedIds: [] });
  if (sub < L.COUPON_MIN_PURCHASE) {
    assert(!r.ok, label + ': coupon must be refused below the minimum purchase');
    return;
  }
  if (!r.ok) return;
  assert(r.amount >= 0, label + ': discount is negative (' + r.amount + ')');
  assert(r.amount <= sub, label + ': discount ' + r.amount + ' exceeds subtotal ' + sub);
  var order = { couponId: coupon.id };
  var total = L.total(menu, cart, order, []);
  assert(total >= 0, label + ': total is negative (' + total + ')');
  assert(total <= sub, label + ': total ' + total + ' is above the subtotal ' + sub);
}

var BUILTIN_RULES = [
  // ------------------------------------------------------------------ 1
  {
    id: 'Rule 1',
    name: 'Only one coupon can be used per order',
    description: 'An order can hold at most one coupon. A second coupon is refused until the first is removed.',
    tests: [
      { name: 'A second, different coupon is refused while one is applied', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'PCT10', []).ok, 'first coupon should apply');
        var r = L.tryApplyCoupon(menu, cart, order, 'AMT3', []);
        assert(!r.ok, 'second coupon should be refused');
        assertEqual(order.couponId, 'pct10', 'first coupon must stay on the order');
        assertEqual(L.discount(menu, cart, order, []), 100, 'only the first coupon discounts');
        assertEqual(L.total(menu, cart, order, []), 900, 'total reflects one coupon only');
      } },
      { name: 'The same coupon cannot be applied twice', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        L.tryApplyCoupon(menu, cart, order, 'AMT3', []);
        var r = L.tryApplyCoupon(menu, cart, order, 'AMT3', []);
        assert(!r.ok, 'same coupon twice should be refused');
        assertEqual(L.discount(menu, cart, order, []), 300, 'discount counted once');
      } },
      { name: 'A free-item coupon cannot be stacked with a percent coupon', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 1 }, drinks: { d229: 1 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'FREESIDE', []).ok, 'free side applies');
        assert(!L.tryApplyCoupon(menu, cart, order, 'PCT10', []).ok, 'second coupon refused');
        assertEqual(L.discount(menu, cart, order, []), 500, 'only the free side is discounted');
      } },
      { name: 'After removing the coupon a different one can be applied', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        L.tryApplyCoupon(menu, cart, order, 'PCT10', []);
        L.removeCoupon(order);
        assertEqual(order.couponId, null, 'coupon removed');
        assert(L.tryApplyCoupon(menu, cart, order, 'AMT3', []).ok, 'new coupon should apply');
        assertEqual(order.couponId, 'amt3');
      } },
      { name: 'An order stores a single coupon id, never a list', run: function () {
        var order = newOrder();
        assert(!Array.isArray(order.couponId), 'couponId must not be an array');
      } }
    ]
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'Rule 2',
    name: 'A coupon never creates a negative balance',
    description: 'The discount is never more than the order subtotal, so we never owe the customer money. ' +
                 'Example: a $5 coupon on a $4.99 order is refused and the customer simply pays $4.99.',
    tests: [
      { name: '$5 coupon on a $4.99 item is refused and the customer owes $4.99', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s499: 1 } }), order = newOrder();
        var r = L.tryApplyCoupon(menu, cart, order, 'AMT5', []);
        assert(!r.ok, 'coupon should be refused');
        assertEqual(L.total(menu, cart, order, []), 499, 'customer pays the full price');
        assert(L.total(menu, cart, order, []) >= 0, 'balance must not be negative');
      } },
      { name: '$100 coupon on a $5.00 order leaves $0.00, not a negative balance', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 1 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'AMT100', []).ok, 'coupon applies at the $5.00 minimum');
        assertEqual(L.discount(menu, cart, order, []), 500, 'discount capped at the subtotal');
        assertEqual(L.total(menu, cart, order, []), 0, 'total is exactly zero');
      } },
      { name: '100% off leaves $0.00, not a negative balance', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 1 }, drinks: { d229: 3 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'PCT100', []).ok);
        assertEqual(L.total(menu, cart, order, []), 0);
      } },
      { name: 'A free-item coupon never exceeds the order subtotal', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 1 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'FREESIDE', []).ok);
        assertEqual(L.total(menu, cart, order, []), 0, 'free $5.00 side on a $5.00 order = $0.00');
      } },
      { name: 'Badly configured coupons (negative, huge, NaN) are clamped to 0..subtotal', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } });   // $10.00
        var bad = [
          { id: 'b1', name: 'neg',    code: 'B1', type: 'amount',  value: -500 },
          { id: 'b2', name: 'huge',   code: 'B2', type: 'percent', value: 250 },
          { id: 'b3', name: 'nan',    code: 'B3', type: 'amount',  value: NaN },
          { id: 'b4', name: 'string', code: 'B4', type: 'percent', value: 'abc' },
          { id: 'b5', name: 'negpct', code: 'B5', type: 'percent', value: -20 },
          { id: 'b6', name: 'type',   code: 'B6', type: 'mystery', value: 5 }
        ];
        bad.forEach(function (c) {
          var r = L.evaluateCoupon(menu, cart, c, { usedIds: [] });
          assert(r.amount >= 0 && r.amount <= 1000, c.name + ': discount ' + r.amount + ' is outside 0..1000');
        });
      } },
      { name: 'Every coupon type on 1,700+ generated carts never goes negative', run: function () {
        var menu = fixtureMenu(), carts = 0, q, pz;
        for (var a = 0; a <= 2; a++) for (var b = 0; b <= 2; b++) for (var c = 0; c <= 2; c++)
        for (var d = 0; d <= 2; d++) for (var e = 0; e <= 2; e++) {
          for (pz = -1; pz <= 5; pz++) {
            var cart = cartOf({
              pizzas: pz < 0 ? [] : [topN(pz)],
              sides: { s499: a, s500: b, s100: c }, drinks: { d229: d, d100: e }
            });
            carts++;
            menu.coupons.forEach(function (coupon) { checkInvariants(menu, cart, coupon, coupon.code + ' on cart #' + carts); });
          }
        }
        assert(carts >= 1700, 'expected at least 1,700 carts, ran ' + carts);
      } },
      { name: 'Live menu: every coupon is safe on carts built from the live items', run: function () {
        var menu = loadMenu(), carts = [], n = 0;
        var avail = function (list) { return list.filter(isItemAvailable); };
        var tops = avail(menu.toppings).map(function (t) { return t.id; });
        avail(menu.sizes).forEach(function (s) {
          avail(menu.crusts).forEach(function (cr) {
            for (var k = 0; k <= Math.min(5, tops.length); k++) {
              carts.push([{ id: ++n, kind: 'pizza', size: s.id, crust: cr.id, toppings: tops.slice(0, k), qty: 1 }]);
            }
          });
        });
        var extras = [];
        menu.sides.forEach(function (x) { extras.push({ kind: 'side', itemId: x.id }); });
        menu.drinks.forEach(function (x) { extras.push({ kind: 'drink', itemId: x.id }); });
        extras.forEach(function (x, i) {
          for (var q = 1; q <= 3; q++) carts.push([{ id: ++n, kind: x.kind, itemId: x.itemId, qty: q }]);
          extras.forEach(function (y, j) {
            if (j > i) carts.push([{ id: ++n, kind: x.kind, itemId: x.itemId, qty: 1 }, { id: ++n, kind: y.kind, itemId: y.itemId, qty: 1 }]);
          });
        });
        assert(carts.length > 0, 'no carts generated from the live menu');
        carts.forEach(function (cart, i) {
          menu.coupons.forEach(function (coupon) { checkInvariants(menu, cart, coupon, 'live ' + coupon.code + ' cart #' + i); });
        });
      } }
    ]
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'Rule 3',
    name: 'No more than 20 items per order, in any combination',
    description: 'Pizzas, sides and drinks all count toward one shared limit of 20 items (counting quantities).',
    tests: [
      { name: 'Exactly 20 items are allowed and the 21st is refused', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds();
        for (var i = 1; i <= 20; i++) assert(L.addExtraLine(menu, cart, 'side', 's100', ids).ok, 'item ' + i + ' should be allowed');
        assertEqual(L.itemCount(cart), 20);
        assert(!L.addExtraLine(menu, cart, 'side', 's100', ids).ok, 'item 21 should be refused');
        assertEqual(L.itemCount(cart), 20, 'count must stay at 20');
      } },
      { name: 'Pizzas, sides and drinks share the limit (8 + 6 + 6 = 20)', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds(), i;
        for (i = 0; i < 4; i++) assert(L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: [] }, ids).ok);
        for (i = 0; i < 4; i++) assert(L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: ['t1'] }, ids).ok);
        for (i = 0; i < 6; i++) assert(L.addExtraLine(menu, cart, 'side', 's100', ids).ok);
        for (i = 0; i < 6; i++) assert(L.addExtraLine(menu, cart, 'drink', 'd100', ids).ok);
        assertEqual(L.itemCount(cart), 20);
        assert(!L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: ['t2'] }, ids).ok, 'new pizza refused');
        assert(!L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: [] }, ids).ok, 'identical pizza refused');
        assert(!L.addExtraLine(menu, cart, 'side', 's500', ids).ok, 'side refused');
        assert(!L.addExtraLine(menu, cart, 'drink', 'd229', ids).ok, 'drink refused');
        assert(!L.changeQty(cart, cart[0].id, 1).ok, 'quantity increase refused');
        assert(!L.duplicateLine(cart, cart[0].id, ids).ok, 'duplicate refused');
        assertEqual(L.itemCount(cart), 20, 'count must stay at 20');
      } },
      { name: 'Quantity buttons stop at 20', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds();
        L.addExtraLine(menu, cart, 'drink', 'd100', ids);
        var id = cart[0].id;
        for (var i = 0; i < 19; i++) assert(L.changeQty(cart, id, 1).ok, 'increase ' + (i + 1));
        assertEqual(cart[0].qty, 20);
        assert(!L.changeQty(cart, id, 1).ok, 'increase past 20 should be refused');
        assertEqual(cart[0].qty, 20);
      } },
      { name: 'A bulk add that would pass 20 is refused', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s100: 19 } });
        assert(L.canAddItems(cart, 1).ok, 'one more is fine at 19');
        assert(!L.canAddItems(cart, 2).ok, 'two more is over the limit');
      } },
      { name: 'Removing an item frees up room', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds();
        for (var i = 0; i < 20; i++) L.addExtraLine(menu, cart, 'side', 's100', ids);
        assert(!L.addExtraLine(menu, cart, 'drink', 'd100', ids).ok);
        assert(L.changeQty(cart, cart[0].id, -1).ok);
        assertEqual(L.itemCount(cart), 19);
        assert(L.addExtraLine(menu, cart, 'drink', 'd100', ids).ok, 'there is room again');
        assertEqual(L.itemCount(cart), 20);
      } },
      { name: 'Editing a pizza at the limit is allowed because the count does not change', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds();
        L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: [] }, ids);
        for (var i = 0; i < 19; i++) L.addExtraLine(menu, cart, 'side', 's100', ids);
        assertEqual(L.itemCount(cart), 20);
        assert(L.updatePizzaLine(menu, cart, cart[0].id, { size: 'L', crust: 'deep', toppings: ['t1'] }).ok, 'edit allowed');
        assertEqual(L.itemCount(cart), 20);
      } }
    ]
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'Rule 4',
    name: 'Maximum of 5 toppings per pizza',
    description: 'A pizza can have 0 to 5 toppings. A sixth topping is refused everywhere: builder, new pizza and edited pizza.',
    tests: [
      { name: 'Five toppings can be added and the sixth is refused', run: function () {
        var list = [];
        for (var i = 1; i <= 5; i++) {
          var r = L.toggleTopping(list, 't' + i, true);
          assert(r.ok, 'topping ' + i + ' should be allowed');
          list = r.toppings;
        }
        var sixth = L.toggleTopping(list, 't6', true);
        assert(!sixth.ok, 'sixth topping should be refused');
        assertEqual(sixth.toppings.length, 5, 'still five toppings');
      } },
      { name: 'Unchecking a topping frees a slot', run: function () {
        var list = L.toggleTopping(topN(5), 't3', false).toppings;
        assertEqual(list.length, 4);
        assert(L.toggleTopping(list, 't6', true).ok, 'a new topping fits again');
      } },
      { name: 'A new pizza with 6 toppings is refused', run: function () {
        var menu = fixtureMenu(), cart = [];
        var r = L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: topN(6) }, makeIds());
        assert(!r.ok, 'six toppings should be refused');
        assertEqual(cart.length, 0, 'nothing added to the cart');
      } },
      { name: 'A pizza with exactly 5 toppings is accepted', run: function () {
        var menu = fixtureMenu(), cart = [];
        assert(L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: topN(5) }, makeIds()).ok);
        assertEqual(cart[0].toppings.length, 5);
      } },
      { name: 'Editing a pizza to 6 toppings is refused and leaves it unchanged', run: function () {
        var menu = fixtureMenu(), cart = [], ids = makeIds();
        L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: topN(5) }, ids);
        var r = L.updatePizzaLine(menu, cart, cart[0].id, { size: 'M', crust: 'hand', toppings: topN(6) });
        assert(!r.ok, 'edit to six toppings should be refused');
        assertEqual(cart[0].toppings.length, 5, 'original toppings kept');
      } },
      { name: 'A 5-topping pizza is priced correctly (Medium $10.00 + 5 x $1.00; Large $15.00 + 5 x $1.50)', run: function () {
        var menu = fixtureMenu();
        assertEqual(L.pizzaPrice(menu, { size: 'M', crust: 'hand', toppings: topN(5) }), 1500);
        assertEqual(L.pizzaPrice(menu, { size: 'L', crust: 'hand', toppings: topN(5) }), 2250);
      } }
    ]
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'Rule 5',
    name: 'Every coupon requires a purchase of at least $5.00',
    description: 'All free-item and discount coupons are refused unless the order subtotal is $5.00 or more.',
    tests: [
      { name: '$4.99 order is refused, $5.00 order is accepted', run: function () {
        var menu = fixtureMenu(), order = newOrder();
        assert(!L.tryApplyCoupon(menu, cartOf({ sides: { s499: 1 } }), order, 'PCT10', []).ok, '$4.99 refused');
        assertEqual(order.couponId, null);
        assert(L.tryApplyCoupon(menu, cartOf({ sides: { s500: 1 } }), order, 'PCT10', []).ok, '$5.00 accepted');
      } },
      { name: 'Every coupon type is refused at $4.99', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s499: 1 } });
        menu.coupons.forEach(function (c) {
          assert(!L.evaluateCoupon(menu, cart, c, { usedIds: [] }).ok, c.code + ' should be refused at $4.99');
        });
      } },
      { name: 'A coupon is removed if the order later drops below $5.00', run: function () {
        var menu = fixtureMenu(), order = newOrder(), cart = cartOf({ sides: { s500: 1 }, drinks: { d100: 1 } });
        assert(L.tryApplyCoupon(menu, cart, order, 'PCT10', []).ok);
        cart = cartOf({ drinks: { d100: 1 } });
        var note = L.revalidateCoupon(menu, cart, order, []);
        assert(note, 'a message should explain why it was removed');
        assertEqual(order.couponId, null, 'coupon removed');
        assertEqual(L.total(menu, cart, order, []), 100);
      } }
    ]
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'Rule 6',
    name: 'Each coupon can only be used once',
    description: 'A coupon marked as used is refused. (Used coupons are remembered in the browser that placed the order.)',
    tests: [
      { name: 'A used coupon is refused', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        var r = L.tryApplyCoupon(menu, cart, order, 'PCT10', ['pct10']);
        assert(!r.ok, 'used coupon should be refused');
        assert(/already been used/.test(r.message), 'message should say it was already used');
        assertEqual(order.couponId, null);
      } },
      { name: 'A coupon that is not used yet is accepted', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        assert(L.tryApplyCoupon(menu, cart, order, 'PCT10', ['amt3']).ok);
      } },
      { name: 'The coupon on the current order keeps working after it is marked used (order placed)', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = { couponId: 'pct10' };
        assertEqual(L.discount(menu, cart, order, ['pct10']), 100);
      } },
      { name: 'Used-coupon storage records a coupon once and can clear it', run: function () {
        var before = getUsedCoupons();
        try {
          clearUsedCoupons();
          markCouponUsed('zz-test'); markCouponUsed('zz-test');
          assertEqual(getUsedCoupons().filter(function (x) { return x === 'zz-test'; }).length, 1, 'recorded once');
          unmarkCouponUsed('zz-test');
          assertEqual(getUsedCoupons().indexOf('zz-test'), -1, 'cleared');
        } finally {
          setUsedCoupons(before);      // put the real data back
        }
      } }
    ]
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'Rule 7',
    name: 'Unavailable (sold out) items cannot be ordered',
    description: 'Sold-out sizes, crusts, toppings, sides, drinks and inactive coupons can never be added or applied.',
    tests: [
      { name: 'A sold-out side cannot be added', run: function () {
        var menu = fixtureMenu(), cart = [];
        assert(!L.addExtraLine(menu, cart, 'side', 'ssold', makeIds()).ok);
        assertEqual(cart.length, 0);
      } },
      { name: 'A sold-out topping cannot go on a pizza', run: function () {
        var menu = fixtureMenu(), cart = [];
        assert(!L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: ['tsold'] }, makeIds()).ok);
        assertEqual(cart.length, 0);
      } },
      { name: 'A sold-out size or crust cannot be ordered', run: function () {
        var menu = fixtureMenu(), cart = [];
        menu.sizes[0].available = false;
        assert(!L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: [] }, makeIds()).ok, 'size');
        menu.sizes[0].available = true; menu.crusts[0].available = false;
        assert(!L.addPizzaLine(menu, cart, { size: 'M', crust: 'hand', toppings: [] }, makeIds()).ok, 'crust');
      } },
      { name: 'An inactive coupon cannot be applied', run: function () {
        var menu = fixtureMenu(), cart = cartOf({ sides: { s500: 2 } }), order = newOrder();
        assert(!L.tryApplyCoupon(menu, cart, order, 'OFF', []).ok);
        assertEqual(order.couponId, null);
      } }
    ]
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'Rule 8',
    name: 'The menu must always be orderable',
    description: 'At least one size and one crust must stay available, and the menu data must be valid.',
    tests: [
      { name: 'The fixture and live menus pass validation', run: function () {
        assertEqual(validateMenu(fixtureMenu()).length, 0, 'fixture menu problems');
        var live = validateMenu(loadMenu());
        assertEqual(live.length, 0, 'live menu problems: ' + live.join('; '));
      } },
      { name: 'A menu with every size sold out is rejected', run: function () {
        var menu = fixtureMenu();
        menu.sizes.forEach(function (s) { s.available = false; });
        assert(validateMenu(menu).some(function (p) { return /size/i.test(p); }));
      } },
      { name: 'A menu with every crust sold out is rejected', run: function () {
        var menu = fixtureMenu();
        menu.crusts.forEach(function (c) { c.available = false; });
        assert(validateMenu(menu).some(function (p) { return /crust/i.test(p); }));
      } },
      { name: 'Duplicate coupon codes are rejected', run: function () {
        var menu = fixtureMenu();
        menu.coupons.push({ id: 'dupe', name: 'Dupe', code: 'pct10', type: 'amount', value: 100 });
        assert(validateMenu(menu).some(function (p) { return /Duplicate coupon code/.test(p); }));
      } }
    ]
  },
  // ------------------------------------------------------------------ 9
  {
    id: 'Rule 9',
    name: 'The running total is always correct',
    description: 'Subtotal = sum of (line price x quantity). Total = subtotal - coupon discount. Money is whole cents.',
    tests: [
      { name: 'Mixed order: pizza + 2 sides + drink with a 10% coupon', run: function () {
        var menu = fixtureMenu(), order = { couponId: 'pct10' };
        var cart = cartOf({ pizzas: [['t1', 't2']], sides: { s499: 2 }, drinks: { d229: 1 } });
        // pizza 1000 + 2*100 = 1200; sides 2*499 = 998; drink 229 -> 2427
        assertEqual(L.subtotal(menu, cart), 2427, 'subtotal');
        assertEqual(L.discount(menu, cart, order, []), 243, 'discount (10% of 2427 rounded)');
        assertEqual(L.total(menu, cart, order, []), 2184, 'total');
      } },
      { name: 'Quantities multiply line prices', run: function () {
        var menu = fixtureMenu();
        assertEqual(L.subtotal(menu, cartOf({ sides: { s499: 3 } })), 1497);
      } },
      { name: 'Money formats as dollars and cents', run: function () {
        assertEqual(L.money(499), '$4.99');
        assertEqual(L.money(0), '$0.00');
        assertEqual(L.money(10000), '$100.00');
      } }
    ]
  },
  // ------------------------------------------------------------------ manual
  {
    id: 'Rule 10',
    name: 'Unavailable items are shown in red with a strikethrough, followed by (sold out)',
    description: 'Display rule from CLAUDE.md. No automatic check yet: look at the order page with a sold-out item (Bacon is sold out by default) and confirm.',
    manual: true,
    tests: []
  }
];
