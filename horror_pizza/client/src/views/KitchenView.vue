<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const orders = ref([]);
const menu = ref({ sizes: [], toppings: [] });
const error = ref('');
let timer;

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const sizeOf = (id) => menu.value.sizes.find((s) => s.id === id);
const toppingOf = (id) => menu.value.toppings.find((t) => t.id === id);

async function load() {
  try {
    const res = await fetch('/api/orders');
    orders.value = await res.json();
    error.value = '';
  } catch {
    error.value = 'Cannot reach the server.';
  }
}

async function markReady(o) {
  const res = await fetch(`/api/orders/${o.id}`, { method: 'PATCH' });
  if (res.ok) o.status = 'Ready';
  else error.value = 'Could not update that order.';
}

onMounted(async () => {
  menu.value = await (await fetch('/api/menu')).json();
  await load();
  timer = setInterval(load, 10000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <section class="panel">
    <h2>Kitchen Crypt</h2>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <p v-if="!orders.length" class="plain">No orders yet. The dead are quiet.</p>
    <article v-for="o in orders" :key="o.id" class="panel" style="margin-bottom: 0.75rem">
      <div class="order-head">
        <strong>Order #{{ o.id }}</strong>
        <span>{{ o.name }}</span>
        <span class="status" :class="o.status">{{ o.status }}</span>
        <span class="spacer price-big">{{ money(o.totalCents) }}</span>
        <button v-if="o.status === 'New'" @click="markReady(o)">Mark Ready</button>
      </div>
      <ul class="plain-list">
        <li v-for="(l, i) in o.items" :key="i">
          {{ l.quantity }} x {{ sizeOf(l.size)?.name }} <small>({{ sizeOf(l.size)?.plain }})</small>:
          {{ l.toppings.length ? l.toppings.map((t) => toppingOf(t)?.name).join(', ') : 'Plain cheese' }}
        </li>
      </ul>
    </article>
  </section>
</template>
