import { ref, computed, watch } from 'vue';
import { THEMES, DEFAULT_THEME } from './themes.js';

const KEY = 'elmst-theme';

function loadSaved() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    /* storage unavailable: use the default */
  }
  return DEFAULT_THEME;
}

// One shared selection for the whole app (order page and kitchen page).
const themeId = ref(loadSaved());
const theme = computed(() => THEMES.find((t) => t.id === themeId.value) ?? THEMES[0]);

document.documentElement.dataset.theme = themeId.value;
watch(themeId, (id) => {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
});

// Replaces item names with the current theme's names. Prices and ids are untouched.
function applyNames(menu) {
  const t = theme.value;
  return {
    sizes: menu.sizes.map((s) => ({ ...s, name: t.sizes[s.id] ?? s.name })),
    toppings: menu.toppings.map((x) => ({ ...x, name: t.toppings[x.id] ?? x.name })),
  };
}

export function useTheme() {
  return { themeId, theme, themes: THEMES, applyNames };
}
