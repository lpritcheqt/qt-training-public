import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { SIZES, TOPPINGS } from './menu.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use(express.json());

app.get('/api/menu', (_req, res) => res.json({ sizes: SIZES, toppings: TOPPINGS }));

function loadOrders(onlyId) {
  const orders = onlyId
    ? db.prepare('SELECT * FROM orders WHERE id = ?').all(onlyId)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
  return orders.map((o) => ({
    id: o.id,
    name: o.customer_name,
    status: o.status,
    createdAt: o.created_at,
    totalCents: o.total_cents,
    items: itemStmt.all(o.id).map((i) => ({
      size: i.size,
      toppings: JSON.parse(i.toppings),
      quantity: i.quantity,
      lineCents: i.line_cents,
    })),
  }));
}

app.post('/api/orders', (req, res) => {
  const rawName = req.body?.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const items = req.body?.items;
  if (!name) return res.status(400).json({ error: 'Please tell us your name.' });
  if (name.length > 80) return res.status(400).json({ error: 'Name must be 80 characters or fewer.' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Your order is empty.' });

  const lines = [];
  for (const it of items) {
    if (!it || typeof it !== 'object')
      return res.status(400).json({ error: 'Invalid item in order.' });
    const size = SIZES.find((s) => s.id === it.size);
    const qty = Number(it.quantity);
    if (it.toppings !== undefined && !Array.isArray(it.toppings))
      return res.status(400).json({ error: 'Invalid item in order.' });
    const ids = Array.isArray(it.toppings) ? [...new Set(it.toppings)] : [];
    const tops = ids.map((id) => TOPPINGS.find((t) => t.id === id));
    if (!size || !Number.isInteger(qty) || qty < 1 || qty > 99 || tops.includes(undefined))
      return res.status(400).json({ error: 'Invalid item in order.' });
    const unit = size.cents + tops.reduce((s, t) => s + t.cents, 0);
    lines.push({ size: size.id, toppings: tops.map((t) => t.id), quantity: qty, lineCents: unit * qty });
  }
  const total = lines.reduce((s, l) => s + l.lineCents, 0);

  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO orders (customer_name, total_cents) VALUES (?, ?)')
      .run(name, total);
    const ins = db.prepare(
      'INSERT INTO order_items (order_id, size, toppings, quantity, line_cents) VALUES (?, ?, ?, ?, ?)'
    );
    for (const l of lines)
      ins.run(lastInsertRowid, l.size, JSON.stringify(l.toppings), l.quantity, l.lineCents);
    db.exec('COMMIT');
    res.status(201).json(loadOrders(Number(lastInsertRowid))[0]);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Could not save your order.' });
  }
});

app.get('/api/orders', (_req, res) => res.json(loadOrders()));

app.patch('/api/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare("UPDATE orders SET status = 'Ready' WHERE id = ?").run(id);
  if (!r.changes) return res.status(404).json({ error: 'Order not found.' });
  res.json(loadOrders(id)[0]);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const dist = path.join(root, 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

// Malformed JSON bodies and other errors get a JSON response.
app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Elm St Pizza running at http://localhost:${port}`));
