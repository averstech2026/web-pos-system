function formatPrice(n) {
  return n.toLocaleString('ru-RU') + ' ₽';
}

function cartIconSvg(className = 'w-5 h-5') {
  return `<svg class="${className}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.5 5M17 13l2.5 5M9 19a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z"/>
  </svg>`;
}

function getCartItemLabel(p) {
  return p.cartLabel || p.name;
}

function cartQtyControl(id, qty) {
  return `
    <div class="flex items-center bg-gray-200 rounded-full shrink-0 px-1 py-1">
      <button data-action="dec-cart" data-product="${id}"
              class="btn-press cart-qty-btn w-12 h-12 text-[30px] font-bold text-gray-600 flex items-center justify-center rounded-full">−</button>
      <span class="bg-white min-w-[52px] h-12 mx-1 rounded-xl text-[26px] font-bold text-gray-800 flex items-center justify-center">${qty}</span>
      <button data-action="inc-cart" data-product="${id}"
              class="btn-press cart-qty-btn w-12 h-12 text-[30px] font-bold text-gray-600 flex items-center justify-center rounded-full">+</button>
    </div>`;
}

export { formatPrice, cartIconSvg, getCartItemLabel, cartQtyControl };
