<script setup>
import { ref, computed, onMounted } from 'vue';
import pizzaImg from '../assets/pizza.svg';

const menu = ref({ sizes: [], toppings: [] });
const size = ref('small');
const toppings = ref([]);
const cart = ref([]);
const name = ref('');
const error = ref('');
const submitting = ref(false);
const confirmation = ref(null);

onMounted(async () => {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('bad status');
    menu.value = await res.json();
  } catch {
    error.value = 'Sorry, the menu could not be loaded. Please refresh the page and try again.';
  }
});

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const sizeOf = (id) => menu.value.sizes.find((s) => s.id === id);
const toppingOf = (id) => menu.value.toppings.find((t) => t.id === id);

const unitCents = (sizeId, tops) =>
  (sizeOf(sizeId)?.cents ?? 0) + tops.reduce((s, id) => s + (toppingOf(id)?.cents ?? 0), 0);

const currentPrice = computed(() => unitCents(size.value, toppings.value));
const cartTotal = computed(() =>
  cart.value.reduce((s, l) => s + unitCents(l.size, l.toppings) * l.quantity, 0)
);

function describe(line) {
  const tops = line.toppings.map((id) => toppingOf(id)?.name);
  return tops.length ? tops.join(', ') : 'Plain cheese (no toppings)';
}

function addToOrder() {
  const sorted = menu.value.toppings.map((t) => t.id).filter((id) => toppings.value.includes(id));
  const existing = cart.value.find(
    (l) => l.size === size.value && l.toppings.join() === sorted.join()
  );
  if (existing) existing.quantity += 1;
  else cart.value.push({ size: size.value, toppings: sorted, quantity: 1 });
  toppings.value = [];
}

function setQty(line, value) {
  const q = Math.floor(Number(value));
  line.quantity = Number.isFinite(q) && q >= 1 ? Math.min(q, 99) : 1;
}
function remove(i) {
  cart.value.splice(i, 1);
}

async function submit() {
  error.value = '';
  if (!cart.value.length) return (error.value = 'Your order is empty. Add a pizza first.');
  if (!name.value.trim()) return (error.value = 'Please tell us your name.');
  submitting.value = true;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.value, items: cart.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    confirmation.value = data;
    cart.value = [];
    name.value = '';
  } catch (e) {
    error.value = `Your order was NOT placed: ${e.message}`;
  } finally {
    submitting.value = false;
  }
}

function newOrder() {
  confirmation.value = null;
}
</script>

<template>
  <section v-if="confirmation" class="panel success">
    <h2>Your Fate Is Sealed!</h2>
    <p>Your order was placed successfully.</p>
    <div class="num">Order #{{ confirmation.id }}</div>
    <p>Name: <strong>{{ confirmation.name }}</strong></p>
    <div style="text-align: left; max-width: 500px; margin: 0 auto">
      <div v-for="(l, i) in confirmation.items" :key="i" class="line">
        <div class="info">
          {{ l.quantity }} x {{ sizeOf(l.size)?.name }}
          <small>({{ sizeOf(l.size)?.plain }})</small><br />
          <small>{{ l.toppings.length ? l.toppings.map((t) => toppingOf(t)?.name).join(', ') : 'Plain cheese' }}</small>
        </div>
        <div>{{ money(l.lineCents) }}</div>
      </div>
      <div class="total"><span>Total</span><span>{{ money(confirmation.totalCents) }}</span></div>
    </div>
    <p>Pay at the counter when you arrive for pickup. If you dare.</p>
    <button @click="newOrder">Order Again</button>
  </section>

  <template v-else>
    <div class="grid2">
      <section class="panel">
        <h2>Build Your Nightmare</h2>
        <h3>Size</h3>
        <label v-for="s in menu.sizes" :key="s.id" class="opt">
          <input type="radio" v-model="size" :value="s.id" />
          <span>{{ s.name }} <small>{{ s.plain }}</small></span>
          <span class="price">{{ money(s.cents) }}</span>
        </label>
        <h3>Toppings <small>(+$2.00 each)</small></h3>
        <label v-for="t in menu.toppings" :key="t.id" class="opt">
          <input type="checkbox" v-model="toppings" :value="t.id" />
          <span>{{ t.name }} <small>{{ t.plain }}</small></span>
          <span class="price">+{{ money(t.cents) }}</span>
        </label>
        <p class="plain">No toppings selected means a plain cheese pizza.</p>
        <div class="line" style="border: 0">
          <img :src="pizzaImg" alt="" width="56" height="56" />
          <div class="info">Price of this pizza<br /><span class="price-big">{{ money(currentPrice) }}</span></div>
          <button @click="addToOrder">Add to Order</button>
        </div>
      </section>

      <section class="panel">
        <h2>Your Doomed Order</h2>
        <p v-if="!cart.length" class="plain">Nothing here yet. The kitchen is hungry...</p>
        <div v-for="(l, i) in cart" :key="i" class="line">
          <div class="info">
            <strong>{{ sizeOf(l.size)?.name }}</strong> <small>({{ sizeOf(l.size)?.plain }})</small><br />
            <small>{{ describe(l) }}</small><br />
            <small>{{ money(unitCents(l.size, l.toppings)) }} each</small>
          </div>
          <label>Qty
            <input type="number" min="1" max="99" :value="l.quantity" @change="setQty(l, $event.target.value); $event.target.value = l.quantity" />
          </label>
          <strong>{{ money(unitCents(l.size, l.toppings) * l.quantity) }}</strong>
          <button class="link" @click="remove(i)">Remove</button>
        </div>
        <div class="total"><span>Total</span><span>{{ money(cartTotal) }}</span></div>

        <label for="cust">Your name (for pickup)</label>
        <input id="cust" type="text" v-model="name" maxlength="80" placeholder="Name on the tombstone" />
        <div v-if="error" class="error" role="alert">{{ error }}</div>
        <p class="plain">Pickup only. Payment is collected at the counter.</p>
        <button :disabled="submitting || !cart.length || !name.trim()" @click="submit">Place Order</button>
      </section>
    </div>
  </template>
</template>
