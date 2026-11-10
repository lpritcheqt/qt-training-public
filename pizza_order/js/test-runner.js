(function () {
  'use strict';

  var MENU = loadMenu();                       // live menu, exposed to custom rule code
  var STORE = 'dckp_custom_rules_v1';
  var custom = loadCustom();
  var results = {};                            // rule id -> { status, tests[] }
  var editingId = null;
  var hasRun = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- Custom rule storage -----------------------------------------------
  function loadCustom() {
    try {
      var s = localStorage.getItem(STORE);
      if (s) { var list = JSON.parse(s); if (Array.isArray(list)) return list; }
    } catch (e) { /* fall through */ }
    return (typeof CUSTOM_RULES !== 'undefined' && Array.isArray(CUSTOM_RULES)) ? CUSTOM_RULES.slice() : [];
  }
  function saveCustom() {
    try { localStorage.setItem(STORE, JSON.stringify(custom)); return true; }
    catch (e) { return false; }
  }

  // ---- Running -----------------------------------------------------------
  function runBuiltin(rule) {
    if (rule.manual || !rule.tests.length) return { status: 'manual', tests: [] };
    var tests = rule.tests.map(function (t) {
      try { t.run(); return { name: t.name, ok: true, message: '' }; }
      catch (e) { return { name: t.name, ok: false, message: e && e.message ? e.message : String(e) }; }
    });
    return { status: tests.every(function (t) { return t.ok; }) ? 'pass' : 'fail', tests: tests };
  }

  function runCustom(rule) {
    var code = (rule.code || '').trim();
    if (!code) return { status: 'manual', tests: [] };
    var fn;
    try {
      fn = new Function('assert', 'assertEqual', 'OrderLogic', 'MENU', 'fixtureMenu', 'makeIds', 'cartOf', code);
    } catch (e) {
      return { status: 'error', tests: [{ name: 'Test code', ok: false, message: 'Syntax error: ' + e.message }] };
    }
    try {
      var ret = fn(assert, assertEqual, OrderLogic, MENU, fixtureMenu, makeIds, cartOf);
      if (ret === false) return { status: 'fail', tests: [{ name: 'Test code', ok: false, message: 'The check returned false.' }] };
      return { status: 'pass', tests: [{ name: 'Test code', ok: true, message: '' }] };
    } catch (e) {
      return { status: 'fail', tests: [{ name: 'Test code', ok: false, message: e && e.message ? e.message : String(e) }] };
    }
  }

  function runAll() {
    results = {};
    BUILTIN_RULES.forEach(function (r) { results[r.id] = runBuiltin(r); });
    custom.forEach(function (r) { results[r.id] = runCustom(r); });
    hasRun = true;
    render();
  }

  // ---- Rendering ---------------------------------------------------------
  var LABELS = { pass: 'PASS', fail: 'FAIL', error: 'ERROR', manual: 'MANUAL', none: 'NOT RUN' };

  function ruleCard(rule, isCustom) {
    var res = results[rule.id];
    var status = res ? res.status : 'none';
    var d = el('details', 'rule ' + status);
    if (status === 'fail' || status === 'error') d.open = true;
    var sum = el('summary');
    sum.appendChild(el('span', 'badge ' + status, LABELS[status]));
    sum.appendChild(el('span', 'rule-id', isCustom ? 'Custom' : rule.id));
    sum.appendChild(el('span', 'rule-name', rule.name));
    d.appendChild(sum);
    d.appendChild(el('p', 'rule-desc', rule.description || ''));

    if (res && res.tests.length) {
      var ul = el('ul', 'tests');
      res.tests.forEach(function (t) {
        var li = el('li', t.ok ? 'ok' : 'bad');
        li.appendChild(el('span', 'mark', t.ok ? '✓' : '✗'));
        li.appendChild(el('span', null, t.name));
        if (!t.ok) li.appendChild(el('div', 'test-msg', t.message));
        ul.appendChild(li);
      });
      d.appendChild(ul);
    } else if (status === 'manual') {
      d.appendChild(el('p', 'fine', 'No automatic check. Review this rule by hand when code changes.'));
    }

    if (isCustom) {
      var bar = el('div', 'rule-actions');
      var e = el('button', 'icon-btn', 'Edit'); e.type = 'button'; e.setAttribute('data-edit', rule.id);
      var x = el('button', 'icon-btn', 'Delete'); x.type = 'button'; x.setAttribute('data-delete', rule.id);
      bar.appendChild(e); bar.appendChild(x);
      d.appendChild(bar);
    }
    return d;
  }

  function render() {
    var b = $('builtin-results'), c = $('custom-results');
    b.textContent = c.textContent = '';
    BUILTIN_RULES.forEach(function (r) { b.appendChild(ruleCard(r, false)); });
    if (!custom.length) c.appendChild(el('p', 'fine', 'No custom rules yet. Add one below.'));
    custom.forEach(function (r) { c.appendChild(ruleCard(r, true)); });
    renderSummary();
  }

  function renderSummary() {
    var all = BUILTIN_RULES.concat(custom);
    var counts = { pass: 0, fail: 0, error: 0, manual: 0 };
    var tPass = 0, tFail = 0;
    all.forEach(function (r) {
      var res = results[r.id];
      if (!res) return;
      counts[res.status]++;
      res.tests.forEach(function (t) { if (t.ok) tPass++; else tFail++; });
    });
    var box = $('summary');
    var ms = $('machine-summary');
    if (!hasRun) {
      box.className = 'summary';
      box.textContent = 'Tests have not been run yet.';
    } else {
      var bad = counts.fail + counts.error;
      box.className = 'summary ' + (bad ? 'bad' : 'good');
      box.textContent = (bad ? 'FAILED: ' : 'ALL PASSED: ') + counts.pass + ' of ' + all.length + ' rules passed' +
        (bad ? ', ' + bad + ' failed' : '') + (counts.manual ? ', ' + counts.manual + ' manual' : '') +
        ' (' + tPass + ' tests passed' + (tFail ? ', ' + tFail + ' failed' : '') + ').';
      document.title = (bad ? 'FAILED ' : 'PASSED ') + counts.pass + '/' + all.length + ' - Rule Tests';
    }
    ms.setAttribute('data-rules', String(all.length));
    ms.setAttribute('data-passed', String(counts.pass));
    ms.setAttribute('data-failed', String(counts.fail + counts.error));
    ms.setAttribute('data-manual', String(counts.manual));
    ms.setAttribute('data-tests-passed', String(tPass));
    ms.setAttribute('data-tests-failed', String(tFail));
    ms.setAttribute('data-ran', hasRun ? 'yes' : 'no');
    ms.id = 'machine-summary';
  }

  // ---- Rule form ---------------------------------------------------------
  function formStatus(msg, isError) {
    var s = $('form-status');
    s.textContent = msg || '';
    s.className = 'status' + (isError ? ' error' : '');
  }

  function readForm() {
    return {
      name: $('rule-name').value.trim(),
      description: $('rule-desc').value.trim(),
      code: $('rule-code').value
    };
  }

  function clearForm() {
    $('rule-name').value = $('rule-desc').value = $('rule-code').value = '';
    editingId = null;
    $('form-title').textContent = 'Add a rule';
    $('save-rule-btn').textContent = 'Save rule';
    $('cancel-rule-btn').hidden = true;
  }

  function saveRule() {
    var f = readForm();
    if (!f.name) { formStatus('Give the rule a name.', true); return; }
    if (editingId) {
      custom.forEach(function (r) { if (r.id === editingId) { r.name = f.name; r.description = f.description; r.code = f.code; } });
    } else {
      var id;
      do { id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
      while (custom.some(function (r) { return r.id === id; }));
      custom.push({ id: id, name: f.name, description: f.description, code: f.code });
    }
    var stored = saveCustom();
    clearForm();
    formStatus(stored ? 'Rule saved in this browser. Press Run Tests to check it.' : 'Rule added for this page view, but this browser would not store it. Use Download custom-rules.js.', !stored);
    results = {}; hasRun = false;
    render();
  }

  function tryRule() {
    var f = readForm();
    var res = runCustom({ code: f.code });
    var t = res.tests[0];
    if (res.status === 'manual') formStatus('No test code to run. It will be saved as a manual rule.');
    else if (res.status === 'pass') formStatus('Your test code passed.');
    else formStatus((res.status === 'error' ? 'Error: ' : 'Failed: ') + t.message, true);
  }

  function onListClick(e) {
    var ed = e.target.closest('[data-edit]');
    var del = e.target.closest('[data-delete]');
    if (ed) {
      var r = custom.filter(function (x) { return x.id === ed.getAttribute('data-edit'); })[0];
      if (!r) return;
      $('rule-name').value = r.name; $('rule-desc').value = r.description || ''; $('rule-code').value = r.code || '';
      editingId = r.id;
      $('form-title').textContent = 'Edit rule';
      $('save-rule-btn').textContent = 'Update rule';
      $('cancel-rule-btn').hidden = false;
      $('rule-form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (del) {
      var id = del.getAttribute('data-delete');
      var rule = custom.filter(function (x) { return x.id === id; })[0];
      if (rule && window.confirm('Delete the rule "' + rule.name + '"?')) {
        custom = custom.filter(function (x) { return x.id !== id; });
        saveCustom();
        delete results[id];
        if (editingId === id) clearForm();
        render();
      }
    }
  }

  function downloadRules() {
    var text = '/* Exported from test.html on ' + new Date().toLocaleString() + '.\n' +
               ' * Replace js/custom-rules.js with this file. */\n' +
               'var CUSTOM_RULES = ' + JSON.stringify(custom, null, 2) + ';\n';
    var blob = new Blob([text], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'custom-rules.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    formStatus('Downloaded custom-rules.js. Put it in the js folder, replacing the existing file.');
  }

  // ---- Init --------------------------------------------------------------
  $('run-btn').addEventListener('click', runAll);
  $('save-rule-btn').addEventListener('click', saveRule);
  $('try-rule-btn').addEventListener('click', tryRule);
  $('cancel-rule-btn').addEventListener('click', function () { clearForm(); formStatus(''); });
  $('download-rules-btn').addEventListener('click', downloadRules);
  $('custom-results').addEventListener('click', onListClick);

  render();
  if (/[?&]autorun=1/.test(window.location.search)) runAll();   // lets a headless browser run the tests
})();
