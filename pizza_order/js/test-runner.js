(function () {
  'use strict';

  var custom = [];                             // custom rules, stored in the database
  var serverRules = [];                        // results from /api/selftest (the server-side rules)
  var results = {};                            // rule id -> { status, tests[] }
  var editingId = null;
  var hasRun = false;
  var ready = false;                           // menu and rules loaded from the server
  var serverError = '';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
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
      var ret = fn(assert, assertEqual, OrderLogic, window.LIVE_MENU, fixtureMenu, makeIds, cartOf);
      if (ret === false) return { status: 'fail', tests: [{ name: 'Test code', ok: false, message: 'The check returned false.' }] };
      return { status: 'pass', tests: [{ name: 'Test code', ok: true, message: '' }] };
    } catch (e) {
      return { status: 'fail', tests: [{ name: 'Test code', ok: false, message: e && e.message ? e.message : String(e) }] };
    }
  }

  function runAll() {
    if (!ready) { renderSummary(); return Promise.resolve(); }
    results = {};
    serverRules = [];
    BUILTIN_RULES.forEach(function (r) { results[r.id] = runBuiltin(r); });
    custom.forEach(function (r) { results[r.id] = runCustom(r); });
    $('run-btn').disabled = true;
    $('summary').className = 'summary';
    $('summary').textContent = 'Running server tests...';
    return Api.selftest().then(function (r) {
      if (!r.ok) throw new Error(r.error ? r.error.message : 'The server tests could not run.');
      serverRules = r.data.rules;
      serverError = '';
    }).catch(function (e) {
      // Report it as a failing rule so it can't be missed.
      serverRules = [{
        id: 'Server', name: 'Server tests', description: 'The server-side rule tests could not run.',
        tests: [{ name: 'Run /api/selftest', ok: false, message: e && e.message ? e.message : String(e) }], status: 'fail'
      }];
    }).then(function () {
      serverRules.forEach(function (r) { results[r.id] = { status: r.status, tests: r.tests }; });
      hasRun = true;
      $('run-btn').disabled = false;
      render();
    });
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
    var b = $('builtin-results'), s = $('server-results'), c = $('custom-results');
    b.textContent = s.textContent = c.textContent = '';
    BUILTIN_RULES.forEach(function (r) { b.appendChild(ruleCard(r, false)); });
    if (!serverRules.length) s.appendChild(el('p', 'fine', 'The server rules run together with the others when you press Run Tests.'));
    serverRules.forEach(function (r) { s.appendChild(ruleCard(r, false)); });
    if (!custom.length) c.appendChild(el('p', 'fine', 'No custom rules yet. Add one below.'));
    custom.forEach(function (r) { c.appendChild(ruleCard(r, true)); });
    renderSummary();
  }

  function renderSummary() {
    var all = BUILTIN_RULES.concat(serverRules, custom);
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
    var bad = counts.fail + counts.error;
    if (serverError) {
      box.className = 'summary bad';
      box.textContent = serverError;
    } else if (!hasRun) {
      box.className = 'summary';
      box.textContent = 'Tests have not been run yet.';
    } else {
      box.className = 'summary ' + (bad ? 'bad' : 'good');
      box.textContent = (bad ? 'FAILED: ' : 'ALL PASSED: ') + counts.pass + ' of ' + all.length + ' rules passed' +
        (bad ? ', ' + bad + ' failed' : '') + (counts.manual ? ', ' + counts.manual + ' manual' : '') +
        ' (' + tPass + ' tests passed' + (tFail ? ', ' + tFail + ' failed' : '') + ').';
      document.title = (bad ? 'FAILED ' : 'PASSED ') + counts.pass + '/' + all.length + ' - Rule Tests';
    }
    ms.setAttribute('data-rules', String(all.length));
    ms.setAttribute('data-passed', String(counts.pass));
    ms.setAttribute('data-failed', String(bad));
    ms.setAttribute('data-manual', String(counts.manual));
    ms.setAttribute('data-tests-passed', String(tPass));
    ms.setAttribute('data-tests-failed', String(tFail));
    ms.setAttribute('data-ran', hasRun ? 'yes' : 'no');
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

  // Saves the whole list to the database. Needs the admin login.
  function persist(list, okMessage) {
    return Api.saveRules(list).then(function (r) {
      if (r.status === 401) {
        formStatus('Log in on the admin page first (the same PIN protects rule changes), then save again.', true);
        return false;
      }
      if (!r.ok) { formStatus(r.error ? r.error.message : 'The rules could not be saved.', true); return false; }
      custom = r.data.rules;
      formStatus(okMessage);
      return true;
    }).catch(function () {
      formStatus('Could not reach the pizza server. Is it running?', true);
      return false;
    });
  }

  function saveRule() {
    var f = readForm();
    if (!f.name) { formStatus('Give the rule a name.', true); return; }
    var next;
    if (editingId) {
      next = custom.map(function (r) {
        return r.id === editingId ? { id: r.id, name: f.name, description: f.description, code: f.code } : r;
      });
    } else {
      var id;
      do { id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
      while (custom.some(function (r) { return r.id === id; }));
      next = custom.concat([{ id: id, name: f.name, description: f.description, code: f.code }]);
    }
    persist(next, 'Rule saved to the database. Press Run Tests to check it.').then(function (saved) {
      if (!saved) return;
      clearForm();
      results = {}; serverRules = []; hasRun = false;
      render();
    });
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
        persist(custom.filter(function (x) { return x.id !== id; }), 'Rule deleted.').then(function (saved) {
          if (!saved) return;
          delete results[id];
          if (editingId === id) clearForm();
          render();
        });
      }
    }
  }

  function downloadRules() {
    var blob = new Blob([JSON.stringify(custom, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'custom-rules.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    formStatus('Downloaded custom-rules.json. Save it over server/seed/custom-rules.json to commit it with the project.');
  }

  // ---- Init --------------------------------------------------------------
  $('run-btn').addEventListener('click', runAll);
  $('save-rule-btn').addEventListener('click', saveRule);
  $('try-rule-btn').addEventListener('click', tryRule);
  $('cancel-rule-btn').addEventListener('click', function () { clearForm(); formStatus(''); });
  $('download-rules-btn').addEventListener('click', downloadRules);
  $('custom-results').addEventListener('click', onListClick);

  render();
  Promise.all([Api.getMenu(), Api.getRules()]).then(function (rs) {
    if (!rs[0].ok || !rs[1].ok) throw new Error('load');
    window.LIVE_MENU = rs[0].data;
    window.LIVE_MENU.coupons = [];                    // coupon codes never leave the server
    custom = rs[1].data.rules;
    ready = true;
    render();
    if (/[?&]autorun=1/.test(window.location.search)) runAll();   // lets a headless browser run the tests
  }).catch(function () {
    serverError = "Can't reach the pizza server. Start it with node server.js (or start.bat), then reload this page.";
    $('run-btn').disabled = true;
    render();
  });
})();
