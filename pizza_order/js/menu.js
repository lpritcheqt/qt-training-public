/* Shared menu helpers, used by the browser pages and by the Node server
 * (server/menu.js requires this file). The menu itself now lives in the SQLite
 * database (see server/); the browser gets it from the API (js/api.js).
 *
 * Prices are in cents. An item is available unless it has `available: false`.
 */
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cloneMenu: cloneMenu, isItemAvailable: isItemAvailable, validateMenu: validateMenu };
}
