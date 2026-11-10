/* Browser client for the pizza server (see server/app.js).
 * Every call resolves to { ok, status, data, error } and only rejects when the
 * server cannot be reached at all. */
var Api = (function () {
  function request(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data, error: data && data.error ? data.error : null };
      });
    });
  }

  return {
    request: request,
    // Public
    getMenu: function () { return request('GET', '/api/menu'); },
    lookupCoupon: function (code) { return request('POST', '/api/coupons/lookup', { code: code }); },
    placeOrder: function (payload) { return request('POST', '/api/orders', payload); },
    getRules: function () { return request('GET', '/api/rules'); },
    selftest: function () { return request('GET', '/api/selftest'); },
    // Admin (PIN session)
    session: function () { return request('GET', '/api/admin/session'); },
    login: function (pin) { return request('POST', '/api/admin/login', { pin: pin }); },
    logout: function () { return request('POST', '/api/admin/logout'); },
    adminMenu: function () { return request('GET', '/api/admin/menu'); },
    saveMenu: function (menu) { return request('PUT', '/api/admin/menu', { menu: menu }); },
    resetMenu: function () { return request('POST', '/api/admin/menu/reset'); },
    unuseCoupon: function (id) { return request('POST', '/api/admin/coupons/' + encodeURIComponent(id) + '/unuse'); },
    unuseAllCoupons: function () { return request('POST', '/api/admin/coupons/unuse-all'); },
    orders: function (limit) { return request('GET', '/api/admin/orders?limit=' + (limit || 50)); },
    saveRules: function (rules) { return request('PUT', '/api/admin/rules', { rules: rules }); }
  };
})();
