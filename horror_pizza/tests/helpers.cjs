// Shared helpers for the Playwright specs. Not a spec file, so Playwright does not run it directly.

const SIZE = { small: /The Final Girl/, large: /The Massacre/ };
const TOPPING = {
  pepperoni: /Pepperoni of Doom/,
  mushrooms: /Creeping Fungus/,
  onions: /Onions of Tears/,
  peppers: /Swamp Thing Green Peppers/,
};
const TOPPING_IDS = Object.keys(TOPPING);

const unique = (prefix = 'Victim') => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const expectedPrice = (size, toppings) => (size === 'large' ? 1400 : 1000) + toppings.length * 200;

// The cart panel is the second section on the order page.
const cartPanel = (page) => page.locator('section.panel').nth(1);

async function selectPizza(page, { size = 'small', toppings = [] } = {}) {
  await page.getByLabel(SIZE[size]).check();
  for (const id of TOPPING_IDS) await page.getByLabel(TOPPING[id]).setChecked(toppings.includes(id));
}

async function addPizza(page, opts = {}) {
  await selectPizza(page, opts);
  await page.getByRole('button', { name: 'Add to Order' }).click();
}

async function placeOrder(page, name) {
  await page.getByLabel('Your name (for pickup)').fill(name);
  await page.getByRole('button', { name: 'Place Order' }).click();
}

// Builds an order through the real UI and returns the confirmation order number.
async function orderThroughUi(page, name, pizzas = [{ size: 'small' }]) {
  await page.goto('/');
  for (const p of pizzas) await addPizza(page, p);
  await placeOrder(page, name);
  await page.getByText('Your order was placed successfully.').waitFor();
  const text = await page.locator('.success .num').innerText();
  return Number(text.replace(/\D/g, ''));
}

const kitchenCard = (page, name) => page.locator('article', { hasText: name }).first();

module.exports = {
  SIZE, TOPPING, TOPPING_IDS, unique, money, expectedPrice, cartPanel,
  selectPizza, addPizza, placeOrder, orderThroughUi, kitchenCard,
};
