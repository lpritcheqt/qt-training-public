'use strict';
/* The HTTP application: JSON API plus static files for the pages in this folder.
 * createServer() is used by server.js (the real thing) and by server/selftest.js
 * (a throwaway in-memory copy). */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./menu.js');
const { placeOrder, listOrders, OrderError } = require('./orders.js');
const { createAuth, tokenFromRequest, sessionCookie, clearCookie } = require('./auth.js');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_BODY = 256 * 1024;
const LOOKUP_WINDOW_MS = 60 * 1000;
const LOOKUP_MAX = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

// Only these files are ever served. Never server/, data/, config.json or *.db.
const STATIC_FILES = new Set(['/index.html', '/admin.html', '/test.html']);
const STATIC_DIR_RE = /^\/(css|js|images)\/[A-Za-z0-9_\-\/.]+\.(css|js|svg|png|jpg|jpeg|gif|ico|webp)$/;

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function securityHeaders(pathname) {
  // test.html runs custom rule code with new Function(), which needs 'unsafe-eval'.
  const scripts = pathname === '/test.html' ? "'self' 'unsafe-eval'" : "'self'";
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src " + scripts +
      "; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}

function sendJson(res, status, body, headers) {
  const data = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data)
  }, headers || {}));
  res.end(data);
}

function sendError(res, err, headers) {
  const body = { error: { code: err.code, message: err.message } };
  if (err.extra) Object.assign(body.error, err.extra);
  sendJson(res, err.status, body, headers);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { tooBig = true; return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'too_large', 'The request is too large.'));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch (e) { reject(new HttpError(400, 'bad_json', 'The request body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function createServer({ db, getPin, rootDir }) {
  const root = path.resolve(rootDir);
  const auth = createAuth(getPin);
  const lookups = [];
  const routes = [];

  function route(method, pattern, opts, handler) {
    routes.push({ method, re: new RegExp('^' + pattern + '$'), admin: !!opts.admin, handler });
  }
  const adminPayload = () => ({ menu: M.readFullMenu(db), used: M.readRedemptions(db) });

  // ---- Public API ----------------------------------------------------------
  route('GET', '/api/menu', {}, () => ({ status: 200, body: M.readMenu(db) }));

  route('POST', '/api/coupons/lookup', {}, (ctx) => {
    const now = Date.now();
    while (lookups.length && now - lookups[0] > LOOKUP_WINDOW_MS) lookups.shift();
    if (lookups.length >= LOOKUP_MAX) {
      throw new HttpError(429, 'rate_limited', 'Too many coupon attempts. Please wait a minute.');
    }
    lookups.push(now);
    const code = ctx.body && ctx.body.code;
    if (typeof code !== 'string' || !code.trim() || code.length > 20) {
      throw new HttpError(400, 'coupon_invalid', 'Enter a coupon code.');
    }
    const c = M.findCouponByCode(db, code);
    if (!c) throw new HttpError(404, 'coupon_unknown', 'Coupon code not recognized.');
    if (c.available === false) throw new HttpError(409, 'coupon_unavailable', 'That coupon is not available.');
    if (M.usedCouponIds(db).indexOf(c.id) > -1) throw new HttpError(409, 'coupon_used', 'That coupon has already been used.');
    return { status: 200, body: { coupon: c } };
  });

  route('POST', '/api/orders', {}, (ctx) => ({ status: 201, body: placeOrder(db, ctx.body) }));

  route('GET', '/api/rules', {}, () => ({ status: 200, body: { rules: M.readRules(db) } }));

  route('GET', '/api/selftest', {}, async () => {
    const { runSelfTests } = require('./selftest.js');
    return { status: 200, body: await runSelfTests({ liveDb: db }) };
  });

  // ---- Admin login ---------------------------------------------------------
  route('GET', '/api/admin/session', {}, (ctx) => ({ status: 200, body: { loggedIn: auth.isValid(ctx.token) } }));

  route('POST', '/api/admin/login', {}, (ctx) => {
    const r = auth.login(ctx.body && ctx.body.pin);
    if (!r.ok) {
      throw new HttpError(r.status, r.status === 429 ? 'locked' : 'bad_pin', r.message, r.retryAfter ? { retryAfter: r.retryAfter } : undefined);
    }
    return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(r.token, r.maxAge) } };
  });

  route('POST', '/api/admin/logout', {}, (ctx) => {
    auth.logout(ctx.token);
    return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': clearCookie() } };
  });

  // ---- Admin (PIN session required) ----------------------------------------
  route('GET', '/api/admin/menu', { admin: true }, () => ({ status: 200, body: adminPayload() }));

  route('PUT', '/api/admin/menu', { admin: true }, (ctx) => {
    const { menu, problems } = M.sanitizeMenu(ctx.body && ctx.body.menu);
    if (problems.length) {
      throw new HttpError(400, 'invalid_menu', 'The menu has problems: ' + problems.join(' '), { problems });
    }
    M.replaceMenu(db, menu);
    return { status: 200, body: adminPayload() };
  });

  route('POST', '/api/admin/menu/reset', { admin: true }, () => {
    M.resetMenuToDefault(db);
    return { status: 200, body: adminPayload() };
  });

  route('POST', '/api/admin/coupons/unuse-all', { admin: true }, () => {
    M.unuseAllCoupons(db);
    return { status: 200, body: adminPayload() };
  });

  route('POST', '/api/admin/coupons/([A-Za-z0-9_-]{1,64})/unuse', { admin: true }, (ctx) => {
    M.unuseCoupon(db, ctx.params[0]);
    return { status: 200, body: adminPayload() };
  });

  route('GET', '/api/admin/orders', { admin: true }, (ctx) => ({
    status: 200, body: { orders: listOrders(db, parseInt(ctx.url.searchParams.get('limit'), 10)) }
  }));

  route('GET', '/api/admin/export', { admin: true }, () => ({
    status: 200,
    body: { exportedAt: new Date().toISOString(), menu: M.readFullMenu(db), rules: M.readRules(db) },
    headers: { 'Content-Disposition': 'attachment; filename="pizza-backup.json"' }
  }));

  route('PUT', '/api/admin/rules', { admin: true }, (ctx) => {
    const { rules, problems } = M.sanitizeRules(ctx.body && ctx.body.rules);
    if (problems.length) {
      throw new HttpError(400, 'invalid_rules', 'The rules have problems: ' + problems.join(' '), { problems });
    }
    M.replaceRules(db, rules);
    return { status: 200, body: { rules: M.readRules(db) } };
  });

  // ---- Static files --------------------------------------------------------
  function resolveStatic(pathname) {
    let p;
    try { p = decodeURIComponent(pathname); } catch (e) { return null; }
    if (p === '/') p = '/index.html';
    if (!STATIC_FILES.has(p) && !STATIC_DIR_RE.test(p)) return null;
    if (p.indexOf('..') > -1 || p.indexOf('//') > -1 || p.indexOf('\\') > -1) return null;
    const full = path.join(root, p);
    return full.startsWith(root + path.sep) ? full : null;
  }

  function serveStatic(req, res, url) {
    const file = resolveStatic(url.pathname);
    if (!file) return sendError(res, new HttpError(404, 'not_found', 'Not found.'));
    fs.readFile(file, (err, data) => {
      if (err) return sendError(res, new HttpError(404, 'not_found', 'Not found.'));
      res.writeHead(200, Object.assign({
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': data.length
      }, securityHeaders(url.pathname)));
      res.end(data);
    });
  }

  // ---- Request handling ----------------------------------------------------
  async function handle(req, res) {
    const host = (req.headers.host || '').toLowerCase();
    // Only answer requests addressed to this machine (blocks DNS-rebinding tricks).
    if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) {
      return sendError(res, new HttpError(403, 'forbidden_host', 'Requests must use localhost.'));
    }
    const url = new URL(req.url, 'http://' + host);
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    if (!url.pathname.startsWith('/api/')) {
      if (!isRead) return sendError(res, new HttpError(405, 'method_not_allowed', 'Method not allowed.'));
      return serveStatic(req, res, url);
    }

    // Browsers always send Origin on cross-site writes; it must be this site.
    if (!isRead && req.headers.origin && req.headers.origin !== 'http://' + host) {
      return sendError(res, new HttpError(403, 'bad_origin', 'Cross-site requests are not allowed.'));
    }

    let matched = null;
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method === req.method) { matched = { r, params: m.slice(1) }; break; }
    }
    if (!matched) {
      return sendError(res, pathMatched
        ? new HttpError(405, 'method_not_allowed', 'Method not allowed.')
        : new HttpError(404, 'not_found', 'Not found.'));
    }

    const token = tokenFromRequest(req);
    if (matched.r.admin && !auth.isValid(token)) {
      return sendError(res, new HttpError(401, 'login_required', 'Admin login required.'));
    }

    let body = {};
    if (!isRead) {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
        // Allow empty-body POSTs (logout, reset) without a content type.
        if (req.headers['content-length'] && req.headers['content-length'] !== '0') {
          return sendError(res, new HttpError(415, 'json_required', 'Send JSON (Content-Type: application/json).'));
        }
      }
      body = await readBody(req);
    }

    const out = await matched.r.handler({ req, res, db, url, body, token, params: matched.params });
    sendJson(res, out.status, out.body, Object.assign({}, securityHeaders(url.pathname), out.headers));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof HttpError) return sendError(res, err);
      if (err instanceof OrderError) return sendError(res, err);
      console.error('Unexpected error:', err);
      if (!res.headersSent) sendError(res, new HttpError(500, 'server_error', 'Something went wrong on the server.'));
      else res.end();
    });
  });
  return server;
}

module.exports = { createServer };
