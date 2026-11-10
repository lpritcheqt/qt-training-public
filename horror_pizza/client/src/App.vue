<script setup>
import OrderView from './views/OrderView.vue';
import KitchenView from './views/KitchenView.vue';
import logo from './assets/logo.svg';
import bats from './assets/bats.svg';

const isKitchen = window.location.pathname.startsWith('/kitchen');
</script>

<template>
  <header class="banner">
    <img :src="logo" alt="Slashers Slice skull logo" class="logo" />
    <div>
      <h1>Slashers' Slice</h1>
      <p class="tagline">Pickup pizza so good it's murder.</p>
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
