# Dragon's Crunchy Knights Pizza

A pizza ordering app: build pizzas (size, crust, up to 5 toppings), add sides and dragon-brand drinks, apply a coupon, and place the order. Plain HTML, CSS and JavaScript pages, backed by a SQLite database through a small local Node server.

## Run it

You need **Node.js 22.13 or later** (SQLite is built in, there is nothing to install).

```bash
cd pizza_order
node server.js
```

or double-click **`start.bat`** on Windows (it also opens the browser). Then open:

| Page | Address |
|---|---|
| Order page | http://localhost:3000/ |
| Admin (menu, coupons, orders) | http://localhost:3000/admin.html |
| Rule tests | http://localhost:3000/test.html |

On the first run the server creates `config.json` with a random **admin PIN** (printed in the console and saved in the file) and `data/pizza.db` loaded with the default menu and coupons. Both are ignored by git. The server listens on this computer only.

Default coupons: `KNIGHT10` (10% off), `HOARD20` (20% off), `SLAYER3` ($3 off), `FREESIDE`, `FREEDRINK`. Every coupon needs at least $5.00 in the order, only one coupon works per order, and each coupon works once.

## What is where

```
pizza_order/
  index.html, admin.html, test.html   the pages
  css/  js/  images/                  front end (js/logic.js holds the order rules)
  server.js                           starts the server
  server/                             database, API, rule tests (server/selftest.js), seed data
  data/pizza.db                       the SQLite database (created on first run, not committed)
  config.json                         port and admin PIN (created on first run, not committed)
  start.bat, config.example.json
```

The order rules (20 items per order, 5 toppings per pizza, coupon rules, no negative totals) are in `js/logic.js`. The browser uses them for instant feedback and the server runs the same file as the authority, so they hold even if someone bypasses the page.

## Tests

```bash
node --disable-warning=ExperimentalWarning server/selftest.js   # server rules, from the command line
```

or open the **Rule tests** page and press **Run Tests** (runs the browser rules and the server rules). You can add your own rules on that page; see `CLAUDE.md` for the full procedure.

## Backups and resetting

- **Admin page > Export backup (JSON)** downloads the menu, coupons and custom rules. **Load backup file** reads one back (press Save to apply).
- To start over completely, stop the server and delete the `data` folder; the next start creates a fresh database.
- `node:sqlite` is still marked experimental in Node and may print a warning; `start.bat` hides it.
