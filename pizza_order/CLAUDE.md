# Pizza Order Page

Plain HTML, CSS and JavaScript only (no .NET, no server, no internet or CDN dependencies). Everything must open from `file://`.

## Rules

- When an item is unavailable, show its name in red with a strikethrough, followed by (sold out) in parentheses.

## Coupon Rules

- All coupons for free items or discounts require a purchase of at least $5.
- Only one coupon can be used per order.
- Each coupon can only be used once.

## Order Limits

- No more than 20 items per order, in any combination of pizzas, sides and drinks (quantities count).
- No more than 5 toppings per pizza.
- A coupon must never create a negative balance. We never owe the customer money: for example, a $5 coupon on a $4.99 order is refused, and the discount can never exceed the subtotal.

## Rule Tests (run these before finishing any code)

The business rules are tested like unit tests in C#. The order logic lives in `js/logic.js` (shared by the order page and the tests), the built-in tests are in `js/rules.js`, and the user's own rules are in `js/custom-rules.js`. `test.html` runs them all.

**Before completing any code change to this project, run the rule tests and make sure they all pass:**

1. Run the tests in a headless browser and read the result (all `data-failed` values must be `0`):

   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom "file:///C:/qtdev/qt-training-public/pizza_order/test.html?autorun=1"
   ```

   Look for `id="machine-summary"` in the output: `data-ran="yes"` and `data-failed="0"`. Failing tests are listed in the page with `class="rule fail"` and their messages. Use a timeout when running it (for example `timeout 90`), and never trigger `confirm()` dialogs, which hang headless runs.
2. Fix any failing rule before finishing. Do not weaken or delete a test just to make it pass. If a rule truly has to change, tell the user first.
3. Also review the **MANUAL** rules (listed in `js/rules.js` with `manual: true`, and any custom rule in `js/custom-rules.js` without code) against the change by hand, since nothing checks them automatically.
4. When a new rule or limit is added to the app, add a test for it in `js/rules.js` (or ask the user to add it on `test.html`), and add the rule to this file.
5. Rules the user adds on `test.html` are saved in their browser. To be checked here they must be exported with "Download custom-rules.js" and saved over `js/custom-rules.js`. If the user says they added rules, ask them to do that, or read the file to confirm.
6. Business rules belong in `js/logic.js`, not in `js/app.js`, so the tests exercise the same code the page runs. The order page must call `OrderLogic` for limits, pricing and coupons.
7. In the final summary for any code change, state the rule test result (for example "rule tests: 10 of 10 rules passed").
