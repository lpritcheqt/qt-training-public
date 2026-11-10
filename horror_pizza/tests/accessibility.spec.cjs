const { test, expect } = require('@playwright/test');
const { unique, placeOrder, kitchenCard } = require('./helpers.cjs');

// The shared addPizza helper looks for the horror item names, so use High Contrast names here.
const HC_SIZE = { small: /Small Pizza/, large: /Large Pizza/ };
const HC_TOPPING = { pepperoni: /Pepperoni/, mushrooms: /Mushrooms/, onions: /Onions/, peppers: /Green Peppers/ };
async function addPizza(page, { size = 'small', toppings = [] } = {}) {
  await page.getByLabel(HC_SIZE[size]).check();
  for (const id of Object.keys(HC_TOPPING)) await page.getByLabel(HC_TOPPING[id]).setChecked(toppings.includes(id));
  await page.getByRole('button', { name: 'Add to Order' }).click();
}

// WCAG 2.2 checks for the High Contrast theme.
//   1.4.6  Contrast (Enhanced, AAA): text at least 7:1
//   1.4.11 Non-text Contrast (AA): control borders and focus indicators at least 3:1
//   1.4.10 Reflow: no sideways scrolling at 320 CSS px wide
//   2.4.7 / 2.4.13 Focus visible and appearance
//   2.5.8  Target size (AA): at least 24 x 24 CSS px
//   1.4.1  Use of color: status is also given in words
//   1.1.1  Non-text content: informative images have alt text, decorative images have empty alt

const pickHc = async (page) => {
  await page.goto('/');
  await page.getByLabel('Theme').selectOption('high-contrast');
};

// Runs in the browser: contrast ratio of an element's text color against its real background.
async function contrastOf(page, locator) {
  return locator.evaluate((el) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let bg = null;
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) { bg = c; break; }
    }
    bg = bg || { r: 255, g: 255, b: 255 };
    const fg = parse(getComputedStyle(el).color);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

async function borderContrastOf(page, locator) {
  return locator.evaluate((el) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x));
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let bg = null;
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) { bg = c; break; }
    }
    bg = bg || { r: 255, g: 255, b: 255 };
    const border = parse(getComputedStyle(el).borderTopColor);
    const [hi, lo] = [lum(border), lum(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

test.describe('High Contrast theme: WCAG 2.2', () => {
  test('1.4.6 all order-page text meets 7:1 contrast', async ({ page }) => {
    await pickHc(page);
    await addPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await page.getByLabel('Your name (for pickup)').fill('Reader');
    const targets = {
      'shop name': page.getByRole('heading', { name: 'Elm St Pizza' }),
      tagline: page.locator('.tagline'),
      'section heading': page.getByRole('heading', { name: 'Build your pizza' }),
      'sub heading': page.getByRole('heading', { name: 'Size' }),
      'option name': page.locator('label.opt').first(),
      'option price': page.locator('label.opt .price').first(),
      'small text': page.locator('label.opt small').first(),
      'help text': page.locator('p.plain').first(),
      'big price': page.locator('.price-big').first(),
      'primary button': page.getByRole('button', { name: 'Add to Order' }),
      'enabled place button': page.getByRole('button', { name: 'Place Order' }),
      'remove link-button': page.getByRole('button', { name: 'Remove' }),
      'total': page.locator('.total').last(),
      'kitchen link': page.getByRole('link', { name: 'Kitchen' }),
      'theme label': page.locator('.theme-picker'),
      'theme select': page.getByLabel('Theme'),
      'name input': page.getByLabel('Your name (for pickup)'),
      'quantity input': page.locator('input[type=number]'),
    };
    for (const [label, loc] of Object.entries(targets)) {
      const ratio = await contrastOf(page, loc.first());
      expect(ratio, `${label}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(7);
    }
  });

  test('1.4.6 disabled Place Order button text is still readable (7:1)', async ({ page }) => {
    await pickHc(page);
    const btn = page.getByRole('button', { name: 'Place Order' });
    await expect(btn).toBeDisabled();
    expect(await contrastOf(page, btn)).toBeGreaterThanOrEqual(7);
  });

  test('1.4.6 placeholder text meets 7:1', async ({ page }) => {
    await pickHc(page);
    const ratio = await page.getByLabel('Your name (for pickup)').evaluate((el) => {
      const ph = getComputedStyle(el, '::placeholder').color;
      const bg = getComputedStyle(el).backgroundColor;
      const p = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const l = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const [hi, lo] = [l(p(ph)), l(p(bg))].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  test('1.4.6 confirmation and error text meet 7:1', async ({ page }) => {
    await pickHc(page);
    await page.route('**/api/orders', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
    await addPizza(page, { size: 'small' });
    await placeOrder(page, unique('Err'));
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    expect(await contrastOf(page, alert)).toBeGreaterThanOrEqual(7);
    expect(await borderContrastOf(page, alert)).toBeGreaterThanOrEqual(3);
    await page.unroute('**/api/orders');
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.locator('.success')).toBeVisible();
    for (const loc of [page.locator('.success h2'), page.locator('.success .num'), page.locator('.success p').first(), page.locator('.success .total')]) {
      expect(await contrastOf(page, loc)).toBeGreaterThanOrEqual(7);
    }
  });

  test('1.4.6 kitchen text, status badges and Mark Ready button meet 7:1', async ({ page }) => {
    const name = unique('Kitch');
    await pickHc(page);
    await addPizza(page, { size: 'small', toppings: ['onions'] });
    await placeOrder(page, name);
    await page.getByRole('link', { name: 'Kitchen' }).click();
    const card = kitchenCard(page, name);
    for (const loc of [
      page.getByRole('heading', { name: 'Kitchen' }),
      card.locator('strong').first(),
      card.locator('.status'),
      card.locator('.price-big'),
      card.getByRole('button', { name: 'Mark Ready' }),
      card.locator('li'),
      page.getByRole('link', { name: 'Order Page' }),
    ]) {
      expect(await contrastOf(page, loc.first())).toBeGreaterThanOrEqual(7);
    }
    await card.getByRole('button', { name: 'Mark Ready' }).click();
    await expect(card.locator('.status')).toHaveText('Ready');
    expect(await contrastOf(page, card.locator('.status'))).toBeGreaterThanOrEqual(7);
  });

  test('1.4.11 input, select and option borders have at least 3:1 contrast', async ({ page }) => {
    await pickHc(page);
    for (const loc of [page.getByLabel('Your name (for pickup)'), page.getByLabel('Theme'), page.locator('label.opt').first(), page.locator('section.panel').first()]) {
      expect(await borderContrastOf(page, loc)).toBeGreaterThanOrEqual(3);
    }
  });

  test('2.4.7/2.4.13 keyboard focus shows a thick, high-contrast outline on every control type', async ({ page }) => {
    await pickHc(page);
    await addPizza(page, { size: 'small' });
    await page.getByLabel('Your name (for pickup)').fill('Keys');
    const controls = [
      page.getByLabel('Theme'),
      page.getByRole('link', { name: 'Kitchen' }),
      page.getByLabel(/Small Pizza/),
      page.getByLabel(/Pepperoni/),
      page.getByRole('button', { name: 'Add to Order' }),
      page.locator('input[type=number]'),
      page.getByRole('button', { name: 'Remove' }),
      page.getByLabel('Your name (for pickup)'),
      page.getByRole('button', { name: 'Place Order' }),
    ];
    for (const c of controls) {
      await page.keyboard.press('Shift'); // keyboard use, so :focus-visible applies to script focus
      await c.focus();
      const o = await c.evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: parseFloat(s.outlineWidth), style: s.outlineStyle, color: s.outlineColor };
      });
      expect(o.style).not.toBe('none');
      expect(o.width).toBeGreaterThanOrEqual(3);
      expect(o.color).toBe('rgb(255, 255, 0)');
    }
  });

  test('2.1.1 the whole order can be completed using only the keyboard', async ({ page }) => {
    const name = unique('Kbd');
    await pickHc(page);
    await page.getByLabel(/Large Pizza/).focus();
    await page.keyboard.press('Space');
    await page.getByLabel(/Mushrooms/).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Add to Order' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Your name (for pickup)').focus();
    await page.keyboard.type(name);
    await page.getByRole('button', { name: 'Place Order' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.success')).toContainText(name);
    await expect(page.locator('.success .total')).toContainText('$16.00');
  });

  test('2.5.8 interactive controls are at least 24 x 24 px (this theme uses 44 px for buttons and fields)', async ({ page }) => {
    await pickHc(page);
    await addPizza(page, { size: 'small' });
    const controls = [
      page.getByLabel(/Large Pizza/), page.getByLabel(/Pepperoni/),
      page.getByRole('button', { name: 'Add to Order' }), page.getByRole('button', { name: 'Remove' }),
      page.getByRole('button', { name: 'Place Order' }), page.getByLabel('Your name (for pickup)'),
      page.locator('input[type=number]'), page.getByLabel('Theme'), page.getByRole('link', { name: 'Kitchen' }),
    ];
    for (const c of controls) {
      const box = await c.boundingBox();
      expect(box.width, 'width').toBeGreaterThanOrEqual(24);
      expect(box.height, 'height').toBeGreaterThanOrEqual(24);
    }
    for (const c of [page.getByRole('button', { name: 'Add to Order' }), page.getByRole('button', { name: 'Place Order' }), page.getByLabel('Your name (for pickup)')]) {
      expect((await c.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('1.4.10 no sideways scrolling at 320 px wide, on order, confirmation and kitchen pages', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await pickHc(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await addPizza(page, { size: 'large', toppings: ['pepperoni', 'mushrooms', 'onions', 'peppers'] });
    expect(await overflow()).toBeLessThanOrEqual(1);
    await placeOrder(page, unique('Narrow'));
    await page.locator('.success').waitFor();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.getByRole('link', { name: 'Kitchen' }).click();
    await page.locator('article').first().waitFor();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });

  test('1.4.4 text can be enlarged: browser text size at 200% still works with no overlap or cut-off', async ({ page }) => {
    await pickHc(page);
    await page.addStyleTag({ content: 'html { font-size: 225% !important; }' }); // 2x the theme's 112.5%
    await addPizza(page, { size: 'large', toppings: ['pepperoni'] });
    await page.getByLabel('Your name (for pickup)').fill('Big text');
    await expect(page.getByRole('button', { name: 'Place Order' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Place Order' }).click();
    await expect(page.locator('.success')).toBeVisible();
  });

  test('1.4.1 order status is given in words, not only color', async ({ page }) => {
    const name = unique('Words');
    await pickHc(page);
    await addPizza(page, { size: 'small' });
    await placeOrder(page, name);
    await page.getByRole('link', { name: 'Kitchen' }).click();
    const card = kitchenCard(page, name);
    await expect(card.locator('.status')).toHaveText('New');
    await card.getByRole('button', { name: 'Mark Ready' }).click();
    await expect(card.locator('.status')).toHaveText('Ready');
  });

  test('1.4.1 a selected option is shown by more than color (thicker outline)', async ({ page }) => {
    await pickHc(page);
    const selected = page.locator('label.opt', { hasText: 'Small Pizza' });
    const other = page.locator('label.opt', { hasText: 'Large Pizza' });
    const width = (l) => l.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    const style = (l) => l.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(await style(selected)).toBe('solid');
    expect(await width(selected)).toBeGreaterThanOrEqual(3);
    expect(await style(other)).toBe('none');
  });

  test('1.1.1 the logo has a text alternative and the banner strip is decorative', async ({ page }) => {
    await pickHc(page);
    await expect(page.getByRole('img', { name: /Elm St Pizza/ })).toBeVisible();
    await expect(page.locator('img.bats')).toHaveAttribute('alt', '');
  });

  test('1.3.1 form fields have labels, and the page has a single level-one heading', async ({ page }) => {
    await pickHc(page);
    await expect(page.getByLabel('Your name (for pickup)')).toBeVisible();
    await expect(page.getByLabel('Theme')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('3.3.1 an error is announced to assistive technology (alert role) and says what went wrong', async ({ page }) => {
    await pickHc(page);
    await page.route('**/api/orders', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
    await addPizza(page, { size: 'small' });
    await placeOrder(page, unique('Err'));
    await expect(page.getByRole('alert')).toContainText(/NOT placed/);
  });
});
