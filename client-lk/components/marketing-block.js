/**
 * Marketing stories + hero banner block for LK and kiosk.
 */
import { resolveProductImageUrl } from '../../shared/item-images.js';
import {
  filterMarketingBannersForUser,
  renderPromoSubtitleHtml,
} from '../../shared/marketing-banners.js';

/** @param {string|null|undefined} url */
function resolveImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  // Blob-ссылки из админки не работают в ЛК — показываем плейсхолдер
  if (raw.startsWith('blob:')) return null;
  if (raw.startsWith('data:')) return raw;
  return resolveProductImageUrl(raw) || raw;
}

/**
 * @param {import('../../shared/marketing-banners.d.ts').MarketingBanner[]} banners
 * @param {import('../../shared/marketing-banners.d.ts').MarketingBannerFilterContext} ctx
 */
export function getVisibleMarketingContent(banners, ctx) {
  const visible = filterMarketingBannersForUser(banners, ctx);
  const stories = visible.filter(b => b.placement === 'story' || b.placement === 'both');
  const heroes = visible.filter(b => b.placement === 'hero' || b.placement === 'both');
  const cards = visible.filter(b => b.placement === 'card');
  const promoHorizontals = visible.filter(b => b.placement === 'promo_horizontal');
  return { stories, hero: heroes[0] || null, cards, promoHorizontals, all: visible };
}

/**
 * @param {{ stories: import('../../shared/marketing-banners.d.ts').MarketingBanner[], hero: import('../../shared/marketing-banners.d.ts').MarketingBanner|null }} content
 * @param {import('../../shared/marketing-banners.d.ts').MarketingBannerFilterContext} ctx
 */
export function renderMarketingBlockHtml(content, ctx) {
  const { stories, hero, cards, promoHorizontals } = content;
  if (!stories.length && !hero && !cards.length && !promoHorizontals.length) return '';

  const storiesHtml = stories.length ? `
    <section class="mkt-stories-section" aria-label="Акции">
      <div class="mkt-stories-carousel">
        <div class="mkt-stories-scroll hide-scrollbar">
        ${stories.map(b => {
          const thumb = resolveImageUrl(b.thumbnailUrl);
          const label = b.title || b.shortDescription || 'Акция';
          return `
            <button type="button" class="mkt-story-card btn-press" data-banner-id="${escAttr(b.id)}"
              aria-label="${escAttr(label)}">
              <span class="mkt-story-thumb-wrap">
                ${thumb
                  ? `<img class="mkt-story-thumb" src="${escAttr(thumb)}" alt="" loading="lazy" decoding="async" />`
                  : ''}
              </span>
            </button>
          `;
        }).join('')}
        </div>
      </div>
    </section>
  ` : '';

  const heroHtml = hero ? (() => {
    const img = resolveImageUrl(hero.bannerUrl || hero.thumbnailUrl);
    return `
      <section class="mkt-hero-section" aria-label="Главная акция">
        <button type="button" class="mkt-hero-card btn-press" data-banner-id="${escAttr(hero.id)}">
          ${img ? `<img class="mkt-hero-bg" src="${escAttr(img)}" alt="" loading="lazy" />` : ''}
          <span class="mkt-hero-overlay" aria-hidden="true"></span>
          <span class="mkt-hero-content">
            <span class="mkt-hero-title">${esc(hero.title)}</span>
            ${hero.shortDescription ? `<span class="mkt-hero-sub">${esc(hero.shortDescription)}</span>` : ''}
          </span>
        </button>
      </section>
    `;
  })() : '';

  const promoHorizontalHtml = promoHorizontals.length ? `
    <section class="mkt-promo-horizontal-section" aria-label="Промо-акции">
      ${promoHorizontals.map(b => {
        const img = resolveImageUrl(b.bannerUrl || b.thumbnailUrl);
        const bg = b.backgroundColor || '#7cb9bc';
        const subtitle = renderPromoSubtitleHtml(b.shortDescription, b.badgeText);
        return `
          <button type="button" class="mkt-promo-horizontal btn-press" data-banner-id="${escAttr(b.id)}"
            style="--mkt-promo-bg: ${escAttr(bg)}">
            <span class="mkt-promo-horizontal-text">
              <span class="mkt-promo-horizontal-title">${esc(b.title)}</span>
              ${subtitle ? `<span class="mkt-promo-horizontal-sub">${subtitle}</span>` : ''}
            </span>
            ${img
              ? `<img class="mkt-promo-horizontal-art" src="${escAttr(img)}" alt="" loading="lazy" />`
              : ''}
          </button>
        `;
      }).join('')}
    </section>
  ` : '';

  const cardsHtml = cards.length ? `
    <section class="mkt-cards-section" aria-label="Промо-предложения">
      <div class="mkt-cards-list">
        ${cards.map(b => {
          const thumb = resolveImageUrl(b.thumbnailUrl || b.bannerUrl);
          return `
            <button type="button" class="mkt-promo-card btn-press" data-banner-id="${escAttr(b.id)}">
              ${thumb
                ? `<img class="mkt-promo-card-thumb" src="${escAttr(thumb)}" alt="" loading="lazy" />`
                : `<span class="mkt-promo-card-thumb mkt-promo-card-thumb--fallback">🎁</span>`}
              <span class="mkt-promo-card-text">
                <span class="mkt-promo-card-title">${esc(b.title)}</span>
                ${b.shortDescription
                  ? `<span class="mkt-promo-card-desc">${esc(b.shortDescription)}</span>`
                  : ''}
              </span>
              <span class="mkt-promo-card-arrow" aria-hidden="true">›</span>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  ` : '';

  return `<div class="mkt-home-stack">${storiesHtml}${heroHtml}${promoHorizontalHtml}${cardsHtml}</div>`;
}

/** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
export function handleMarketingBannerClick(banner) {
  if (banner.clickAction === 'url' && banner.clickUrl) {
    window.open(banner.clickUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  openMarketingDetailModal(banner);
}

/**
 * @param {HTMLElement} container
 * @param {import('../../shared/marketing-banners.d.ts').MarketingBanner[]} banners
 * @param {(banner: import('../../shared/marketing-banners.d.ts').MarketingBanner) => void} [onOpen]
 */
export function bindMarketingBlock(container, banners, onOpen = handleMarketingBannerClick) {
  const byId = new Map(banners.map(b => [b.id, b]));

  container.querySelectorAll('.mkt-story-thumb').forEach(img => {
    img.addEventListener('error', () => {
      img.classList.add('mkt-story-thumb--error');
      img.removeAttribute('src');
    });
  });

  container.querySelectorAll('[data-banner-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const banner = byId.get(btn.dataset.bannerId);
      if (banner) onOpen(banner);
    });
  });
}

/** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
export function openMarketingDetailModal(banner) {
  document.getElementById('mkt-detail-modal')?.remove();

  const img = resolveImageUrl(banner.fullscreenImageUrl || banner.bannerUrl || banner.thumbnailUrl);
  const isMobile = window.matchMedia('(max-width: 640px)').matches;

  const overlay = document.createElement('div');
  overlay.id = 'mkt-detail-modal';
  overlay.className = `mkt-modal-overlay ${isMobile ? 'mkt-modal-overlay--drawer' : ''}`;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="mkt-modal ${isMobile ? 'mkt-modal--drawer' : 'mkt-modal--center'}">
      <button type="button" class="mkt-modal-close btn-press" id="mkt-modal-close" aria-label="Закрыть">✕</button>
      ${img ? `<div class="mkt-modal-media"><img src="${escAttr(img)}" alt="${escAttr(banner.title)}" /></div>` : ''}
      <div class="mkt-modal-body">
        <h2 class="mkt-modal-title">${esc(banner.title)}</h2>
        ${banner.shortDescription ? `<p class="mkt-modal-short">${esc(banner.shortDescription)}</p>` : ''}
        ${banner.fullDescription
          ? `<div class="mkt-modal-desc">${banner.fullDescription}</div>`
          : ''}
      </div>
      <div class="mkt-modal-foot">
        <button type="button" class="btn btn-primary btn-pill btn-press" id="mkt-modal-ok">Понятно</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('mkt-modal-overlay--open'));

  const close = () => {
    overlay.classList.remove('mkt-modal-overlay--open');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('#mkt-modal-close')?.addEventListener('click', close);
  overlay.querySelector('#mkt-modal-ok')?.addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  const onKey = e => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
