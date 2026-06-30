import { resolveProductImageUrl } from '@shared/item-images.js';
import { KIOSK_MARKETING_BANNERS } from '../services/marketing-banners.js';

/** @param {string|null|undefined} url */
function resolveImageUrl(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw || raw.startsWith('blob:')) return '';
  return resolveProductImageUrl(raw) || raw;
}

/** @param {string} s */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderKioskMarketingHtml() {
  const banners = KIOSK_MARKETING_BANNERS;
  if (!banners.length) return '';

  const heroes = banners.filter(b => b.placement === 'hero' || b.placement === 'both' || b.placement === 'promo_horizontal');
  const stories = banners.filter(b => b.placement === 'story' || b.placement === 'both');

  const parts = [];

  if (heroes.length) {
    const hero = heroes[0];
    const img = resolveImageUrl(hero.bannerUrl || hero.thumbnailUrl);
    parts.push(`
      <section class="mb-6" aria-label="Промо-баннер">
        <button type="button" data-action="open-kiosk-banner" data-banner-id="${esc(hero.id)}"
          class="btn-press block w-full rounded-2xl overflow-hidden relative h-[168px] bg-navy text-left">
          ${img
            ? `<img src="${esc(img)}" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy" />`
            : ''}
          <span class="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent"></span>
          <span class="absolute inset-x-0 bottom-0 p-5">
            <span class="block text-white text-[26px] font-extrabold leading-tight">${esc(hero.title)}</span>
            ${hero.shortDescription
              ? `<span class="block text-white/90 text-[18px] font-medium mt-1">${esc(hero.shortDescription)}</span>`
              : ''}
          </span>
        </button>
      </section>
    `);
  }

  if (stories.length) {
    parts.push(`
      <section class="mb-6" aria-label="Акции">
        <div class="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
          ${stories.map(b => {
            const thumb = resolveImageUrl(b.thumbnailUrl);
            return `
              <button type="button" data-action="open-kiosk-banner" data-banner-id="${esc(b.id)}"
                class="btn-press shrink-0 w-[112px] flex flex-col items-center gap-2">
                <span class="w-[96px] h-[96px] rounded-2xl overflow-hidden border-[3px] border-navy/20 bg-white">
                  ${thumb
                    ? `<img src="${esc(thumb)}" alt="" class="w-full h-full object-cover" loading="lazy" />`
                    : `<span class="flex w-full h-full items-center justify-center text-[12px] text-gray-400 px-2 text-center">Нет фото</span>`}
                </span>
                <span class="text-[14px] font-semibold text-navy text-center leading-tight line-clamp-2">${esc(b.title)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `);
  }

  return parts.join('');
}

/** @param {string} bannerId */
export function openKioskBannerModal(bannerId) {
  const banner = KIOSK_MARKETING_BANNERS.find(b => b.id === bannerId);
  if (!banner) return;

  if (banner.clickAction === 'url' && banner.clickUrl) {
    window.open(banner.clickUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const img = resolveImageUrl(banner.fullscreenImageUrl || banner.bannerUrl || banner.thumbnailUrl);
  document.getElementById('kiosk-banner-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'kiosk-banner-modal';
  overlay.className = 'absolute inset-0 z-[120] flex items-center justify-center bg-black/60 p-10';
  overlay.innerHTML = `
    <div class="bg-white rounded-3xl shadow-2xl max-w-[900px] w-full max-h-[85%] overflow-hidden flex flex-col">
      ${img ? `<div class="shrink-0 max-h-[45%] overflow-hidden"><img src="${esc(img)}" alt="" class="w-full h-full object-cover" /></div>` : ''}
      <div class="p-8 overflow-y-auto kiosk-scroll">
        <h2 class="text-[34px] font-extrabold text-navy leading-tight mb-3">${esc(banner.title)}</h2>
        ${banner.shortDescription ? `<p class="text-[22px] text-gray-600 mb-4">${esc(banner.shortDescription)}</p>` : ''}
        ${banner.fullDescription ? `<div class="text-[20px] text-gray-700 leading-relaxed whitespace-pre-wrap">${esc(banner.fullDescription)}</div>` : ''}
      </div>
      <div class="p-6 border-t border-gray-200 shrink-0">
        <button type="button" data-action="close-kiosk-banner"
          class="btn-press w-full bg-navy text-white text-[26px] font-bold uppercase py-5 rounded-full">
          Закрыть
        </button>
      </div>
    </div>
  `;

  document.getElementById('kiosk')?.appendChild(overlay);
}

export function closeKioskBannerModal() {
  document.getElementById('kiosk-banner-modal')?.remove();
}
