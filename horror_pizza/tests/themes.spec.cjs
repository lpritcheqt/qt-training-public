const { test, expect } = require('@playwright/test');
const { unique, cartPanel, addPizza, placeOrder, kitchenCard } = require('./helpers.cjs');

const THEMES = {
  horror: {
    label: 'Horror',
    tagline: "Pickup pizza so good you won't fall asleep on it.",
    build: 'Build Your Nightmare',
    kitchen: 'Kitchen Crypt',
    small: 'The Final Girl', large: 'The Massacre',
    toppings: ['Pepperoni of Doom', 'Creeping Fungus', 'Onions of Tears', 'Swamp Thing Green Peppers'],
  },
  unicorn: {
    label: 'Unicorns & Rainbows',
    tagline: 'Pickup pizza that is pure magic.',
    build: 'Build Your Magical Pizza',
    kitchen: 'Kitchen Rainbow Room',
    small: 'Little Sparkle', large: 'Grand Rainbow',
    toppings: ['Rainbow Pepperoni Pops', 'Fairy Ring Mushrooms', 'Sparkle Onions', 'Glitter Green Peppers'],
  },
  quiktrip: {
    label: 'QuikTrip Corporation',
    tagline: 'Extraordinary service with a smile.',
    build: 'Build your pizza',
    kitchen: 'Kitchen',
    small: 'The Quick Grab', large: 'The Full Tank',
    toppings: ['Pit Stop Pepperoni', 'Fresh Stop Mushrooms', 'Road Trip Onions', 'Green Light Peppers'],
  },
};

const pick = (page, id) => page.getByLabel('Theme').selectOption(id);
const dataTheme = (page) => page.evaluate(() => document.documentElement.dataset.theme);

test.describe('Theme picker', () => {
  test('horror is the default theme and the picker lists all three themes', async ({ page }) => {
    await page.goto('/');
    expect(await dataTheme(page)).toBe('horror');
    await expect(page.getByLabel('Theme')).toHaveValue('horror');
    const options = await page.getByLabel('Theme').locator('option').allInnerTexts();
    expect(options).toEqual(['Horror', 'Unicorns & Rainbows', 'QuikTrip Corporation']);
  });

  test('the picker is on the public page but not on the kitchen page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Theme')).toBeVisible();
    await page.goto('/kitchen');
    await expect(page.getByLabel('Theme')).toHaveCount(0);
  });

  for (const [id, t] of Object.entries(THEMES)) {
    test(`${t.label}: shop name stays, tagline, headings and item names change`, async ({ page }) => {
      await page.goto('/');
      await pick(page, id);
      expect(await dataTheme(page)).toBe(id);
      await expect(page.getByRole('heading', { name: 'Elm St Pizza' })).toBeVisible();
      await expect(page.locator('.tagline')).toHaveText(t.tagline);
      await expect(page.getByRole('heading', { name: t.build })).toBeVisible();
      await expect(page.getByLabel(new RegExp(t.small))).toBeVisible();
      await expect(page.getByLabel(new RegExp(t.large))).toBeVisible();
      for (const name of t.toppings) await expect(page.getByLabel(new RegExp(name))).toBeVisible();
      await expect(page.getByRole('link', { name: t.kitchen })).toBeVisible();
    });
  }

  test('item names from other themes are not shown after switching', async ({ page }) => {
    await page.goto('/');
    await pick(page, 'unicorn');
    await expect(page.getByText('The Massacre')).toHaveCount(0);
    await expect(page.getByText('Pepperoni of Doom')).toHaveCount(0);
    await pick(page, 'quiktrip');
    await expect(page.getByText('Grand Rainbow')).toHaveCount(0);
  });

  test('prices and the plain item descriptions are identical in every theme', async ({ page }) => {
    await page.goto('/');
    const snapshots = [];
    for (const id of Object.keys(THEMES)) {
      await pick(page, id);
      const prices = await page.locator('label.opt .price').allInnerTexts();
      const plains = await page.locator('label.opt small').allInnerTexts();
      snapshots.push(JSON.stringify({ prices, plains }));
    }
    expect(new Set(snapshots).size).toBe(1);
    expect(JSON.parse(snapshots[0]).prices).toEqual(['$10.00', '$14.00', '+$2.00', '+$2.00', '+$2.00', '+$2.00']);
  });

  test('the live price is the same in every theme for the same pizza', async ({ page }) => {
    await page.goto('/');
    for (const [id, t] of Object.entries(THEMES)) {
      await pick(page, id);
      await page.getByLabel(new RegExp(t.large)).check();
      await page.getByLabel(new RegExp(t.toppings[0])).setChecked(true);
      await page.getByLabel(new RegExp(t.toppings[2])).setChecked(true);
      await expect(page.locator('.price-big').first()).toHaveText('$18.00');
      await page.getByLabel(new RegExp(t.toppings[0])).setChecked(false);
      await page.getByLabel(new RegExp(t.toppings[2])).setChecked(false);
    }
  });

  test('the cart keeps its pizzas and total when the theme is switched, with names updated', async ({ page }) => {
    await page.goto('/');
    await addPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await expect(cartPanel(page)).toContainText('The Massacre');
    await pick(page, 'unicorn');
    await expect(cartPanel(page)).toContainText('Grand Rainbow');
    await expect(cartPanel(page)).toContainText('Rainbow Pepperoni Pops');
    await expect(cartPanel(page).locator('.total')).toContainText('$16.00');
  });

  test('the chosen theme is remembered after a reload', async ({ page }) => {
    await page.goto('/');
    await pick(page, 'quiktrip');
    await page.reload();
    expect(await dataTheme(page)).toBe('quiktrip');
    await expect(page.getByLabel('Theme')).toHaveValue('quiktrip');
    await expect(page.locator('.tagline')).toHaveText(THEMES.quiktrip.tagline);
  });

  test('an unknown saved theme falls back to horror', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('elmst-theme', 'not-a-theme'));
    await page.goto('/');
    expect(await dataTheme(page)).toBe('horror');
    await expect(page.getByRole('heading', { name: 'Build Your Nightmare' })).toBeVisible();
  });

  test('a new visitor (no saved choice) gets horror, not the last visitor\'s theme', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await a.goto('/');
    await pick(a, 'unicorn');
    const b = await (await browser.newContext()).newPage();
    await b.goto('/');
    expect(await dataTheme(b)).toBe('horror');
    await a.context().close();
    await b.context().close();
  });

  test('themes look different: page and heading colors change', async ({ page }) => {
    await page.goto('/');
    const bg = async () => page.evaluate(() => getComputedStyle(document.body).backgroundImage + getComputedStyle(document.body).backgroundColor);
    const colors = new Set();
    for (const id of Object.keys(THEMES)) {
      await pick(page, id);
      colors.add(await bg());
    }
    expect(colors.size).toBe(3);
  });

  test('QuikTrip theme uses QT red as the accent color', async ({ page }) => {
    await page.goto('/');
    await pick(page, 'quiktrip');
    const color = await page.getByRole('button', { name: 'Add to Order' }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(color).toBe('rgb(207, 16, 45)');
  });
});

test.describe('Ordering and the kitchen in each theme', () => {
  for (const [id, t] of Object.entries(THEMES)) {
    test(`${t.label}: a full order works and the kitchen follows the same theme`, async ({ page }) => {
      const name = unique(id);
      await page.goto('/');
      await pick(page, id);
      await page.getByLabel(new RegExp(t.large)).check();
      await page.getByLabel(new RegExp(t.toppings[1])).check();
      await page.getByRole('button', { name: 'Add to Order' }).click();
      await placeOrder(page, name);
      await expect(page.locator('.success')).toContainText('Your order was placed successfully.');
      await expect(page.locator('.success')).toContainText(t.large);
      await expect(page.locator('.success')).toContainText(t.toppings[1]);
      await expect(page.locator('.success .total')).toContainText('$16.00');

      await page.getByRole('link', { name: t.kitchen }).click();
      await expect(page.getByRole('heading', { name: t.kitchen })).toBeVisible();
      const card = kitchenCard(page, name);
      await expect(card).toContainText(t.large);
      await expect(card).toContainText(t.toppings[1]);
      await expect(card).toContainText('$16.00');
      await card.getByRole('button', { name: 'Mark Ready' }).click();
      await expect(card.locator('.status')).toHaveText('Ready');
      await expect(page.getByRole('heading', { name: 'Elm St Pizza' })).toBeVisible();
    });
  }

  test('the stored order is theme independent: the same order shows different names per theme', async ({ page, request }) => {
    const name = unique('Neutral');
    await request.post('/api/orders', { data: { name, items: [{ size: 'small', toppings: ['onions'], quantity: 1 }] } });
    for (const [id, t] of Object.entries(THEMES)) {
      await page.goto('/');
      await pick(page, id);
      await page.goto('/kitchen');
      const card = kitchenCard(page, name);
      await expect(card).toContainText(t.small);
      await expect(card).toContainText(t.toppings[2]);
      await expect(card).toContainText('$12.00');
    }
  });

  test('the kitchen page shows no console errors in any theme', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    await page.goto('/');
    for (const id of Object.keys(THEMES)) {
      await pick(page, id);
      await page.goto('/kitchen');
      await page.waitForLoadState('networkidle');
      await page.goto('/');
    }
    expect(problems).toEqual([]);
  });

  test('no horizontal scrolling on a phone-sized screen in any theme', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    for (const id of Object.keys(THEMES)) {
      await pick(page, id);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, id).toBeLessThanOrEqual(1);
    }
  });
});
