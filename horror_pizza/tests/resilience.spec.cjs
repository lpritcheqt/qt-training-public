const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { unique, addPizza, placeOrder, cartPanel } = require('./helpers.cjs');

test.describe('Order submission failures (what the customer sees)', () => {
  test('server error: customer is told the order was NOT placed and keeps their cart and name', async ({ page }) => {
    const name = unique('Err');
    await page.route('**/api/orders', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Could not save your order."}' })
        : route.continue()
    );
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await placeOrder(page, name);
    await expect(page.getByRole('alert')).toContainText(/NOT placed/);
    await expect(page.getByText('Your order was placed successfully.')).toHaveCount(0);
    await expect(cartPanel(page).locator('.line')).toHaveCount(1);
    await expect(page.getByLabel('Your name (for pickup)')).toHaveValue(name);
  });

  test('network down: customer is told the order was NOT placed and can try again', async ({ page }) => {
    let fail = true;
    await page.route('**/api/orders', (route) =>
      route.request().method() === 'POST' && fail ? route.abort() : route.continue()
    );
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    await placeOrder(page, unique('Net'));
    await expect(page.getByRole('alert')).toContainText(/NOT placed/);
    fail = false;
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.getByText('Your order was placed successfully.')).toBeVisible();
  });

  test('the error message disappears after a later successful order', async ({ page }) => {
    let fail = true;
    await page.route('**/api/orders', (route) =>
      route.request().method() === 'POST' && fail ? route.abort() : route.continue()
    );
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    await placeOrder(page, unique('Retry'));
    await expect(page.getByRole('alert')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.getByText('Your order was placed successfully.').waitFor();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('order page still shows something helpful if the menu cannot be loaded', async ({ page }) => {
    await page.route('**/api/menu', (route) => route.abort());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForTimeout(500);
    // Expect a visible message and no uncaught script error.
    expect(errors).toEqual([]);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('AC-4.3 Orders survive a restart', () => {
  const PORT = 3198;
  const dbFile = path.join(os.tmpdir(), `elmst-restart-${Date.now()}.db`);
  const base = `http://localhost:${PORT}`;
  let proc;

  const start = async () => {
    proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
      env: { ...process.env, PORT: String(PORT), DB_PATH: dbFile },
      stdio: 'ignore',
    });
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${base}/api/menu`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('test server did not start');
  };
  const stop = async () => {
    proc.kill();
    await new Promise((r) => proc.once('exit', r));
  };
  test.afterEach(async () => proc && proc.exitCode === null && (await stop()));

  test('orders, items and statuses are all still there after the server is stopped and started again', async () => {
    await start();
    const post = (data) => fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json());
    const a = await post({ name: 'Survivor A', items: [{ size: 'large', toppings: ['onions'], quantity: 2 }] });
    const b = await post({ name: 'Survivor B', items: [{ size: 'small', toppings: [], quantity: 1 }] });
    await fetch(`${base}/api/orders/${a.id}`, { method: 'PATCH' });
    await stop();

    await start();
    const list = await (await fetch(`${base}/api/orders`)).json();
    const ra = list.find((o) => o.id === a.id);
    const rb = list.find((o) => o.id === b.id);
    expect(ra.status).toBe('Ready');
    expect(ra.name).toBe('Survivor A');
    expect(ra.totalCents).toBe(3200);
    expect(ra.items[0]).toEqual(expect.objectContaining({ size: 'large', toppings: ['onions'], quantity: 2 }));
    expect(rb.status).toBe('New');

    const c = await post({ name: 'After restart', items: [{ size: 'small', toppings: [], quantity: 1 }] });
    expect(c.id).toBeGreaterThan(b.id); // order numbers are not reused
  });
});
