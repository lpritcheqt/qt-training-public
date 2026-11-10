const { test, expect } = require('@playwright/test');
const {
  TOPPING_IDS, unique, money, expectedPrice, cartPanel, selectPizza, addPizza, placeOrder, orderThroughUi,
} = require('./helpers.cjs');

const price = (page) => page.locator('.price-big').first();

test.describe('Ordering: menu and pricing (Req 1)', () => {
  test('AC-1.1/1.2 menu shows both sizes and four toppings with the required prices', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel(/The Final Girl/)).toBeVisible();
    await expect(page.getByLabel(/The Massacre/)).toBeVisible();
    await expect(page.locator('label.opt', { hasText: 'The Final Girl' })).toContainText('$10.00');
    await expect(page.locator('label.opt', { hasText: 'The Massacre' })).toContainText('$14.00');
    for (const name of ['Pepperoni of Doom', 'Creeping Fungus', 'Onions of Tears', 'Swamp Thing Green Peppers']) {
      await expect(page.locator('label.opt', { hasText: name })).toContainText('+$2.00');
    }
    await expect(page.locator('input[type=checkbox]')).toHaveCount(4);
    await expect(page.locator('input[type=radio]')).toHaveCount(2);
  });

  test('AC-1.2 a price is visible before adding, and small is the default size', async ({ page }) => {
    await page.goto('/');
    await expect(price(page)).toHaveText('$10.00');
    await expect(page.getByLabel(/The Final Girl/)).toBeChecked();
  });

  test('AC-1.3 price is correct for every size and every topping combination (32 combos)', async ({ page }) => {
    await page.goto('/');
    for (const size of ['small', 'large']) {
      for (let mask = 0; mask < 16; mask++) {
        const toppings = TOPPING_IDS.filter((_, i) => mask & (1 << i));
        await selectPizza(page, { size, toppings });
        await expect(price(page), `${size} + [${toppings}]`).toHaveText(money(expectedPrice(size, toppings)));
      }
    }
  });

  test('AC-1.3 removing a topping lowers the price again', async ({ page }) => {
    await page.goto('/');
    await selectPizza(page, { size: 'large', toppings: ['pepperoni', 'onions'] });
    await expect(price(page)).toHaveText('$18.00');
    await selectPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await expect(price(page)).toHaveText('$16.00');
    await selectPizza(page, { size: 'large', toppings: [] });
    await expect(price(page)).toHaveText('$14.00');
  });
});

test.describe('Ordering: reviewing the order (Req 2)', () => {
  test('AC-2.1 plain cheese pizza can be added and is described as plain cheese', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'small', toppings: [] });
    await expect(cartPanel(page).locator('.line')).toHaveCount(1);
    await expect(cartPanel(page)).toContainText(/plain cheese/i);
    await expect(cartPanel(page).locator('.total')).toContainText('$10.00');
  });

  test('AC-2.1/2.2 several different pizzas show details, line price and the total', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni', 'mushrooms'] });
    await addPizza(page, { size: 'small', toppings: ['onions'] });
    await addPizza(page, { size: 'small', toppings: [] });
    const lines = cartPanel(page).locator('.line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toContainText('The Massacre');
    await expect(lines.nth(0)).toContainText('Pepperoni of Doom');
    await expect(lines.nth(0)).toContainText('Creeping Fungus');
    await expect(lines.nth(0)).toContainText('$18.00');
    await expect(lines.nth(1)).toContainText('Onions of Tears');
    await expect(lines.nth(1)).toContainText('$12.00');
    await expect(lines.nth(2)).toContainText('$10.00');
    await expect(cartPanel(page).locator('.total')).toContainText('$40.00');
  });

  test('adding an identical pizza twice merges into quantity 2', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['onions'] });
    await addPizza(page, { size: 'large', toppings: ['onions'] });
    await expect(cartPanel(page).locator('.line')).toHaveCount(1);
    await expect(cartPanel(page).locator('input[type=number]')).toHaveValue('2');
    await expect(cartPanel(page).locator('.total')).toContainText('$32.00');
  });

  test('the same toppings in a different click order still merge', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Onions of Tears/).check();
    await page.getByLabel(/Pepperoni of Doom/).check();
    await page.getByRole('button', { name: 'Add to Order' }).click();
    await page.getByLabel(/Pepperoni of Doom/).check();
    await page.getByLabel(/Onions of Tears/).check();
    await page.getByRole('button', { name: 'Add to Order' }).click();
    await expect(cartPanel(page).locator('.line')).toHaveCount(1);
  });

  test('toppings are cleared after a pizza is added so the next one starts fresh', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni', 'onions'] });
    for (const box of await page.locator('input[type=checkbox]').all()) await expect(box).not.toBeChecked();
    await expect(price(page)).toHaveText('$14.00');
  });

  test('AC-2.3 changing quantity updates the line price and total', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await addPizza(page, { size: 'small' });
    const qty = cartPanel(page).locator('input[type=number]').first();
    await qty.fill('3');
    await qty.press('Tab');
    await expect(cartPanel(page).locator('.line').first()).toContainText('$48.00');
    await expect(cartPanel(page).locator('.total')).toContainText('$58.00');
  });

  for (const [typed, expected] of [['0', '1'], ['-3', '1'], ['2.7', '2'], ['150', '99'], ['', '1']]) {
    test(`AC-2.3 quantity input "${typed}" is corrected to ${expected}`, async ({ page }) => {
      await page.goto('/');
      await addPizza(page, { size: 'small' });
      const qty = cartPanel(page).locator('input[type=number]');
      await qty.fill(typed);
      await qty.press('Tab');
      await expect(qty).toHaveValue(expected);
      await expect(cartPanel(page).locator('.total')).toContainText(money(1000 * Number(expected)));
    });
  }

  test('AC-2.3 removing a pizza updates the total; removing all empties the cart', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large' });
    await addPizza(page, { size: 'small', toppings: ['onions'] });
    await expect(cartPanel(page).locator('.total')).toContainText('$26.00');
    await cartPanel(page).getByRole('button', { name: 'Remove' }).first().click();
    await expect(cartPanel(page).locator('.line')).toHaveCount(1);
    await expect(cartPanel(page).locator('.total')).toContainText('$12.00');
    await cartPanel(page).getByRole('button', { name: 'Remove' }).click();
    await expect(cartPanel(page).locator('.line')).toHaveCount(0);
    await expect(cartPanel(page).locator('.total')).toContainText('$0.00');
    await expect(page.getByRole('button', { name: 'Place Order' })).toBeDisabled();
  });
});

test.describe('Ordering: placing the order (Req 3)', () => {
  test('AC-3.1 cannot submit an empty order, even with a name', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your name (for pickup)').fill('Michael');
    await expect(page.getByRole('button', { name: 'Place Order' })).toBeDisabled();
  });

  test('AC-3.1 cannot submit without a name, or with only spaces', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    const place = page.getByRole('button', { name: 'Place Order' });
    await expect(place).toBeDisabled();
    await page.getByLabel('Your name (for pickup)').fill('     ');
    await expect(place).toBeDisabled();
    await page.getByLabel('Your name (for pickup)').fill('Jason');
    await expect(place).toBeEnabled();
  });

  test('AC-3.2 confirmation shows order number, name, items and total', async ({ page }) => {
    const name = unique('Laurie');
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni', 'peppers'] });
    await addPizza(page, { size: 'small' });
    await placeOrder(page, name);
    const box = page.locator('.success');
    await expect(box).toContainText('Your order was placed successfully.');
    await expect(box.locator('.num')).toHaveText(/Order #\d+/);
    await expect(box).toContainText(name);
    await expect(box).toContainText('The Massacre');
    await expect(box).toContainText('Pepperoni of Doom');
    await expect(box).toContainText('Swamp Thing Green Peppers');
    await expect(box).toContainText('The Final Girl');
    await expect(box.locator('.total')).toContainText('$28.00');
  });

  test('AC-3.2 the confirmation total uses quantities', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['onions'] });
    const qty = cartPanel(page).locator('input[type=number]');
    await qty.fill('4');
    await qty.press('Tab');
    await placeOrder(page, unique());
    await expect(page.locator('.success .total')).toContainText('$64.00');
    await expect(page.locator('.success')).toContainText('4 x');
  });

  test('order numbers are unique and increase for consecutive orders', async ({ page }) => {
    const a = await orderThroughUi(page, unique());
    const b = await orderThroughUi(page, unique());
    expect(b).toBeGreaterThan(a);
  });

  test('"Order Again" returns to an empty form', async ({ page }) => {
    await orderThroughUi(page, unique());
    await page.getByRole('button', { name: 'Order Again' }).click();
    await expect(page.getByRole('heading', { name: 'Build Your Nightmare' })).toBeVisible();
    await expect(cartPanel(page).locator('.line')).toHaveCount(0);
    await expect(page.getByLabel('Your name (for pickup)')).toHaveValue('');
  });

  test('confirmation says payment is at the counter (no online payment)', async ({ page }) => {
    await orderThroughUi(page, unique());
    await expect(page.locator('.success')).toContainText(/counter/i);
  });

  test('double-clicking Place Order creates only one order', async ({ page, request }) => {
    const name = unique('Double');
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    await page.getByLabel('Your name (for pickup)').fill(name);
    await page.getByRole('button', { name: 'Place Order' }).dblclick({ force: true }).catch(() => {});
    await page.getByText('Your order was placed successfully.').waitFor();
    const orders = await (await request.get('/api/orders')).json();
    expect(orders.filter((o) => o.name === name)).toHaveLength(1);
  });

  test('name field stops at 80 characters', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    await page.getByLabel('Your name (for pickup)').fill('x'.repeat(200));
    const value = await page.getByLabel('Your name (for pickup)').inputValue();
    expect(value.length).toBeLessThanOrEqual(80);
  });

  test('surrounding spaces are trimmed from the name', async ({ page }) => {
    const name = unique('Trim');
    await page.goto('/');
    await addPizza(page, { size: 'small' });
    await placeOrder(page, `   ${name}   `);
    await expect(page.locator('.success p', { hasText: 'Name:' }).locator('strong')).toHaveText(name);
  });

  for (const [label, name] of [
    ["apostrophe", "O'Brien-"],
    ['unicode and emoji', 'Zoë 🎃 '],
    ['SQL-like text', "Robert'); DROP TABLE orders;--"],
  ]) {
    test(`names with ${label} are saved and shown exactly`, async ({ page }) => {
      const full = name + Math.random().toString(36).slice(2, 6);
      await orderThroughUi(page, full);
      await expect(page.locator('.success')).toContainText(full);
      await page.goto('/kitchen');
      await expect(page.locator('article', { hasText: full }).first()).toBeVisible();
    });
  }

  test('HTML in the name is shown as text and never executed', async ({ page }) => {
    const evil = `<img src=x onerror="window.__xss=1"><b>bold</b>${Math.random().toString(36).slice(2, 6)}`;
    await orderThroughUi(page, evil);
    await expect(page.locator('.success')).toContainText(evil);
    await page.goto('/kitchen');
    await expect(page.locator('article', { hasText: evil }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator('article b')).toHaveCount(0);
  });
});

test.describe('Ordering: scope and quality (Req 5)', () => {
  test('no out-of-scope features appear on the order page or confirmation', async ({ page }) => {
    await page.goto('/');
    const banned = /\b(tax|delivery|deliver|coupon|promo code|loyalty|rewards|sign in|log in|login|register|create account|credit card|card number)\b/i;
    expect(await page.locator('body').innerText()).not.toMatch(banned);
    await orderThroughUi(page, unique());
    expect(await page.locator('body').innerText()).not.toMatch(banned);
  });

  test('the whole ordering flow produces no console errors and no failed requests', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
    await orderThroughUi(page, unique(), [{ size: 'large', toppings: ['onions'] }, { size: 'small' }]);
    await page.goto('/kitchen');
    await page.locator('article').first().waitFor();
    expect(problems).toEqual([]);
  });

  test('the page has a title and a labelled name field', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Elm St Pizza/);
    await expect(page.getByLabel('Your name (for pickup)')).toBeVisible();
  });

  test('order page has no horizontal scrolling on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni', 'mushrooms', 'onions', 'peppers'] });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('unknown page paths still show the app instead of an error', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'Elm St Pizza' })).toBeVisible();
  });
});
