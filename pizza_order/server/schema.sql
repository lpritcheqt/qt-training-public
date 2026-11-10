-- Dragon's Crunchy Knights Pizza - SQLite schema, version 1.
-- Money is stored as integer cents. Orders snapshot names and prices, so later
-- menu edits never change order history. To change this schema, add a migration
-- step in server/db.js instead of editing this file.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sizes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  topping_mult REAL NOT NULL CHECK (topping_mult >= 0),
  available    INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort         INTEGER NOT NULL
);

CREATE TABLE crusts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  available   INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort        INTEGER NOT NULL
);

CREATE TABLE toppings (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  emoji     TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort      INTEGER NOT NULL
);

-- Sides and drinks share one table.
CREATE TABLE extras (
  kind        TEXT NOT NULL CHECK (kind IN ('side', 'drink')),
  id          TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  image       TEXT NOT NULL DEFAULT '',
  available   INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort        INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE TABLE coupons (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  code      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type      TEXT NOT NULL CHECK (type IN ('percent', 'amount', 'freeSide', 'freeDrink')),
  value     REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  sort      INTEGER NOT NULL
);

CREATE TABLE orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents    INTEGER NOT NULL CHECK (total_cents >= 0),
  coupon_id      TEXT REFERENCES coupons (id) ON DELETE SET NULL,
  coupon_code    TEXT
);

CREATE TABLE order_lines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('pizza', 'side', 'drink')),
  description      TEXT NOT NULL,
  qty              INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE order_line_toppings (
  line_id INTEGER NOT NULL REFERENCES order_lines (id) ON DELETE CASCADE,
  name    TEXT NOT NULL
);

-- The primary key on coupon_id is what enforces "each coupon can only be used
-- once", even across devices or double submits.
CREATE TABLE coupon_redemptions (
  coupon_id   TEXT PRIMARY KEY REFERENCES coupons (id) ON DELETE CASCADE,
  order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  redeemed_at TEXT NOT NULL
);

CREATE TABLE custom_rules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  code        TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);
