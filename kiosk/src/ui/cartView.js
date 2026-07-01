import { state } from '../core/state.js';
import { PRODUCTS } from '../services/catalog.js';
import { formatPrice, getCartItemLabel, cartQtyControl } from '../core/format.js';
import { getSubtotal } from '../core/cart.js';
import { renderCartItemCompositionHtml } from '@shared/composite-order-display.js';

// ─── Рендер корзины ────────────────────────────────────────────
function renderCart() {
  const container = document.getElementById('cart-items');
  const ids = Object.keys(state.cart);
  if (!ids.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <svg class="w-24 h-24 text-gray-300 mb-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.5 5M17 13l2.5 5"/>
        </svg>
        <p class="text-[32px] text-gray-400 font-medium">Корзина пуста</p>
        <button data-action="go-menu" class="btn-press mt-8 bg-navy text-white text-[26px] font-bold uppercase px-12 py-5 rounded-full">
          Перейти в меню
        </button>
      </div>`;
  } else {
    container.innerHTML = ids.map(id => {
      const p = PRODUCTS.find(x => x.id === id);
      const qty = state.cart[id];
      const selections = state.compositeSelections?.[id];
      const compositionHtml = selections?.length
        ? renderCartItemCompositionHtml({ lunchSelections: selections }, { className: 'order-line-composition cart-composition' })
        : '';
      return `
        <div class="flex items-center gap-5 py-6 border-b border-gray-100 last:border-0">
          <img src="${p.image}" alt="" class="w-[108px] h-[108px] object-cover rounded-2xl shrink-0 bg-gray-100" />
          <div class="flex-1 min-w-0 pr-2">
            <p class="text-[26px] font-medium text-gray-800 leading-snug">${getCartItemLabel(p)}</p>
            ${compositionHtml}
          </div>
          ${cartQtyControl(id, qty)}
          <span class="text-[32px] font-extrabold text-navy w-[110px] text-right shrink-0 leading-none">${formatPrice(p.price * qty)}</span>
        </div>`;
    }).join('');
  }
  document.getElementById('cart-total').textContent = formatPrice(getSubtotal());
  const toolbar = document.getElementById('cart-toolbar');
  if (toolbar) toolbar.classList.toggle('hidden', ids.length === 0);
}

export { renderCart };
