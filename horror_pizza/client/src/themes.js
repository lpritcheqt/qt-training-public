// Theme definitions. Prices are NOT here: they always come from the server menu.
// Only wording, item names and graphics change per theme. The shop name stays "Elm St Pizza".
import logoHorror from './assets/logo.svg';
import pizzaHorror from './assets/pizza.svg';
import decoHorror from './assets/bats.svg';
import logoUnicorn from './assets/logo-unicorn.svg';
import pizzaUnicorn from './assets/pizza-unicorn.svg';
import decoUnicorn from './assets/deco-rainbow.svg';
import logoQt from './assets/logo-qt.svg';
import pizzaQt from './assets/pizza-qt.svg';
import decoQt from './assets/deco-qt.svg';

export const DEFAULT_THEME = 'horror';

export const THEMES = [
  {
    id: 'horror',
    label: 'Horror',
    tagline: "Pickup pizza so good you won't fall asleep on it.",
    logo: logoHorror,
    logoAlt: 'Elm St Pizza skull logo',
    pizza: pizzaHorror,
    deco: decoHorror,
    text: {
      buildHeading: 'Build Your Nightmare',
      cartHeading: 'Your Doomed Order',
      successHeading: 'Your Fate Is Sealed!',
      emptyCart: 'Nothing here yet. The kitchen is hungry...',
      payNote: 'Pay at the counter when you arrive for pickup. If you dare.',
      namePlaceholder: 'Name on the tombstone',
      kitchenHeading: 'Kitchen Crypt',
      kitchenEmpty: 'No orders yet. The dead are quiet.',
    },
    sizes: { small: 'The Final Girl', large: 'The Massacre' },
    toppings: {
      pepperoni: 'Pepperoni of Doom',
      mushrooms: 'Creeping Fungus',
      onions: 'Onions of Tears',
      peppers: 'Swamp Thing Green Peppers',
    },
  },
  {
    id: 'unicorn',
    label: 'Unicorns & Rainbows',
    tagline: 'Pickup pizza that is pure magic.',
    logo: logoUnicorn,
    logoAlt: 'Elm St Pizza unicorn logo',
    pizza: pizzaUnicorn,
    deco: decoUnicorn,
    text: {
      buildHeading: 'Build Your Magical Pizza',
      cartHeading: 'Your Rainbow Order',
      successHeading: "It's Magic! Your Order Is In!",
      emptyCart: 'Nothing here yet. The unicorns are waiting...',
      payNote: 'Pay at the counter when you arrive for pickup. Sparkles are free!',
      namePlaceholder: 'Name on the rainbow',
      kitchenHeading: 'Kitchen Rainbow Room',
      kitchenEmpty: 'No orders yet. The unicorns are napping.',
    },
    sizes: { small: 'Little Sparkle', large: 'Grand Rainbow' },
    toppings: {
      pepperoni: 'Rainbow Pepperoni Pops',
      mushrooms: 'Fairy Ring Mushrooms',
      onions: 'Sparkle Onions',
      peppers: 'Glitter Green Peppers',
    },
  },
  {
    id: 'quiktrip',
    label: 'QuikTrip Corporation',
    tagline: 'Extraordinary service with a smile.',
    logo: logoQt,
    logoAlt: 'Elm St Pizza pizza icon',
    pizza: pizzaQt,
    deco: decoQt,
    text: {
      buildHeading: 'Build your pizza',
      cartHeading: 'Your order',
      successHeading: 'Thanks! Your order is in.',
      emptyCart: 'Nothing here yet. Add a pizza to get started.',
      payNote: 'Pay at the counter when you arrive for pickup. Hurry back!',
      namePlaceholder: 'Your name',
      kitchenHeading: 'Kitchen',
      kitchenEmpty: 'No orders yet.',
    },
    sizes: { small: 'The Quick Grab', large: 'The Full Tank' },
    toppings: {
      pepperoni: 'Pit Stop Pepperoni',
      mushrooms: 'Fresh Stop Mushrooms',
      onions: 'Road Trip Onions',
      peppers: 'Green Light Peppers',
    },
  },
];
