# Pizza Order App

Dragon's Crunchy Knights Pizza. The pages are plain HTML, CSS and JavaScript (no framework, no build step, no internet or CDN dependencies). All data lives in a **SQLite database** owned by a small local **Node server** (`server.js`, Node's built-in `node:sqlite`, no npm packages). No .NET.

Run it: `node server.js` (or double-click `start.bat`), then open http://localhost:3000. The pages no longer open from `file://`. See `README.md`.

## Where things live

- **Data is in SQLite** (`data/pizza.db`, not committed): menu, coupons, coupon redemptions, orders, custom test rules. Never put data back into browser JavaScript, `localStorage` or hard-coded menu objects. The default menu is seed data in `server/seed/default-menu.json`.
- **Business rules live in `js/logic.js`**. The browser uses it for instant feedback and the server `require`s the same file as the authority. Keep rules there (not in `js/app.js`), and never trust the browser: the server re-checks everything and prices every order itself.
- All SQL is in `server/db.js`, `server/menu.js` and `server/orders.js`, using prepared statements only. Schema changes need a new migration step in `server/db.js` (do not edit `server/schema.sql` once released).
- `config.json` (gitignored, created on first run) holds the admin PIN. Never print it in summaries, commit it, or serve it. The server only serves an allowlist of pages and `css/`, `js/`, `images/`.

## Rules

- When an item is unavailable, show its name in red with a strikethrough, followed by (sold out) in parentheses.

## Coupon Rules

- All coupons for free items or discounts require a purchase of at least $5.
- Only one coupon can be used per order.
- Each coupon can only be used once (enforced by the database: `coupon_redemptions` has `coupon_id` as its primary key).

## Order Limits

- No more than 20 items per order, in any combination of pizzas, sides and drinks (quantities count).
- No more than 5 toppings per pizza.
- A coupon must never create a negative balance. We never owe the customer money: for example, a $5 coupon on a $4.99 order is refused, and the discount can never exceed the subtotal.

## Rule Tests (run these before finishing any code)

The business rules are tested like unit tests in C#:
- `js/rules.js` has the browser rules (they run `js/logic.js` against fixed fixture data and the live menu).
- `server/selftest.js` has the **server rules**. Each test starts its own throwaway in-memory database behind the real HTTP server, so they never touch `data/pizza.db`.
- The user's own rules are stored in the database (`custom_rules`); `server/seed/custom-rules.json` seeds a new database.
- `test.html` runs all of them (Run Tests button).

**Before completing any code change to this project, run the rule tests and make sure they all pass:**

1. Make sure the server is running (`curl -s http://localhost:3000/api/menu`). If it is not, start it in the background with `node --disable-warning=ExperimentalWarning server.js` from this folder, and stop it again when you are done if you started it.
2. Run the server tests from the command line (fast, shows failures as text; it also checks the live database read-only):

   ```
   node --disable-warning=ExperimentalWarning server/selftest.js
   ```
3. Run the full test page in a headless browser and read the result:

   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --virtual-time-budget=30000 --dump-dom "http://localhost:3000/test.html?autorun=1"
   ```

   Look for `id="machine-summary"` in the output: `data-ran="yes"` and `data-failed="0"`. Failing tests are listed with `class="rule fail"` and their messages. Use a timeout (for example `timeout 120`), and never trigger `confirm()` dialogs, which hang headless runs.
4. Fix any failing rule before finishing. Do not weaken or delete a test just to make it pass. If a rule truly has to change, tell the user first.
5. Review the **MANUAL** rules (listed with `manual: true` in `js/rules.js`, and any custom rule without code) against the change by hand, since nothing checks them automatically.
6. When a new rule or limit is added to the app, add a test for it (`js/rules.js` for logic, `server/selftest.js` for what the server must enforce) and add the rule to this file.
7. Custom rules the user adds on `test.html` need the admin login to save and live in `data/pizza.db`. To make them part of the project they must be downloaded ("Download custom-rules.json") and saved over `server/seed/custom-rules.json`. If the user says they added rules, ask them to do that.
8. Never delete or edit `data/pizza.db` or `config.json` to make tests pass or to "clean up" without asking. The database holds real orders and coupon redemptions once the app is in use.
9. In the final summary for any code change, state the rule test result (for example "rule tests: 20 of 21 rules passed, 1 manual").
