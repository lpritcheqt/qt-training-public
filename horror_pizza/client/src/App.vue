<script setup>
import OrderView from './views/OrderView.vue';
import KitchenView from './views/KitchenView.vue';
import logo from './assets/logo.svg';
import bats from './assets/bats.svg';

const isKitchen = window.location.pathname.startsWith('/kitchen');
</script>

<template>
  <header class="banner">
    <img :src="logo" alt="Elm St Pizza skull logo" class="logo" />
    <div>
      <h1>Elm St Pizza</h1>
      <p class="tagline">Pickup pizza so good you won't fall asleep on it.</p>
    </div>
    <nav>
      <a v-if="isKitchen" href="/">Order Page</a>
      <a v-else href="/kitchen">Kitchen Crypt</a>
    </nav>
  </header>
  <img :src="bats" alt="" class="bats" />
  <main>
    <KitchenView v-if="isKitchen" />
    <OrderView v-else />
  </main>
</template>
