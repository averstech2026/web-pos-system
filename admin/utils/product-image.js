import { getItemImageUrl, resolveProductImageUrl } from '../../shared/item-images.js';

/** @param {{ name?: string, imageUrl?: string|null }} item */
export function productImageUrl(item) {
  const raw = item?.imageUrl;
  if (raw?.startsWith('data:')) return raw;
  if (raw?.startsWith('blob:')) return raw;
  return resolveProductImageUrl(raw) || getItemImageUrl(item?.name || '') || null;
}

/**
 * @param {{ name?: string, imageUrl?: string|null }} item
 * @param {string} [imgClass]
 * @param {{ fallback?: string }} [opts]
 */
export function productThumbHtml(item, imgClass = 'products-thumb', opts = {}) {
  const fallback = opts.fallback ?? '🍽️';
  const src = productImageUrl(item);

  if (!src) {
    return `
      <span class="products-thumb-wrap products-thumb-wrap--empty">
        <span class="products-thumb-fallback" aria-hidden="true">${fallback}</span>
      </span>
    `;
  }

  return `
    <span class="products-thumb-wrap products-thumb-wrap--has-img">
      <img
        class="${imgClass}"
        src="${src.replace(/"/g, '&quot;')}"
        alt=""
        loading="lazy"
        onerror="this.closest('.products-thumb-wrap')?.classList.add('products-thumb-wrap--broken')"
      />
      <span class="products-thumb-fallback" aria-hidden="true">${fallback}</span>
    </span>
  `;
}

/** Sidebar list thumb for promo rules (no product image). */
export function promoThumbHtml() {
  return `
    <span class="products-thumb-wrap products-thumb-wrap--empty products-thumb-wrap--promo">
      <span class="products-thumb-fallback" aria-hidden="true">🎁</span>
    </span>
  `;
}

const SHIFT_CLOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;

/** Sidebar list thumb for work shifts reference. */
export function shiftThumbHtml() {
  return `
    <span class="products-thumb-wrap products-thumb-wrap--empty products-thumb-wrap--shift">
      <span class="products-thumb-fallback wsh-row-thumb-icon" aria-hidden="true">${SHIFT_CLOCK_ICON}</span>
    </span>
  `;
}
