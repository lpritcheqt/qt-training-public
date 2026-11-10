/* Shared menu definition, used by index.html and admin.html.
 *
 * Load order for the menu (first one found wins):
 *   1. Saved in this browser by admin.html   (localStorage)
 *   2. js/menu-data.js (MENU_OVERRIDE)       (file exported from admin.html)
 *   3. DEFAULT_MENU below
 *
 * Prices are in cents. An item is available unless it has `available: false`.
 * Placeholder prices for review - not QuikTrip or company facts.
 */
var MENU_STORAGE_KEY = 'dckp_menu_v1';

var DEFAULT_MENU = {
  sizes: [
    { id: 'S',  name: 'Small',   detail: '8"',  price: 899,  toppingMult: 1 },
    { id: 'M',  name: 'Medium',  detail: '12"', price: 1099, toppingMult: 1 },
    { id: 'L',  name: 'Large',   detail: '14"', price: 1299, toppingMult: 1.25 },
    { id: 'XL', name: 'X-Large', detail: '16"', price: 1499, toppingMult: 1.5 }
  ],
  crusts: [
    { id: 'thin',    name: 'Thin',                       price: 0 },
    { id: 'hand',    name: 'Hand-Tossed',                price: 0 },
    { id: 'deep',    name: 'Deep Dish',                  price: 200 },
    { id: 'stuffed', name: 'Stuffed',                    price: 300 },
    { id: 'knight',  name: 'Crunchy Knight (signature)', price: 250 }
  ],
  toppingBase: 125,
  toppings: [
    { id: 'pepperoni', name: 'Pepperoni',    emoji: '🍕' },
    { id: 'sausage',   name: 'Sausage',      emoji: '🌭' },
    { id: 'bacon',     name: 'Bacon',        emoji: '🥓', available: false },
    { id: 'ham',       name: 'Ham',          emoji: '🍖' },
    { id: 'mushroom',  name: 'Mushrooms',    emoji: '🍄' },
    { id: 'onion',     name: 'Onions',       emoji: '🧅' },
    { id: 'spinach',   name: 'Spinach',      emoji: '🥬' },
    { id: 'olive',     name: 'Black Olives', emoji: '⚫' },
    { id: 'jalapeno',  name: 'Jalapeños', emoji: '🌶️' },
    { id: 'tomato',    name: 'Tomatoes',     emoji: '🍅' },
    { id: 'pineapple', name: 'Pineapple',    emoji: '🍍' },
    { id: 'cheese',    name: 'Extra Cheese', emoji: '🧀' }
  ],
  sides: [
    { id: 'bones',   name: 'Bag of Bones',            desc: 'Buttery breadsticks, served with a dip in the dungeon.', price: 499, image: 'images/sides/bag-of-bones.svg' },
    { id: 'wyvern',  name: 'Wyvern Wings',            desc: 'Crispy wings in your choice of scorching sauce.',        price: 899, image: 'images/sides/wyvern-wings.svg' },
    { id: 'goblin',  name: 'Goblin Gold',             desc: 'Golden cheesy bites, hoarded in a bag.',                 price: 599, image: 'images/sides/goblin-gold.svg' },
    { id: 'troll',   name: 'Troll Toenails',          desc: 'Garlic knots. Smells terrible, tastes great.',           price: 449, image: 'images/sides/troll-toenails.svg' },
    { id: 'hobbit',  name: 'Second Breakfast Salad',  desc: 'Garden salad for the small but mighty.',                 price: 549, image: 'images/sides/hobbit-salad.svg' },
    { id: 'egg',     name: 'Molten Dragon Egg',       desc: 'Warm chocolate lava cake. Cracks open to fiery goodness.', price: 499, image: 'images/sides/molten-dragon-egg.svg' }
  ],
  drinks: [
    { id: 'cola',    name: "Dragon's Breath Cola",    desc: 'The legendary cola with a fiery finish.',  price: 229, image: 'images/drinks/dragons-breath-cola.svg' },
    { id: 'orange',  name: 'Dragon Fire Orange',      desc: 'Blazing orange soda.',                     price: 229, image: 'images/drinks/dragon-fire-orange.svg' },
    { id: 'root',    name: 'Dragon Scale Root Beer',  desc: 'Smooth, creamy and thick-skinned.',        price: 229, image: 'images/drinks/dragon-scale-root-beer.svg' },
    { id: 'lime',    name: 'Dragon Zest Lemon-Lime',  desc: 'Sharp, bright and a little bit wicked.',   price: 229, image: 'images/drinks/dragon-zest-lemon-lime.svg' },
    { id: 'tea',     name: 'Frost Dragon Iced Tea',   desc: 'Chilled tea from the frozen peaks.',       price: 249, image: 'images/drinks/frost-dragon-iced-tea.svg' },
    { id: 'water',   name: 'Dragon Tears Spring Water', desc: 'Pure, cold and slightly sorrowful.',     price: 199, image: 'images/drinks/dragon-tears-water.svg' }
  ],
  coupons: [
    { id: 'c-knight10',  name: "Knight's 10% Off",        code: 'KNIGHT10',  type: 'percent',   value: 10 },
    { id: 'c-hoard20',   name: "Dragon's Hoard 20% Off",  code: 'HOARD20',   type: 'percent',   value: 20 },
    { id: 'c-slayer3',   name: 'Dragon Slayer $3 Off',    code: 'SLAYER3',   type: 'amount',    value: 300 },
    { id: 'c-freeside',  name: 'Free Side',               code: 'FREESIDE',  type: 'freeSide',  value: 0 },
    { id: 'c-freedrink', name: 'Free Drink',              code: 'FREEDRINK', type: 'freeDrink', value: 0 }
  ]
};

function cloneMenu(m) { return JSON.parse(JSON.stringify(m)); }

function isItemAvailable(item) { return item.available !== false; }

// A menu is usable if every list is well-formed and the customer can still
// choose at least one size and one crust.
function validateMenu(m) {
  var problems = [];
  function list(name, extra) {
    var arr = m && m[name];
    if (!Array.isArray(arr)) { problems.push('Missing ' + name + ' list.'); return []; }
    var seen = {};
    arr.forEach(function (it, i) {
      if (!it || typeof it.id !== 'string' || !it.id) problems.push(name + ' item ' + (i + 1) + ' has no id.');
      else if (seen[it.id]) problems.push('Duplicate id in ' + name + ': ' + it.id);
      else seen[it.id] = true;
      if (!it || typeof it.name !== 'string' || !it.name.trim()) problems.push('Every ' + name + ' item needs a name (item ' + (i + 1) + ').');
      if (extra) extra(it, i);
    });
    return arr;
  }
  function money(it, field, label) {
    if (!it || typeof it[field] !== 'number' || !isFinite(it[field]) || it[field] < 0)
      problems.push(label + ' needs a price of 0 or more.');
  }
  var sizes = list('sizes', function (it) {
    money(it, 'price', 'Size "' + (it && it.name) + '"');
    if (!it || typeof it.toppingMult !== 'number' || !isFinite(it.toppingMult) || it.toppingMult < 0)
      problems.push('Size "' + (it && it.name) + '" needs a topping multiplier of 0 or more.');
  });
  var crusts = list('crusts', function (it) { money(it, 'price', 'Crust "' + (it && it.name) + '"'); });
  list('toppings');
  ['sides', 'drinks'].forEach(function (k) {
    list(k, function (it) { money(it, 'price', (k === 'sides' ? 'Side "' : 'Drink "') + (it && it.name) + '"'); });
  });
  var codesSeen = {};
  list('coupons', function (it) {
    var label = 'Coupon "' + (it && it.name) + '"';
    var code = it && typeof it.code === 'string' ? it.code.trim().toUpperCase() : '';
    if (!code) problems.push(label + ' needs a code.');
    else if (codesSeen[code]) problems.push('Duplicate coupon code: ' + code);
    else codesSeen[code] = true;
    var types = ['percent', 'amount', 'freeSide', 'freeDrink'];
    if (!it || types.indexOf(it.type) < 0) problems.push(label + ' needs a valid type.');
    else if (it.type === 'percent' && !(it.value >= 1 && it.value <= 100)) problems.push(label + ' needs a percent from 1 to 100.');
    else if (it.type === 'amount' && !(it.value > 0)) problems.push(label + ' needs a dollar amount above 0.');
  });
  if (!m || typeof m.toppingBase !== 'number' || !isFinite(m.toppingBase) || m.toppingBase < 0)
    problems.push('Topping base price must be 0 or more.');
  if (!sizes.some(isItemAvailable)) problems.push('At least one size must be available.');
  if (!crusts.some(isItemAvailable)) problems.push('At least one crust must be available.');
  return problems;
}

// Menus saved before sides/drinks existed get the default sides and drinks.
function normalizeMenu(m) {
  if (m && typeof m === 'object') {
    ['sides', 'drinks', 'coupons'].forEach(function (k) {
      if (!Array.isArray(m[k])) m[k] = cloneMenu(DEFAULT_MENU[k]);
    });
  }
  return m;
}

function loadMenu() {
  try {
    var stored = window.localStorage && localStorage.getItem(MENU_STORAGE_KEY);
    if (stored) {
      var m = normalizeMenu(JSON.parse(stored));
      if (validateMenu(m).length === 0) return m;
    }
  } catch (e) { /* unavailable or corrupt: fall through */ }
  if (typeof MENU_OVERRIDE !== 'undefined' && MENU_OVERRIDE) {
    var o = normalizeMenu(cloneMenu(MENU_OVERRIDE));
    if (validateMenu(o).length === 0) return o;
  }
  return cloneMenu(DEFAULT_MENU);
}

function saveMenu(m) { localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(m)); }
function clearSavedMenu() { localStorage.removeItem(MENU_STORAGE_KEY); }

// ---- Coupons -------------------------------------------------------------
// Coupon rules (minimum purchase, one per order) live in js/logic.js. Each coupon
// can be used once; "used" is remembered in this browser only (no server).
var USED_COUPONS_KEY = 'dckp_used_coupons_v1';
var usedCouponsFallback = [];   // used if localStorage is unavailable

function getUsedCoupons() {
  var stored = [];
  try { stored = JSON.parse(localStorage.getItem(USED_COUPONS_KEY)) || []; } catch (e) { /* ignore */ }
  return stored.concat(usedCouponsFallback.filter(function (id) { return stored.indexOf(id) < 0; }));
}
function setUsedCoupons(list) {
  usedCouponsFallback = list.slice();
  try { localStorage.setItem(USED_COUPONS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function markCouponUsed(id) {
  var used = getUsedCoupons();
  if (used.indexOf(id) < 0) { used.push(id); setUsedCoupons(used); }
}
function unmarkCouponUsed(id) {
  setUsedCoupons(getUsedCoupons().filter(function (x) { return x !== id; }));
}
function clearUsedCoupons() {
  usedCouponsFallback = [];
  try { localStorage.removeItem(USED_COUPONS_KEY); } catch (e) { /* ignore */ }
}
