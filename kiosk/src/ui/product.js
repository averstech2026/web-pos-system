import { state } from '../core/state.js';
import { CATEGORIES, PRODUCTS } from '../services/catalog.js';
import { cartIconSvg } from '../core/format.js';
import { navigateTo } from '../core/navigation.js';

// ─── Открыть карточку товара ───────────────────────────────────
function updateProductCartAction() {
  const el = document.getElementById('product-cart-action');
  const p = state.currentProduct;
  if (!el || !p) return;
  const qty = state.cart[p.id] || 0;
  el.innerHTML = qty === 0 ? `
    <button type="button" data-action="add-to-cart" data-product="${p.id}"
            class="btn-press w-full bg-navy text-white text-[28px] font-bold uppercase tracking-wide py-5 px-8 rounded-2xl flex items-center justify-center gap-3">
      ${cartIconSvg('w-8 h-8')}
      В корзину
    </button>` : `
    <div class="flex items-center bg-gray-200 rounded-2xl overflow-hidden">
      <button type="button" data-action="dec-cart" data-product="${p.id}"
              class="btn-press w-16 h-[72px] text-[32px] font-bold text-gray-600 flex items-center justify-center shrink-0">−</button>
      <span class="flex-1 h-[72px] text-center text-[32px] font-bold bg-white flex items-center justify-center mx-0.5">${qty}</span>
      <button type="button" data-action="inc-cart" data-product="${p.id}"
              class="btn-press w-16 h-[72px] text-[32px] font-bold text-gray-600 flex items-center justify-center shrink-0">+</button>
    </div>`;
}

function openProduct(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  state.currentProduct = p;
  document.getElementById('product-image').src = p.image;
  document.getElementById('product-image').alt = p.name;
  document.getElementById('product-title').textContent = p.name;
  document.getElementById('product-composition').textContent = p.composition || '—';
  const catLabel = CATEGORIES.find(c => c.id === p.category)?.label || '';
  document.getElementById('product-category').innerHTML = `
    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z"/></svg>
    ${catLabel.toUpperCase()}`;
  updateProductCartAction();
  navigateTo('product');
}

export {
  updateProductCartAction,
  openProduct,
};
