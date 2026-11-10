'use strict';
/* Admin PIN login with in-memory sessions and a simple lockout. */
const crypto = require('node:crypto');

const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 1000;
const MAX_FAILURES = 5;
const COOKIE = 'dckp_admin';

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest(); }

// Constant-time comparison (hashing first makes both sides the same length).
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

function createAuth(getPin) {
  const sessions = new Map();     // token -> expiry time
  let failures = [];              // recent failed-attempt times

  function lockedFor() {
    const now = Date.now();
    failures = failures.filter((t) => now - t < WINDOW_MS);
    return failures.length >= MAX_FAILURES ? Math.ceil((WINDOW_MS - (now - failures[0])) / 1000) : 0;
  }

  function login(pin) {
    const wait = lockedFor();
    if (wait) return { ok: false, status: 429, retryAfter: wait, message: 'Too many attempts. Try again in ' + wait + ' seconds.' };
    if (typeof pin === 'string' && pin.length > 0 && pin.length <= 64 && safeEqual(pin, getPin())) {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      return { ok: true, token, maxAge: SESSION_MS / 1000 };
    }
    failures.push(Date.now());
    return { ok: false, status: 401, message: 'Incorrect PIN.' };
  }

  function isValid(token) {
    if (!token || !sessions.has(token)) return false;
    if (sessions.get(token) < Date.now()) { sessions.delete(token); return false; }
    return true;
  }

  function logout(token) { sessions.delete(token); }

  return { login, isValid, logout };
}

function tokenFromRequest(req) {
  const header = req.headers.cookie || '';
  const m = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  return m ? m.slice(COOKIE.length + 1) : null;
}

function sessionCookie(token, maxAge) {
  return COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge;
}
function clearCookie() {
  return COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}

module.exports = { createAuth, tokenFromRequest, sessionCookie, clearCookie };
