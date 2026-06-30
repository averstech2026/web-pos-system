import { state } from './state.js';
import { PRODUCTS } from '../services/catalog.js';
import { UPSELL_PRICE } from '../data/constants.js';
import { renderMenu } from '../ui/menu.js';
import { renderSearchResults } from '../ui/search.js';
import { renderVoiceResults } from '../ui/voice.js';
import { renderCart } from '../ui/cartView.js';
import { updateProductCartAction } from '../ui/product.js';

function isVoiceScreenActive() {
  return state.screen === 'voice';
}

// ─── Корзина ───────────────────────────────────────────────────
function getCartCount() {
  return Object.values(state.cart).reduce((s, q) => s + q, 0);
}

function getCartTotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (p) total += p.price * qty;
  }
  if (state.upsellAdded) total += UPSELL_PRICE;
  return total;
}

function getSubtotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (p) total += p.price * qty;
  }
  return total;
}

function addToCart(productId, qty = 1) {
  state.cart[productId] = (state.cart[productId] || 0) + qty;
  updateCartBadge();
  renderMenu();
  if (state.screen === 'search') renderSearchResults();
  if (isVoiceScreenActive()) renderVoiceResults();
  if (state.screen === 'product' && state.currentProduct?.id === productId) {
    updateProductCartAction();
  }
}

function setCartQty(productId, qty) {
  if (qty <= 0) delete state.cart[productId];
  else state.cart[productId] = qty;
  updateCartBadge();
  if (state.screen === 'menu') renderMenu();
  if (state.screen === 'search') renderSearchResults();
  if (isVoiceScreenActive()) renderVoiceResults();
  if (state.screen === 'cart') renderCart();
  if (state.screen === 'product' && state.currentProduct?.id === productId) {
    updateProductCartAction();
  }
}

function updateCartBadge() {
  const count = getCartCount();
  document.querySelectorAll('[data-cart-badge]').forEach(badge => {
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    }
  });
}

import { formatPrice, cartIconSvg, getCartItemLabel, cartQtyControl } from './format.js';

export {
  getCartCount,
  getCartTotal,
  getSubtotal,
  addToCart,
  setCartQty,
  updateCartBadge,
  formatPrice,
  cartIconSvg,
  getCartItemLabel,
  cartQtyControl,
};
