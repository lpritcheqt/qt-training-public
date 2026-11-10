(function () {
  'use strict';

  var draft = null;   // working copy being edited (loaded from the server after login)
  var used = {};      // couponId -> { orderId, redeemedAt }, from the database
  var dirty = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function cents(dollars) { return Math.round(parseFloat(dollars) * 100); }
  function dollars(c) { return (c / 100).toFixed(2); }
  function newId() { return 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function setStatus(msg, isError) {
    var s = $('status');
    s.textContent = msg || '';
    s.className = 'status' + (isError ? ' error' : '');
  }
  function markDirty() { dirty = true; setStatus('Unsaved changes.'); }

  // ---- Row building ------------------------------------------------------
  function input(list, idx, field, type, value, label, extra) {
    var i = document.createElement('input');
    i.type = type;
    i.value = value;
    i.setAttribute('data-list', list);
    i.setAttribute('data-idx', idx);
    i.setAttribute('data-field', field);
    i.setAttribute('aria-label', label);
    if (type === 'number') { i.min = '0'; i.step = extra && extra.step || '0.01'; i.inputMode = 'decimal'; }
    return i;
  }
  function cell(child, label) {
    var td = el('td');
    if (label) td.setAttribute('data-label', label);
    td.appendChild(child);
    return td;
  }

  function availabilityCell(list, idx, item) {
    var td = el('td', 'status-cell');
    td.setAttribute('data-label', 'Status');
    var wrap = el('label', 'avail');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = item.available !== false;
    cb.setAttribute('data-list', list);
    cb.setAttribute('data-idx', idx);
    cb.setAttribute('data-field', 'available');
    cb.setAttribute('aria-label', 'Available: ' + item.name);
    wrap.appendChild(cb);
    var isCoupon = list === 'coupons';
    wrap.appendChild(el('span', null, isCoupon ? ' Active' : ' Available'));
    td.appendChild(wrap);
    if (item.available === false) td.appendChild(el('span', 'sold-out-note', isCoupon ? ' (inactive)' : ' (sold out)'));
    return td;
  }

  function removeCell(list, idx, item) {
    var b = el('button', 'icon-btn', 'Remove');
    b.type = 'button';
    b.setAttribute('data-remove', list);
    b.setAttribute('data-idx', idx);
    b.setAttribute('aria-label', 'Remove ' + (item.name || 'item'));
    return cell(b);
  }

  function nameInput(list, idx, item) {
    var i = input(list, idx, 'name', 'text', item.name, 'Name', null);
    i.maxLength = 40;
    if (item.available === false) i.className = 'sold-out';
    return i;
  }

  var COUPON_TYPES = [
    ['percent', 'Percent off'], ['amount', 'Dollars off'],
    ['freeSide', 'Free side'], ['freeDrink', 'Free drink']
  ];
  function typeSelect(idx, item) {
    var sel = document.createElement('select');
    sel.setAttribute('data-list', 'coupons');
    sel.setAttribute('data-idx', idx);
    sel.setAttribute('data-field', 'type');
    sel.setAttribute('aria-label', 'Coupon type');
    COUPON_TYPES.forEach(function (t) {
      var o = el('option', null, t[1]);
      o.value = t[0];
      if (item.type === t[0]) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }
  function couponValueInput(idx, item) {
    var free = item.type === 'freeSide' || item.type === 'freeDrink';
    var v = free ? '' : (item.type === 'amount' ? dollars(item.value) : String(item.value));
    var i = input('coupons', idx, 'value', 'number', v, item.type === 'percent' ? 'Percent off' : 'Dollars off',
                  { step: item.type === 'percent' ? '1' : '0.01' });
    i.disabled = free;
    if (free) i.placeholder = 'n/a';
    return i;
  }
  function usedCell(item) {
    var td = el('td');
    td.setAttribute('data-label', 'Used');
    var u = used[item.id];
    if (u) {
      td.appendChild(el('span', null, 'Used (order #' + u.orderId + ') '));
      var b = el('button', 'icon-btn', 'Mark unused');
      b.type = 'button';
      b.setAttribute('data-unuse', item.id);
      b.setAttribute('aria-label', 'Mark ' + item.name + ' as unused');
      td.appendChild(b);
    } else {
      td.appendChild(el('span', 'fine', 'Not used'));
    }
    return td;
  }

  function render() {
    var sb = $('sizes-body'), cb = $('crusts-body'), tb = $('toppings-body');
    sb.textContent = cb.textContent = tb.textContent = '';

    draft.sizes.forEach(function (s, i) {
      var tr = el('tr');
      tr.appendChild(cell(nameInput('sizes', i, s), 'Name'));
      tr.appendChild(cell(input('sizes', i, 'detail', 'text', s.detail || '', 'Detail'), 'Detail'));
      tr.appendChild(cell(input('sizes', i, 'price', 'number', dollars(s.price), 'Base price'), 'Base price ($)'));
      tr.appendChild(cell(input('sizes', i, 'toppingMult', 'number', String(s.toppingMult), 'Topping price multiplier', { step: '0.05' }), 'Topping multiplier'));
      tr.appendChild(availabilityCell('sizes', i, s));
      tr.appendChild(removeCell('sizes', i, s));
      sb.appendChild(tr);
    });

    draft.crusts.forEach(function (c, i) {
      var tr = el('tr');
      tr.appendChild(cell(nameInput('crusts', i, c), 'Name'));
      tr.appendChild(cell(input('crusts', i, 'price', 'number', dollars(c.price), 'Extra charge'), 'Extra charge ($)'));
      tr.appendChild(availabilityCell('crusts', i, c));
      tr.appendChild(removeCell('crusts', i, c));
      cb.appendChild(tr);
    });

    ['sides', 'drinks'].forEach(function (kind) {
      var body = $(kind + '-body');
      body.textContent = '';
      draft[kind].forEach(function (it, i) {
        var tr = el('tr');
        tr.appendChild(cell(nameInput(kind, i, it), 'Name'));
        tr.appendChild(cell(input(kind, i, 'desc', 'text', it.desc || '', 'Description'), 'Description'));
        tr.appendChild(cell(input(kind, i, 'price', 'number', dollars(it.price), 'Price'), 'Price ($)'));
        tr.appendChild(cell(input(kind, i, 'image', 'text', it.image || '', 'Image file'), 'Image file'));
        tr.appendChild(availabilityCell(kind, i, it));
        tr.appendChild(removeCell(kind, i, it));
        body.appendChild(tr);
      });
    });

    var cpb = $('coupons-body');
    cpb.textContent = '';
    draft.coupons.forEach(function (c, i) {
      var tr = el('tr');
      tr.appendChild(cell(nameInput('coupons', i, c), 'Name'));
      var code = input('coupons', i, 'code', 'text', c.code || '', 'Coupon code');
      code.maxLength = 20;
      tr.appendChild(cell(code, 'Code'));
      tr.appendChild(cell(typeSelect(i, c), 'Type'));
      tr.appendChild(cell(couponValueInput(i, c), c.type === 'percent' ? 'Percent' : 'Dollars'));
      tr.appendChild(availabilityCell('coupons', i, c));
      tr.appendChild(usedCell(c));
      tr.appendChild(removeCell('coupons', i, c));
      cpb.appendChild(tr);
    });

    $('topping-base').value = dollars(draft.toppingBase);
    draft.toppings.forEach(function (t, i) {
      var tr = el('tr');
      var icon = input('toppings', i, 'emoji', 'text', t.emoji || '', 'Icon');
      icon.className = 'emoji-input';
      icon.maxLength = 8;
      tr.appendChild(cell(icon, 'Icon'));
      tr.appendChild(cell(nameInput('toppings', i, t), 'Name'));
      tr.appendChild(availabilityCell('toppings', i, t));
      tr.appendChild(removeCell('toppings', i, t));
      tb.appendChild(tr);
    });
  }

  // ---- Events ------------------------------------------------------------
  function onChange(e) {
    var t = e.target;
    if (t.id === 'topping-base') {
      var v = cents(t.value);
      draft.toppingBase = isNaN(v) ? NaN : v;
      markDirty();
      return;
    }
    var list = t.getAttribute('data-list');
    if (!list) return;
    var item = draft[list][Number(t.getAttribute('data-idx'))];
    var field = t.getAttribute('data-field');
    if (!item) return;
    if (list === 'coupons') {
      if (field === 'type') {
        item.type = t.value;
        item.value = item.type === 'percent' ? 10 : (item.type === 'amount' ? 300 : 0);
        markDirty(); render(); return;
      }
      if (field === 'value') {
        var n = parseFloat(t.value);
        item.value = isNaN(n) ? NaN : (item.type === 'amount' ? Math.round(n * 100) : n);
        markDirty(); return;
      }
      if (field === 'code') {
        item.code = t.value.trim().toUpperCase();
        markDirty(); render(); return;
      }
    }
    if (field === 'available') {
      if (t.checked) delete item.available; else item.available = false;
      markDirty();
      render();                       // refresh sold-out styling
      return;
    }
    if (field === 'price') { var c = cents(t.value); item.price = isNaN(c) ? NaN : c; }
    else if (field === 'toppingMult') { item.toppingMult = parseFloat(t.value); }
    else { item[field] = t.value; }
    markDirty();
    if (field === 'name') render();   // keep aria labels and sold-out text current
  }

  function onClick(e) {
    var unuse = e.target.closest('[data-unuse]');
    if (unuse) {
      Api.unuseCoupon(unuse.getAttribute('data-unuse')).then(function (r) {
        if (needLogin(r)) return;
        if (r.ok) { used = r.data.used; render(); setStatus('Coupon marked unused.'); }
        else setStatus(r.error.message, true);
      }).catch(unreachable);
      return;
    }
    var rm = e.target.closest('[data-remove]');
    if (rm) {
      var list = rm.getAttribute('data-remove');
      var idx = Number(rm.getAttribute('data-idx'));
      var item = draft[list][idx];
      if (item && window.confirm('Remove "' + item.name + '" from the menu?\n(To hide it temporarily, mark it unavailable instead.)')) {
        draft[list].splice(idx, 1);
        markDirty();
        render();
      }
      return;
    }
    var add = e.target.closest('[data-add]');
    if (add) {
      var kind = add.getAttribute('data-add');
      var fresh = { id: newId(), name: '' };
      if (kind === 'sizes') { fresh.detail = ''; fresh.price = 0; fresh.toppingMult = 1; }
      if (kind === 'crusts') { fresh.price = 0; }
      if (kind === 'coupons') { fresh.code = ''; fresh.type = 'percent'; fresh.value = 10; }
      if (kind === 'sides' || kind === 'drinks') { fresh.desc = ''; fresh.price = 0; fresh.image = ''; }
      if (kind === 'toppings') { fresh.emoji = '🍕'; }
      draft[kind].push(fresh);
      markDirty();
      render();
      var rows = document.querySelectorAll('#' + kind + '-body tr');
      var last = rows[rows.length - 1];
      if (last) last.querySelector('input[data-field="name"]').focus();
    }
  }

  function check() {
    var problems = validateMenu(draft);
    var box = $('problems');
    box.textContent = '';
    if (problems.length) {
      var ul = el('ul');
      problems.forEach(function (p) { ul.appendChild(el('li', null, p)); });
      box.appendChild(el('strong', null, 'Fix these before saving:'));
      box.appendChild(ul);
      box.hidden = false;
    } else {
      box.hidden = true;
    }
    return problems.length === 0;
  }

  function clean() {
    // Trim names before validation/saving.
    ['sizes', 'crusts', 'toppings', 'sides', 'drinks', 'coupons'].forEach(function (l) {
      (draft[l] || []).forEach(function (it) {
        if (typeof it.name === 'string') it.name = it.name.trim();
        if (typeof it.code === 'string') it.code = it.code.trim().toUpperCase();
      });
    });
  }

  // ---- Talking to the server ---------------------------------------------
  function unreachable() { setStatus('Could not reach the pizza server. Is it running?', true); }

  function needLogin(r) {
    if (r.status === 401) { showLogin('Your admin session ended. Please log in again.'); return true; }
    return false;
  }

  function showLogin(msg) {
    $('editor').hidden = true;
    $('login-section').hidden = false;
    $('login-msg').textContent = msg || '';
    $('pin-input').value = '';
    $('pin-input').focus();
  }

  function showEditor() {
    $('login-section').hidden = true;
    $('editor').hidden = false;
  }

  function showServerProblems(err) {
    var box = $('problems');
    box.textContent = '';
    var list = err && err.problems && err.problems.length ? err.problems : [err ? err.message : 'The server rejected the menu.'];
    var ul = el('ul');
    list.forEach(function (p) { ul.appendChild(el('li', null, p)); });
    box.appendChild(el('strong', null, 'The server did not save the menu:'));
    box.appendChild(ul);
    box.hidden = false;
  }

  function loadEditor() {
    return Api.adminMenu().then(function (r) {
      if (needLogin(r)) return;
      if (!r.ok) { setStatus('Could not load the menu: ' + r.error.message, true); return; }
      draft = r.data.menu;
      used = r.data.used;
      dirty = false;
      $('problems').hidden = true;
      setStatus('');
      showEditor();
      render();
      loadOrders();
    });
  }

  function login() {
    $('login-msg').textContent = '';
    Api.login($('pin-input').value).then(function (r) {
      if (!r.ok) { $('login-msg').textContent = r.error ? r.error.message : 'Login failed.'; return; }
      return loadEditor();
    }).catch(function () { $('login-msg').textContent = 'Could not reach the pizza server. Is it running?'; });
  }

  function logout() {
    if (dirty && !window.confirm('You have unsaved changes. Log out anyway?')) return;
    dirty = false;
    Api.logout().then(function () { showLogin('Logged out.'); }).catch(unreachable);
  }

  function save() {
    clean();
    if (!check()) { setStatus('Not saved.', true); return; }
    Api.saveMenu(draft).then(function (r) {
      if (needLogin(r)) return;
      if (!r.ok) { showServerProblems(r.error); setStatus('Not saved.', true); return; }
      draft = r.data.menu;
      used = r.data.used;
      dirty = false;
      $('problems').hidden = true;
      setStatus('Saved to the database. Reload the order page to see the change.');
      render();
    }).catch(unreachable);
  }

  function revert() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    loadEditor().then(function () { setStatus('Reloaded the saved menu.'); }).catch(unreachable);
  }

  function reset() {
    if (!window.confirm('Reset the menu and coupons to the built-in defaults? Orders are kept.')) return;
    Api.resetMenu().then(function (r) {
      if (needLogin(r)) return;
      if (!r.ok) { setStatus(r.error.message, true); return; }
      draft = r.data.menu;
      used = r.data.used;
      dirty = false;
      $('problems').hidden = true;
      setStatus('Reset to the default menu.');
      render();
    }).catch(unreachable);
  }

  function resetUsed() {
    if (!window.confirm('Mark every coupon as unused? Customers will be able to use them again.')) return;
    Api.unuseAllCoupons().then(function (r) {
      if (needLogin(r)) return;
      if (!r.ok) { setStatus(r.error.message, true); return; }
      used = r.data.used;
      render();
      setStatus('All coupons marked unused.');
    }).catch(unreachable);
  }

  function importFile(e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var m = data && data.menu ? data.menu : data;
        if (!m || !Array.isArray(m.sizes) || !Array.isArray(m.crusts)) {
          throw new Error('This does not look like a pizza menu backup.');
        }
        ['toppings', 'sides', 'drinks', 'coupons'].forEach(function (k) { if (!Array.isArray(m[k])) m[k] = []; });
        draft = m;
        dirty = true;
        render();
        setStatus('Loaded ' + f.name + '. Review it, then press Save to apply it.');
      } catch (err) {
        setStatus('Could not load that file: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsText(f);
  }

  function loadOrders() {
    Api.orders(50).then(function (r) {
      if (!r.ok) return;
      var body = $('orders-body');
      body.textContent = '';
      $('orders-empty').hidden = r.data.orders.length > 0;
      r.data.orders.forEach(function (o) {
        var tr = el('tr');
        var items = o.lines.map(function (l) {
          return l.qty + ' \u00D7 ' + (l.kind === 'pizza' ? 'Pizza (' + l.description + ')' : l.description);
        }).join('; ');
        tr.appendChild(cell(el('span', null, '#' + o.id), 'Order'));
        tr.appendChild(cell(el('span', null, new Date(o.createdAt).toLocaleString()), 'Placed'));
        tr.appendChild(cell(el('span', null, items), 'Items'));
        tr.appendChild(cell(el('span', null, '$' + dollars(o.subtotal)), 'Subtotal'));
        tr.appendChild(cell(el('span', null, o.discount ? '-$' + dollars(o.discount) : '\u2014'), 'Discount'));
        tr.appendChild(cell(el('span', null, '$' + dollars(o.total)), 'Total'));
        tr.appendChild(cell(el('span', null, o.couponCode || '\u2014'), 'Coupon'));
        body.appendChild(tr);
      });
    }).catch(function () { /* the orders list is optional */ });
  }

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('change', function (e) { if (draft) onChange(e); });
  document.addEventListener('click', function (e) { if (draft) onClick(e); });
  $('save-btn').addEventListener('click', save);
  $('revert-btn').addEventListener('click', revert);
  $('reset-btn').addEventListener('click', reset);
  $('reset-used-btn').addEventListener('click', resetUsed);
  $('login-btn').addEventListener('click', login);
  $('pin-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); login(); } });
  $('logout-btn').addEventListener('click', logout);
  $('import-file').addEventListener('change', importFile);
  $('refresh-orders-btn').addEventListener('click', loadOrders);

  // Start: show the editor if already logged in, otherwise the login form.
  Api.session().then(function (r) {
    if (r.ok && r.data.loggedIn) return loadEditor();
    showLogin('');
  }).catch(function () {
    showLogin('Could not reach the pizza server. Is it running?');
  });
})();
