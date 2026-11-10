<script setup>
import OrderView from './views/OrderView.vue';
import KitchenView from './views/KitchenView.vue';
import { useTheme } from './useTheme.js';

const isKitchen = window.location.pathname.startsWith('/kitchen');
const { themeId, theme, themes } = useTheme();
</script>

<template>
  <header class="banner">
    <img :src="theme.logo" :alt="theme.logoAlt" class="logo" />
    <div>
      <h1>Elm St Pizza</h1>
      <p class="tagline">{{ theme.tagline }}</p>
    </div>
    <nav>
      <label v-if="!isKitchen" class="theme-picker">
        Theme
        <select v-model="themeId" aria-label="Theme">
          <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </label>
      <a v-if="isKitchen" href="/">Order Page</a>
      <a v-else href="/kitchen">{{ theme.text.kitchenHeading }}</a>
    </nav>
  </header>
  <img :src="theme.deco" alt="" class="bats" />
  <main>
    <KitchenView v-if="isKitchen" />
    <OrderView v-else />
  </main>
</template>
