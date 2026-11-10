const { test, expect } = require('@playwright/test');

// In watch mode (SLOWMO set), hold the finished page open for 3x the slow-motion delay.
test.afterEach(async ({ page }) => {
  const slow = Number(process.env.SLOWMO) || 0;
  if (slow) await page.waitForTimeout(slow * 3);
});

const price = (page) => page.locator('.price-big').first();

test('AC-1.x price updates with size and toppings', async ({ page }) => {
  await page.goto('/');
  await expect(price(page)).toHaveText('$10.00');
  await page.getByLabel(/Pepperoni of Doom/).check();
  await expect(price(page)).toHaveText('$12.00');
  await page.getByLabel(/The Massacre/).check();
  await expect(price(page)).toHaveText('$16.00');
  await page.getByLabel(/Pepperoni of Doom/).uncheck();
  await expect(price(page)).toHaveText('$14.00');
});

test('AC-2.x cart, qty, remove; AC-3.x validation, confirmation; AC-4.x kitchen', async ({ page }) => {
  await page.goto('/');
  const place = page.getByRole('button', { name: 'Place Order' });
  await expect(place).toBeDisabled(); // empty order

  await page.getByLabel(/The Massacre/).check();
  await page.getByLabel(/Pepperoni of Doom/).check();
  await page.getByLabel(/Creeping Fungus/).check();
  await page.getByRole('button', { name: 'Add to Order' }).click();
  await page.getByLabel(/The Final Girl/).check();
  await page.getByRole('button', { name: 'Add to Order' }).click();
  await expect(page.locator('.panel .line .info strong')).toHaveCount(2);
  await expect(page.locator('.total').last()).toContainText('$28.00'); // 18 + 10

  await expect(place).toBeDisabled(); // no name
  const qty = page.locator('input[type=number]').nth(1);
  await qty.fill('2');
  await qty.press('Tab');
  await expect(page.locator('.total').last()).toContainText('$38.00');
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.locator('.total').last()).toContainText('$20.00');

  await page.getByLabel(/Your name/).fill('Ghostface');
  await place.click();
  await expect(page.getByText('Your order was placed successfully.')).toBeVisible();
  await expect(page.getByText(/Order #\d+/)).toBeVisible();
  await expect(page.getByText('Ghostface')).toBeVisible();
  await expect(page.locator('.success .total')).toContainText('$20.00');

  await page.goto('/kitchen');
  const card = page.locator('article', { hasText: 'Ghostface' }).first();
  await expect(card).toContainText('New');
  await expect(card).toContainText('$20.00');
  await card.getByRole('button', { name: 'Mark Ready' }).click();
  await expect(card.locator('.status')).toHaveText('Ready');
  await page.reload();
  await expect(page.locator('article', { hasText: 'Ghostface' }).first().locator('.status')).toHaveText('Ready');
});

test('theme is horror, not fantasy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Slashers' Slice" })).toBeVisible();
  await page.screenshot({ path: 'test-results/order-page.png', fullPage: true });
});
