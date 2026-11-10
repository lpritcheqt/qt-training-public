const { test, expect } = require('@playwright/test');
const { unique, orderThroughUi, kitchenCard } = require('./helpers.cjs');

test.describe('Kitchen screen (Req 4)', () => {
  test('kitchen page loads and links back to the order page', async ({ page }) => {
    await page.goto('/kitchen');
    await expect(page.getByRole('heading', { name: 'Kitchen Crypt' })).toBeVisible();
    await page.getByRole('link', { name: 'Order Page' }).click();
    await expect(page.getByRole('heading', { name: 'Build Your Nightmare' })).toBeVisible();
    await page.getByRole('link', { name: 'Kitchen Crypt' }).click();
    await expect(page.getByRole('heading', { name: 'Kitchen Crypt' })).toBeVisible();
  });

  test('AC-4.1/4.2 a submitted order appears as New with name, number, pizzas and total', async ({ page }) => {
    const name = unique('Freddy');
    const number = await orderThroughUi(page, name, [
      { size: 'large', toppings: ['pepperoni', 'mushrooms'] },
      { size: 'small' },
    ]);
    await page.goto('/kitchen');
    const card = kitchenCard(page, name);
    await expect(card).toContainText(`Order #${number}`);
    await expect(card).toContainText(name);
    await expect(card.locator('.status')).toHaveText('New');
    await expect(card).toContainText('The Massacre');
    await expect(card).toContainText('Pepperoni of Doom');
    await expect(card).toContainText('Creeping Fungus');
    await expect(card).toContainText('The Final Girl');
    await expect(card).toContainText(/plain cheese/i);
    await expect(card).toContainText('$28.00');
    await expect(card.getByRole('button', { name: 'Mark Ready' })).toBeVisible();
  });

  test('quantities are shown in the kitchen and the total matches the confirmation', async ({ page }) => {
    const name = unique('Qty');
    await page.goto('/');
    await page.getByLabel(/The Massacre/).check();
    await page.getByRole('button', { name: 'Add to Order' }).click();
    const qty = page.locator('section.panel').nth(1).locator('input[type=number]');
    await qty.fill('3');
    await qty.press('Tab');
    await page.getByLabel('Your name (for pickup)').fill(name);
    await page.getByRole('button', { name: 'Place Order' }).click();
    const confirmed = await page.locator('.success .total').innerText();
    await page.goto('/kitchen');
    const card = kitchenCard(page, name);
    await expect(card).toContainText('3 x');
    await expect(card).toContainText('$42.00');
    expect(confirmed).toContain('$42.00');
  });

  test('AC-4.2 Mark Ready changes the status and removes the button', async ({ page }) => {
    const name = unique('Ready');
    await orderThroughUi(page, name);
    await page.goto('/kitchen');
    const card = kitchenCard(page, name);
    await card.getByRole('button', { name: 'Mark Ready' }).click();
    await expect(card.locator('.status')).toHaveText('Ready');
    await expect(card.getByRole('button', { name: 'Mark Ready' })).toHaveCount(0);
  });

  test('marking one order Ready leaves other orders New', async ({ page }) => {
    const a = unique('First');
    const b = unique('Second');
    await orderThroughUi(page, a);
    await orderThroughUi(page, b);
    await page.goto('/kitchen');
    await kitchenCard(page, a).getByRole('button', { name: 'Mark Ready' }).click();
    await expect(kitchenCard(page, a).locator('.status')).toHaveText('Ready');
    await expect(kitchenCard(page, b).locator('.status')).toHaveText('New');
  });

  test('AC-4.3 Ready status is still shown after the page is reloaded', async ({ page }) => {
    const name = unique('Persist');
    await orderThroughUi(page, name);
    await page.goto('/kitchen');
    await kitchenCard(page, name).getByRole('button', { name: 'Mark Ready' }).click();
    await expect(kitchenCard(page, name).locator('.status')).toHaveText('Ready');
    await page.reload();
    await expect(kitchenCard(page, name).locator('.status')).toHaveText('Ready');
  });

  test('a new order shows up on an open kitchen screen without reloading (within 15 s)', async ({ page, request }) => {
    test.setTimeout(45000);
    const name = unique('Live');
    await page.goto('/kitchen');
    await page.locator('article').first().waitFor().catch(() => {});
    const res = await request.post('/api/orders', {
      data: { name, items: [{ size: 'small', toppings: [], quantity: 1 }] },
    });
    expect(res.status()).toBe(201);
    await expect(kitchenCard(page, name)).toBeVisible({ timeout: 15000 });
  });

  test('status changed on another screen is picked up by a stale kitchen screen (within 15 s)', async ({ browser, request }) => {
    test.setTimeout(45000);
    const name = unique('Stale');
    const created = await (await request.post('/api/orders', {
      data: { name, items: [{ size: 'small', toppings: [], quantity: 1 }] },
    })).json();
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await a.goto('/kitchen');
    await b.goto('/kitchen');
    await expect(kitchenCard(b, name).locator('.status')).toHaveText('New');
    await request.patch(`/api/orders/${created.id}`);
    await expect(kitchenCard(b, name).locator('.status')).toHaveText('Ready', { timeout: 15000 });
    await a.context().close();
    await b.context().close();
  });

  test('clicking Mark Ready on a stale screen for an already-Ready order is harmless', async ({ page, request }) => {
    const name = unique('Twice');
    const created = await (await request.post('/api/orders', {
      data: { name, items: [{ size: 'small', toppings: [], quantity: 1 }] },
    })).json();
    await page.goto('/kitchen');
    await expect(kitchenCard(page, name).locator('.status')).toHaveText('New');
    await request.patch(`/api/orders/${created.id}`); // another screen marks it Ready first
    await kitchenCard(page, name).getByRole('button', { name: 'Mark Ready' }).click();
    await expect(kitchenCard(page, name).locator('.status')).toHaveText('Ready');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('kitchen shows a clear message when the server cannot be reached', async ({ page }) => {
    await page.route('**/api/orders', (route) => route.abort());
    await page.goto('/kitchen');
    await expect(page.getByRole('alert')).toContainText(/cannot reach the server/i);
  });

  test('if Mark Ready fails the order stays New and an error is shown', async ({ page }) => {
    const name = unique('Fail');
    await orderThroughUi(page, name);
    await page.goto('/kitchen');
    await page.route('**/api/orders/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.continue()
    );
    await kitchenCard(page, name).getByRole('button', { name: 'Mark Ready' }).click();
    await expect(page.getByRole('alert')).toContainText(/could not update/i);
    await expect(kitchenCard(page, name).locator('.status')).toHaveText('New');
  });

  test('kitchen page has no console errors', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    await page.goto('/kitchen');
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('kitchen page has no horizontal scrolling on a tablet-sized screen', async ({ page }) => {
    await orderThroughUi(page, unique('Wide'), [{ size: 'large', toppings: ['pepperoni', 'mushrooms', 'onions', 'peppers'] }]);
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/kitchen');
    await page.locator('article').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
