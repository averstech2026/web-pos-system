import { getItemImageUrl, resolveProductImageUrl } from '../../shared/item-images.js';

/** @param {{ name?: string, imageUrl?: string|null }} item */
export function productImageUrl(item) {
  const raw = item?.imageUrl;
  if (raw?.startsWith('data:')) return raw;
  if (raw?.startsWith('blob:')) return null;
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
