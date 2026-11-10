const { test, expect } = require('@playwright/test');
const { unique } = require('./helpers.cjs');

const good = (over = {}) => ({
  name: unique('Api'),
  items: [{ size: 'small', toppings: [], quantity: 1 }],
  ...over,
});

test.describe('API: menu and valid orders', () => {
  test('menu matches the requirements document exactly', async ({ request }) => {
    const menu = await (await request.get('/api/menu')).json();
    expect(menu.sizes.map((s) => [s.id, s.cents])).toEqual([['small', 1000], ['large', 1400]]);
    expect(menu.toppings).toHaveLength(4);
    for (const t of menu.toppings) expect(t.cents).toBe(200);
    expect(menu.toppings.map((t) => t.plain)).toEqual(['Pepperoni', 'Mushrooms', 'Onions', 'Green peppers']);
  });

  test('a valid order returns 201 with number, name, items and a server-computed total', async ({ request }) => {
    const body = good({
      items: [
        { size: 'large', toppings: ['pepperoni', 'onions'], quantity: 2 },
        { size: 'small', toppings: [], quantity: 1 },
      ],
    });
    const res = await request.post('/api/orders', { data: body });
    expect(res.status()).toBe(201);
    const o = await res.json();
    expect(o.id).toBeGreaterThan(0);
    expect(o.name).toBe(body.name);
    expect(o.status).toBe('New');
    expect(o.totalCents).toBe(1800 * 2 + 1000);
    expect(o.items).toHaveLength(2);
  });

  test('the server ignores any total or price sent by the client', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: good({ totalCents: 1, total: 1, items: [{ size: 'large', toppings: [], quantity: 1, lineCents: 1, price: 1 }] }),
    });
    expect((await res.json()).totalCents).toBe(1400);
  });

  test('duplicate toppings in one pizza are only charged once', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: good({ items: [{ size: 'small', toppings: ['pepperoni', 'pepperoni'], quantity: 1 }] }),
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).totalCents).toBe(1200);
  });

  test('quantity 99 is accepted and priced correctly', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: good({ items: [{ size: 'large', toppings: ['pepperoni', 'mushrooms', 'onions', 'peppers'], quantity: 99 }] }),
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).totalCents).toBe(2200 * 99);
  });

  test('a new order is listed by GET /api/orders with status New', async ({ request }) => {
    const created = await (await request.post('/api/orders', { data: good() })).json();
    const list = await (await request.get('/api/orders')).json();
    const found = list.find((o) => o.id === created.id);
    expect(found.status).toBe('New');
    expect(found.name).toBe(created.name);
  });
});

test.describe('API: invalid orders must be rejected with 400 and a JSON error', () => {
  const cases = [
    ['no body fields at all', {}],
    ['missing name', { items: [{ size: 'small', toppings: [], quantity: 1 }] }],
    ['empty name', good({ name: '' })],
    ['spaces-only name', good({ name: '    ' })],
    ['numeric name', good({ name: 12345 })],
    ['null name', good({ name: null })],
    ['missing items', { name: 'X' }],
    ['empty items list', good({ items: [] })],
    ['items is not a list', good({ items: 'small' })],
    ['items is null', good({ items: null })],
    ['unknown size', good({ items: [{ size: 'medium', toppings: [], quantity: 1 }] })],
    ['missing size', good({ items: [{ toppings: [], quantity: 1 }] })],
    ['unknown topping', good({ items: [{ size: 'small', toppings: ['anchovies'], quantity: 1 }] })],
    ['quantity 0', good({ items: [{ size: 'small', toppings: [], quantity: 0 }] })],
    ['negative quantity', good({ items: [{ size: 'small', toppings: [], quantity: -1 }] })],
    ['fractional quantity', good({ items: [{ size: 'small', toppings: [], quantity: 1.5 }] })],
    ['quantity above 99', good({ items: [{ size: 'small', toppings: [], quantity: 100 }] })],
    ['quantity is text', good({ items: [{ size: 'small', toppings: [], quantity: 'many' }] })],
    ['missing quantity', good({ items: [{ size: 'small', toppings: [] }] })],
    ['one good item and one bad item', good({ items: [{ size: 'small', toppings: [], quantity: 1 }, { size: 'huge', toppings: [], quantity: 1 }] })],
  ];
  for (const [label, data] of cases) {
    test(`rejects: ${label}`, async ({ request }) => {
      const res = await request.post('/api/orders', { data });
      expect(res.status()).toBe(400);
      const json = await res.json().catch(() => null);
      expect(json?.error).toBeTruthy();
    });
  }

  test('rejects: malformed JSON with a 400 and a JSON error body', async ({ request }) => {
    const res = await request.post('/api/orders', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"name": "oops", ',
    });
    expect(res.status()).toBe(400);
    const json = await res.json().catch(() => null);
    expect(json?.error).toBeTruthy();
  });

  test('rejects: toppings given as plain text instead of a list', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: good({ items: [{ size: 'small', toppings: 'pepperoni', quantity: 1 }] }),
    });
    expect(res.status()).toBe(400);
  });

  test('rejects: a 500-character name', async ({ request }) => {
    const res = await request.post('/api/orders', { data: good({ name: 'x'.repeat(500) }) });
    expect(res.status()).toBe(400);
  });

  test('a rejected order is not saved', async ({ request }) => {
    const name = unique('Ghost');
    await request.post('/api/orders', { data: { name, items: [] } });
    await request.post('/api/orders', { data: good({ name, items: [{ size: 'small', toppings: [], quantity: 0 }] }) });
    const list = await (await request.get('/api/orders')).json();
    expect(list.filter((o) => o.name === name)).toHaveLength(0);
  });

  test('a half-valid order saves nothing (all or nothing)', async ({ request }) => {
    const name = unique('Atomic');
    await request.post('/api/orders', {
      data: { name, items: [{ size: 'small', toppings: [], quantity: 1 }, { size: 'nope', toppings: [], quantity: 1 }] },
    });
    const list = await (await request.get('/api/orders')).json();
    expect(list.filter((o) => o.name === name)).toHaveLength(0);
  });
});

test.describe('API: updating order status', () => {
  test('PATCH marks an order Ready and keeps all other details', async ({ request }) => {
    const created = await (await request.post('/api/orders', { data: good() })).json();
    const res = await request.patch(`/api/orders/${created.id}`);
    expect(res.status()).toBe(200);
    const o = await res.json();
    expect(o.status).toBe('Ready');
    expect(o.name).toBe(created.name);
    expect(o.totalCents).toBe(created.totalCents);
    expect(o.items).toEqual(created.items);
  });

  test('marking Ready twice is harmless', async ({ request }) => {
    const created = await (await request.post('/api/orders', { data: good() })).json();
    await request.patch(`/api/orders/${created.id}`);
    const again = await request.patch(`/api/orders/${created.id}`);
    expect(again.status()).toBe(200);
    expect((await again.json()).status).toBe('Ready');
  });

  for (const id of ['999999', '0', '-1', 'abc', '1.5']) {
    test(`PATCH on unknown order id "${id}" returns 404 with a JSON error`, async ({ request }) => {
      const res = await request.patch(`/api/orders/${id}`);
      expect(res.status()).toBe(404);
      expect((await res.json().catch(() => null))?.error).toBeTruthy();
    });
  }

  test('a status cannot be set to an arbitrary value by the client', async ({ request }) => {
    const created = await (await request.post('/api/orders', { data: good() })).json();
    const res = await request.patch(`/api/orders/${created.id}`, { data: { status: 'Cancelled' } });
    expect((await res.json()).status).toBe('Ready');
  });
});

test.describe('API: other behaviour', () => {
  test('unknown API paths return a JSON 404, not the web page', async ({ request }) => {
    const res = await request.get('/api/does-not-exist');
    expect(res.status()).toBe(404);
  });

  test('GET /api/orders lists orders with required fields', async ({ request }) => {
    await request.post('/api/orders', { data: good() });
    const list = await (await request.get('/api/orders')).json();
    expect(list.length).toBeGreaterThan(0);
    for (const o of list.slice(0, 5)) {
      expect(o).toEqual(expect.objectContaining({ id: expect.any(Number), name: expect.any(String), status: expect.stringMatching(/^(New|Ready)$/), totalCents: expect.any(Number) }));
      expect(Array.isArray(o.items)).toBe(true);
    }
  });

  test('every listed order total equals the sum of its line prices', async ({ request }) => {
    const list = await (await request.get('/api/orders')).json();
    for (const o of list) expect(o.items.reduce((s, i) => s + i.lineCents, 0)).toBe(o.totalCents);
  });

  test('many orders placed at the same time all get distinct numbers', async ({ request }) => {
    const results = await Promise.all(Array.from({ length: 15 }, () => request.post('/api/orders', { data: good() })));
    const ids = [];
    for (const r of results) {
      expect(r.status()).toBe(201);
      ids.push((await r.json()).id);
    }
    expect(new Set(ids).size).toBe(15);
  });
});
