import { getBrandLogoUrl, getCompanyName } from './demo-preset.js';

/** @param {string} value */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * @param {object} opts
 * @param {string} opts.fallbackUrl
 * @param {string} [opts.alt]
 * @param {string} [opts.extraClass]
 */
export function renderBrandLogo({ fallbackUrl, alt, extraClass = '' }) {
  const src = getBrandLogoUrl(fallbackUrl);
  const resolvedAlt = escapeAttr(alt ?? getCompanyName());
  const customClass = src !== fallbackUrl ? ' brand-logo--custom' : '';
  const extra = extraClass ? ` ${extraClass}` : '';

  return `
    <span class="brand-logo-wrap${customClass}">
      <img
        data-brand-logo
        class="brand-logo-img h-10 w-auto object-contain max-w-[200px]${customClass}${extra}"
        src="${src}"
        alt="${resolvedAlt}"
      />
    </span>
  `;
}
