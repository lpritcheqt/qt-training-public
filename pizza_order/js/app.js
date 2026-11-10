(function () {
  'use strict';

  var L = OrderLogic;                 // business rules live in js/logic.js (the server runs the same file)
  var MENU = null;                    // loaded from the database through the API (see boot())

  // ---- State -------------------------------------------------------------
  function firstAvailable(list, preferred) {
    var avail = list.filter(isItemAvailable);
    var pick = avail.filter(function (x) { return x.id === preferred; })[0] || avail[0];
    return pick.id;
  }
  function newBuilder() {
    return { size: firstAvailable(MENU.sizes, 'M'), crust: firstAvailable(MENU.crusts, 'hand'), toppings: [] };
  }
  var builder = null;                 // set in boot() once the menu has loaded
  var placing = false;                // an order is being sent to the server
  var cart = [];                      // see js/logic.js for line shapes
  var order = { couponId: null };     // one coupon per order
  var couponMsg = null;               // { text, error }
  var nextId = 1;
  var editingId = null;

  // ---- Helpers -----------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function money(cents) { return L.money(cents); }
  function newId() { return nextId++; }
  // "Already used" is decided by the server (database). The browser never sees redemptions.
  function usedIds() { return []; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function describe(p) {
    var parts = [L.byId(MENU.sizes, p.size).name, L.byId(MENU.crusts, p.crust).name];
    var names = MENU.toppings.filter(function (t) { return p.toppings.indexOf(t.id) > -1; })
                             .map(function (t) { return t.name; });
    parts.push(names.length ? names.join(', ') : 'Cheese only');
    return parts.join(' · ');
  }
  function showBuilderMsg(text) { $('builder-msg').textContent = text || ''; }

  // ---- Builder rendering -------------------------------------------------
  function card(type, name, item, checked, emoji, label, price) {
    var soldOut = !isItemAvailable(item);
    var wrap = el('label', 'card');
    var input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = item.id;
    input.checked = checked && !soldOut;
    input.disabled = soldOut;
    if (soldOut) input.setAttribute('data-soldout', '1');
    var body = el('span', 'card-body');
    if (emoji) body.appendChild(el('span', 'emoji', emoji));
    var nameEl = el('span', 'name');
    if (soldOut) {
      nameEl.appendChild(el('span', 'item-name sold-out', label));
      nameEl.appendChild(el('span', 'sold-out-note', ' (sold out)'));
    } else {
      nameEl.textContent = label;
    }
    body.appendChild(nameEl);
    body.appendChild(el('span', 'price', soldOut ? '' : price));
    wrap.appendChild(input);
    wrap.appendChild(body);
    return wrap;
  }

  function renderOptions() {
    var sizes = $('sizes'), crusts = $('crusts'), tops = $('toppings');
    sizes.textContent = crusts.textContent = tops.textContent = '';
    MENU.sizes.forEach(function (s) {
      sizes.appendChild(card('radio', 'size', s, builder.size === s.id, null,
        s.name + ' ' + s.detail, money(s.price)));
    });
    MENU.crusts.forEach(function (c) {
      crusts.appendChild(card('radio', 'crust', c, builder.crust === c.id, null,
        c.name, c.price ? '+' + money(c.price) : 'Included'));
    });
    var tp = L.toppingPrice(MENU, builder.size);
    MENU.toppings.forEach(function (t) {
      tops.appendChild(card('checkbox', 'topping', t, builder.toppings.indexOf(t.id) > -1,
        t.emoji, t.name, '+' + money(tp)));
    });
    updateBuilderPrices();
  }

  function onBuilderChange(e) {
    var t = e.target;
    if (t.name === 'size') builder.size = t.value;
    else if (t.name === 'crust') builder.crust = t.value;
    else if (t.name === 'topping') {
      var r = L.toggleTopping(builder.toppings, t.value, t.checked);
      if (!r.ok) { t.checked = false; showBuilderMsg(r.message); return; }
      builder.toppings = r.toppings;
    } else return;
    showBuilderMsg('');
    updateBuilderPrices();
  }

  // Refresh prices and lock the unchecked toppings once the pizza is full.
  function updateBuilderPrices() {
    var tp = L.toppingPrice(MENU, builder.size);
    var full = builder.toppings.length >= L.MAX_TOPPINGS;
    var inputs = $('toppings').querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var soldOut = inputs[i].getAttribute('data-soldout') === '1';
      inputs[i].disabled = soldOut || (full && !inputs[i].checked);
      var price = inputs[i].parentNode.querySelector('.price');
      if (price && !soldOut) price.textContent = '+' + money(tp);
    }
    $('topping-hint').textContent = 'Cheese and sauce included • ' + money(tp) + ' each • ' +
      builder.toppings.length + ' of ' + L.MAX_TOPPINGS + ' max';
    $('builder-price').textContent = money(L.pizzaPrice(MENU, builder));
  }

  function resetBuilder() {
    builder = newBuilder();
    editingId = null;
    $('add-btn').textContent = 'Add to Order';
    $('cancel-edit-btn').hidden = true;
    showBuilderMsg('');
    renderOptions();
    refreshLimits();
  }

  // ---- Cart --------------------------------------------------------------
  function addToCart() {
    var p = { size: builder.size, crust: builder.crust, toppings: builder.toppings.slice() };
    var r = editingId !== null
      ? L.updatePizzaLine(MENU, cart, editingId, p)
      : L.addPizzaLine(MENU, cart, p, newId);
    if (!r.ok) { showBuilderMsg(r.message); return; }
    resetBuilder();
    renderCart();
  }

  // ---- Sides and drinks --------------------------------------------------
  function productCard(kind, item) {
    var soldOut = !isItemAvailable(item);
    var wrap = el('div', 'product' + (soldOut ? ' is-sold-out' : ''));
    var img = document.createElement('img');
    img.className = 'product-img';
    img.alt = '';
    var fallback = 'images/' + L.EXTRA_LISTS[kind] + '/default.svg';
    img.onerror = function () { img.onerror = null; img.src = fallback; };
    img.src = item.image || fallback;
    wrap.appendChild(img);
    var nameEl = el('div', 'name');
    if (soldOut) {
      nameEl.appendChild(el('span', 'item-name sold-out', item.name));
      nameEl.appendChild(el('span', 'sold-out-note', ' (sold out)'));
    } else {
      nameEl.textContent = item.name;
    }
    wrap.appendChild(nameEl);
    if (item.desc) wrap.appendChild(el('div', 'product-desc', item.desc));
    if (!soldOut) wrap.appendChild(el('div', 'price', money(item.price)));
    var b = el('button', 'btn secondary add-extra', 'Add');
    b.type = 'button';
    b.disabled = soldOut;
    if (soldOut) b.setAttribute('data-soldout', '1');
    b.setAttribute('data-kind', kind);
    b.setAttribute('data-item', item.id);
    b.setAttribute('aria-label', 'Add ' + item.name + ' to order');
    wrap.appendChild(b);
    return wrap;
  }

  function renderExtras() {
    [['side', 'sides'], ['drink', 'drinks']].forEach(function (k) {
      var box = $(k[1]);
      box.textContent = '';
      MENU[k[1]].forEach(function (item) { box.appendChild(productCard(k[0], item)); });
      box.parentNode.hidden = MENU[k[1]].length === 0;
    });
  }

  function onExtraClick(e) {
    var b = e.target.closest('button.add-extra');
    if (!b || b.disabled) return;
    var r = L.addExtraLine(MENU, cart, b.getAttribute('data-kind'), b.getAttribute('data-item'), newId);
    showBuilderMsg(r.ok ? '' : r.message);
    renderCart();
  }

  // Disable every "add" control once the order holds the maximum number of items.
  function refreshLimits() {
    var full = L.itemCount(cart) >= L.MAX_ITEMS;
    var adds = document.querySelectorAll('button.add-extra');
    for (var i = 0; i < adds.length; i++) {
      adds[i].disabled = adds[i].getAttribute('data-soldout') === '1' || full;
    }
    // Editing a pizza doesn't add an item, so it stays allowed.
    $('add-btn').disabled = full && editingId === null;
    $('order-msg').textContent = full ? 'Order limit reached: ' + L.MAX_ITEMS + ' items maximum.' : '';
  }

  function lineItem(l, n, readOnly) {
    var li = el('li');
    var isPizza = l.kind === 'pizza';
    var title = isPizza ? 'Pizza ' + n : L.extraItem(MENU, l).name;
    li.appendChild(el('div', 'line-title', title + (l.qty > 1 ? ' × ' + l.qty : '')));
    li.appendChild(el('div', 'line-desc', isPizza ? describe(l) : (l.kind === 'side' ? 'Side' : 'Drink')));
    var foot = el('div', 'line-foot');
    if (!readOnly) {
      var step = el('span', 'stepper');
      step.appendChild(actionBtn('−', 'dec', l.id, 'Decrease quantity of ' + title));
      step.appendChild(el('span', 'qty', String(l.qty)));
      step.appendChild(actionBtn('+', 'inc', l.id, 'Increase quantity of ' + title));
      foot.appendChild(step);
      if (isPizza) {
        foot.appendChild(actionBtn('Duplicate', 'dup', l.id, 'Duplicate ' + title));
        foot.appendChild(actionBtn('Edit', 'edit', l.id, 'Edit ' + title));
      }
      foot.appendChild(actionBtn('Remove', 'rm', l.id, 'Remove ' + title));
    }
    foot.appendChild(el('span', 'line-price', money(L.linePrice(MENU, l) * l.qty)));
    li.appendChild(foot);
    return li;
  }

  function actionBtn(text, act, id, label) {
    var b = el('button', 'icon-btn', text);
    b.type = 'button';
    b.setAttribute('data-act', act);
    b.setAttribute('data-id', id);
    b.setAttribute('aria-label', label);
    return b;
  }

  // ---- Coupons -----------------------------------------------------------
  function applyCoupon() {
    var input = $('coupon-input');
    var code = input.value.trim();
    // Already have one, or nothing typed: the shared rules produce the message.
    if (order.couponId || !code) {
      var quick = L.tryApplyCoupon(MENU, cart, order, input.value, usedIds());
      couponMsg = { text: quick.message, error: !quick.ok };
      renderCart();
      return;
    }
    $('coupon-apply-btn').disabled = true;
    Api.lookupCoupon(code).then(function (r) {
      if (!r.ok) {
        couponMsg = { text: r.error ? r.error.message : 'Could not check that coupon.', error: true };
        return;
      }
      // The server only reveals a coupon that exists, is active and unused.
      MENU.coupons = [r.data.coupon];
      var res = L.tryApplyCoupon(MENU, cart, order, code, usedIds());
      couponMsg = { text: res.message, error: !res.ok };
      if (res.ok) input.value = '';
      else MENU.coupons = [];
    }).catch(function () {
      couponMsg = { text: 'Could not reach the pizza server. Is it running?', error: true };
    }).then(function () {
      $('coupon-apply-btn').disabled = false;
      renderCart();
    });
  }

  function removeCoupon() {
    L.removeCoupon(order);
    MENU.coupons = [];
    couponMsg = null;
    renderCart();
  }

  function renderTotals() {
    var sub = L.subtotal(MENU, cart);
    var disc = L.discount(MENU, cart, order, usedIds());
    var tot = L.total(MENU, cart, order, usedIds());
    var c = order.couponId && L.byId(MENU.coupons, order.couponId);
    $('subtotal').textContent = money(sub);
    $('discount-row').hidden = !c;
    if (c) {
      $('discount-label').textContent = 'Coupon (' + c.code + ')';
      $('discount').textContent = '-' + money(disc);
    }
    $('total').textContent = money(tot);
    $('mini-total').textContent = money(tot);
    $('coupon-entry').hidden = !!c;
    $('coupon-applied').hidden = !c;
    if (c) $('coupon-applied-text').textContent = c.name + ' (' + c.code + ')';
    var msg = $('coupon-msg');
    msg.textContent = couponMsg ? couponMsg.text : '';
    msg.className = 'coupon-msg' + (couponMsg && couponMsg.error ? ' error' : '');
  }

  function renderCart() {
    var note = L.revalidateCoupon(MENU, cart, order, usedIds());
    if (note) couponMsg = { text: note, error: true };
    var ul = $('cart');
    ul.textContent = '';
    var pn = 0;
    cart.forEach(function (l) { ul.appendChild(lineItem(l, l.kind === 'pizza' ? ++pn : 0, false)); });
    var count = L.itemCount(cart);
    var label = count + (count === 1 ? ' item' : ' items');
    $('empty-msg').hidden = cart.length > 0;
    $('order-count').textContent = count ? '(' + label + ')' : '';
    renderTotals();
    $('mini-count').textContent = label;
    $('place-btn').disabled = cart.length === 0 || placing;
    $('clear-btn').disabled = cart.length === 0;
    refreshLimits();
  }

  function onCartClick(e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = Number(b.getAttribute('data-id'));
    var l = L.findLine(cart, id);
    if (!l) return;
    var r = { ok: true };
    switch (b.getAttribute('data-act')) {
      case 'inc': r = L.changeQty(cart, id, 1); break;
      case 'dec':
        L.changeQty(cart, id, -1);
        if (editingId === id && !L.findLine(cart, id)) resetBuilder();
        break;
      case 'rm':
        L.removeLine(cart, id);
        if (editingId === id) resetBuilder();
        break;
      case 'dup': r = L.duplicateLine(cart, id, newId); break;
      case 'edit':
        builder = { size: l.size, crust: l.crust, toppings: l.toppings.slice() };
        editingId = id;
        $('add-btn').textContent = 'Update Pizza';
        $('cancel-edit-btn').hidden = false;
        showBuilderMsg('');
        renderOptions();
        $('builder-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
    if (!r.ok) showBuilderMsg(r.message);
    renderCart();
  }

  function clearOrder() {
    cart = [];
    order = { couponId: null };
    MENU.coupons = [];
    couponMsg = null;
    $('place-msg').textContent = '';
    resetBuilder();
    renderCart();
  }

  // ---- Placing the order -------------------------------------------------
  // Only the items and the coupon code are sent. The server prices everything
  // itself and enforces every rule again.
  function orderPayload() {
    var c = order.couponId && L.byId(MENU.coupons, order.couponId);
    return {
      cart: cart.map(function (l) {
        return l.kind === 'pizza'
          ? { kind: 'pizza', size: l.size, crust: l.crust, toppings: l.toppings.slice(), qty: l.qty }
          : { kind: l.kind, itemId: l.itemId, qty: l.qty };
      }),
      couponCode: c ? c.code : undefined
    };
  }

  function placeOrder() {
    if (!cart.length || placing) return;
    placing = true;
    $('place-btn').disabled = true;
    $('place-msg').textContent = 'Placing your order...';
    Api.placeOrder(orderPayload()).then(function (r) {
      if (r.ok) { $('place-msg').textContent = ''; showReceipt(r.data); return; }
      handleOrderError(r.error || { code: 'server_error', message: 'The order could not be placed.' });
    }).catch(function () {
      $('place-msg').textContent = 'Could not reach the pizza server. Check that it is running, then try again.';
    }).then(function () {
      placing = false;
      renderCart();
    });
  }

  function handleOrderError(err) {
    var msg = err.message;
    if (err.code === 'coupon_used' || err.code === 'coupon_invalid' || err.code === 'coupon_limit') {
      L.removeCoupon(order);
      MENU.coupons = [];
      couponMsg = { text: err.message, error: true };
      msg = err.message + ' The coupon was removed. Check the total and place the order again.';
    } else if (err.code === 'sold_out') {
      msg = err.message + ' The menu was refreshed and unavailable items were removed from your order.';
      syncMenu();
    }
    $('place-msg').textContent = msg;
  }

  function lineStillOrderable(l) {
    if (l.kind === 'pizza') {
      return L.isAvailable(L.byId(MENU.sizes, l.size)) && L.isAvailable(L.byId(MENU.crusts, l.crust)) &&
        l.toppings.every(function (t) { return L.isAvailable(L.byId(MENU.toppings, t)); });
    }
    return L.isAvailable(L.extraItem(MENU, l));
  }

  // Reload the menu (an admin may have changed it) and drop lines that can no longer be ordered.
  function syncMenu() {
    return Api.getMenu().then(function (r) {
      if (!r.ok) return;
      var coupons = MENU.coupons;
      MENU = r.data;
      MENU.coupons = coupons;
      cart = cart.filter(lineStillOrderable);
      resetBuilder();
      renderExtras();
      renderCart();
    });
  }

  function showReceipt(data) {
    $('confirm-title').textContent = 'Thanks for your order! Order #' + data.orderId;
    var recap = $('recap');
    recap.textContent = '';
    data.lines.forEach(function (l) {
      var li = el('li');
      li.appendChild(el('div', 'line-title', (l.kind === 'pizza' ? 'Pizza' : l.description) + (l.qty > 1 ? ' \u00D7 ' + l.qty : '')));
      li.appendChild(el('div', 'line-desc', l.kind === 'pizza' ? l.description : (l.kind === 'side' ? 'Side' : 'Drink')));
      var foot = el('div', 'line-foot');
      foot.appendChild(el('span', 'line-price', money(l.lineTotal)));
      li.appendChild(foot);
      recap.appendChild(li);
    });
    $('recap-subtotal').textContent = money(data.subtotal);
    $('recap-discount-row').hidden = !data.coupon;
    if (data.coupon) {
      $('recap-discount-label').textContent = 'Coupon (' + data.coupon.code + ')';
      $('recap-discount').textContent = '-' + money(data.discount);
    }
    $('recap-total').textContent = money(data.total);
    var dlg = $('confirm');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function closeConfirm() {
    var dlg = $('confirm');
    if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); clearOrder(); }
  }

  // ---- Init --------------------------------------------------------------
  function init() {
    renderOptions();
    renderExtras();
    renderCart();
    $('sides').addEventListener('click', onExtraClick);
    $('drinks').addEventListener('click', onExtraClick);
    $('sizes').addEventListener('change', onBuilderChange);
    $('crusts').addEventListener('change', onBuilderChange);
    $('toppings').addEventListener('change', onBuilderChange);
    $('add-btn').addEventListener('click', addToCart);
    $('cancel-edit-btn').addEventListener('click', resetBuilder);
    $('cart').addEventListener('click', onCartClick);
    $('clear-btn').addEventListener('click', clearOrder);
    $('place-btn').addEventListener('click', placeOrder);
    $('coupon-apply-btn').addEventListener('click', applyCoupon);
    $('coupon-remove-btn').addEventListener('click', removeCoupon);
    $('coupon-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
    });
    // The order is already saved when the receipt shows, so closing it starts a fresh order.
    $('confirm').addEventListener('close', clearOrder);
    $('new-order-btn').addEventListener('click', closeConfirm);
  }

  function boot() {
    Api.getMenu().then(function (r) {
      if (!r.ok) throw new Error('menu');
      MENU = r.data;
      MENU.coupons = [];                // coupons are never sent to the browser; see applyCoupon()
      builder = newBuilder();
      $('load-error').hidden = true;
      init();
    }).catch(function () {
      $('load-error').hidden = false;
    });
  }

  boot();
})();
