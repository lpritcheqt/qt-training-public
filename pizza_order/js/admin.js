(function () {
  'use strict';

  var draft = loadMenu();   // working copy being edited
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
    if (getUsedCoupons().indexOf(item.id) > -1) {
      td.appendChild(el('span', null, 'Used '));
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
    if (unuse) { unmarkCouponUsed(unuse.getAttribute('data-unuse')); render(); return; }
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
      draft[l].forEach(function (it) {
        if (typeof it.name === 'string') it.name = it.name.trim();
        if (typeof it.code === 'string') it.code = it.code.trim().toUpperCase();
      });
    });
  }

  function save() {
    clean();
    if (!check()) { setStatus('Not saved.', true); return; }
    try {
      saveMenu(draft);
      dirty = false;
      setStatus('Saved in this browser. Reload the order page to see the change.');
      render();
    } catch (err) {
      setStatus('Could not save in this browser (' + err.name + '). Use Download menu-data.js instead.', true);
    }
  }

  function download() {
    clean();
    if (!check()) { setStatus('Fix the problems before downloading.', true); return; }
    var text = '/* Exported from admin.html on ' + new Date().toLocaleString() + '.\n' +
               ' * Replace js/menu-data.js with this file to publish the menu. */\n' +
               'var MENU_OVERRIDE = ' + JSON.stringify(draft, null, 2) + ';\n';
    var blob = new Blob([text], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'menu-data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('Downloaded menu-data.js. Put it in the js folder, replacing the existing file.');
  }

  function revert() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    draft = loadMenu();
    dirty = false;
    $('problems').hidden = true;
    setStatus('Reloaded the last saved menu.');
    render();
  }

  function reset() {
    if (!window.confirm('Reset the menu to the built-in default? This removes any menu saved in this browser.')) return;
    try { clearSavedMenu(); } catch (err) { /* ignore */ }
    draft = cloneMenu(DEFAULT_MENU);
    dirty = false;
    $('problems').hidden = true;
    setStatus('Reset to the default menu (js/menu.js).');
    render();
  }

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('change', onChange);
  document.addEventListener('click', onClick);
  $('save-btn').addEventListener('click', save);
  $('download-btn').addEventListener('click', download);
  $('revert-btn').addEventListener('click', revert);
  $('reset-used-btn').addEventListener('click', function () {
    if (window.confirm('Mark every coupon as unused in this browser?')) { clearUsedCoupons(); render(); setStatus('All coupons marked unused in this browser.'); }
  });
  $('reset-btn').addEventListener('click', reset);

  render();
})();
