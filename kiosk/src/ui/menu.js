import { state } from '../core/state.js';
import { CATEGORIES, PRODUCTS } from '../services/catalog.js';
import { formatPrice, cartIconSvg } from '../core/format.js';
import { renderKioskMarketingHtml } from './marketing.js';

function renderMarketingBlock() {
  const host = document.getElementById('kiosk-marketing-host');
  if (!host) return;
  const html = renderKioskMarketingHtml();
  host.innerHTML = html;
  host.hidden = !html;
}

// ─── Рендер сайдбара ───────────────────────────────────────────
function renderSidebar() {
  const nav = document.getElementById('sidebar');
  nav.innerHTML = CATEGORIES.map(cat => {
    const active = state.activeCategory && cat.id === state.activeCategory;
    return `
      <button data-action="select-category" data-category="${cat.id}"
              class="btn-press flex flex-col items-center justify-center gap-2 py-5 px-2 text-center
                     ${active ? 'bg-kiosk-red text-white' : 'text-white/90 hover:bg-white/10'}">
        <img src="${cat.icon}" alt="" class="sidebar-icon" />
        <span class="text-[17px] font-semibold leading-tight uppercase tracking-wide">${cat.label}</span>
      </button>`;
  }).join('');
}

// ─── Рендер карточки товара ────────────────────────────────────
function productCard(p) {
  const qty = state.cart[p.id] || 0;
  return `
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden shrink-0 w-[240px] flex flex-col">
      <div class="relative shrink-0">
        <button data-action="open-product" data-product="${p.id}" class="block w-full">
          <img src="${p.image}" alt="${p.name}" class="w-full h-[160px] object-cover" loading="lazy" />
        </button>
        ${p.isComposite ? '<span class="composite-badge kiosk-composite-badge">Комплекс</span>' : ''}
        <button type="button" tabindex="-1" class="absolute top-3 right-3 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center text-gray-500 text-xl pointer-events-none">⋯</button>
      </div>
      <div class="p-4 flex flex-col flex-1">
        <button data-action="open-product" data-product="${p.id}"
                class="block w-full text-center text-[22px] font-semibold text-gray-800 leading-tight mb-2 line-clamp-2 min-h-[56px]">
          ${p.name}
        </button>
        <div class="text-[28px] font-extrabold text-navy mb-3 text-center">${formatPrice(p.price)}</div>
        <div class="mt-auto">
        ${qty === 0 ? `
          <button data-action="add-to-cart" data-product="${p.id}"
                  class="btn-press product-card-action w-full bg-navy text-white text-[20px] font-bold uppercase rounded-xl flex items-center justify-center gap-2">
            ${cartIconSvg('w-5 h-5')}
            В корзину
          </button>` : `
          <div class="product-card-action flex items-center bg-gray-200 rounded-xl overflow-hidden">
            <button data-action="dec-cart" data-product="${p.id}"
                    class="btn-press w-12 h-full text-[26px] font-bold text-gray-600 flex items-center justify-center shrink-0">−</button>
            <span class="flex-1 h-full text-center text-[24px] font-bold bg-white flex items-center justify-center mx-0.5">${qty}</span>
            <button data-action="inc-cart" data-product="${p.id}"
                    class="btn-press w-12 h-full text-[26px] font-bold text-gray-600 flex items-center justify-center shrink-0">+</button>
          </div>`}
        </div>
      </div>
    </div>`;
}

function updateViewToggle() {
  const views = [
    { id: 'layout-btn-1', view: 'scroll' },
    { id: 'layout-btn-2', view: 'grid' },
    { id: 'layout-btn-3', view: 'browse' },
  ];
  const active = 'bg-navy text-white';
  const inactive = 'text-gray-500';
  const base = 'btn-press px-5 py-3 whitespace-nowrap';
  views.forEach(({ id, view }) => {
    const btn = document.getElementById(id);
    if (btn) btn.className = `${base} ${state.menuView === view ? active : inactive}`;
  });
}

function setMenuView(view) {
  if (!['scroll', 'grid', 'browse'].includes(view)) return;
  if (state.menuView === view) return;
  state.menuView = view;
  if (view === 'browse') state.activeCategory = null;
  renderMenu();
  if (view === 'grid') scrollToCategory('meals');
}

function renderGridSection(cat, items, filtered = false) {
  const cards = `<div class="flex flex-wrap gap-5">${items.map(p => productCard(p)).join('')}</div>`;
  if (!filtered) {
    return `
      <section id="section-${cat.id}" class="mb-10">
        <h2 class="text-[32px] font-extrabold text-navy uppercase tracking-wide mb-5">${cat.label}</h2>
        ${cards}
      </section>`;
  }
  return `
    <section id="section-${cat.id}" class="mb-10">
      <button type="button" data-action="menu-back-all"
              class="btn-press inline-flex items-center gap-3 bg-white border border-gray-200 text-navy text-[24px] font-semibold uppercase px-8 py-4 rounded-full">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>
        Назад
      </button>
      <h2 class="text-[32px] font-extrabold text-navy uppercase tracking-wide mt-5 mb-5">${cat.label}</h2>
      ${cards}
    </section>`;
}

function filterToCategory(categoryId) {
  state.activeCategory = categoryId;
  renderMenu();
  const main = document.getElementById('menu-content');
  if (main) main.scrollTo({ top: 0, behavior: 'instant' });
}

function showAllCategories() {
  state.activeCategory = null;
  renderMenu();
  const main = document.getElementById('menu-content');
  if (main) main.scrollTo({ top: 0, behavior: 'instant' });
}

// ─── Рендер меню ───────────────────────────────────────────────
function renderMenu() {
  renderSidebar();
  updateViewToggle();
  renderMarketingBlock();
  const main = document.getElementById('menu-content');
  const isGridAll = state.menuView === 'grid';
  const isBrowse = state.menuView === 'browse';

  if (isBrowse && state.activeCategory) {
    const cat = CATEGORIES.find(c => c.id === state.activeCategory);
    const items = PRODUCTS.filter(p => p.category === state.activeCategory);
    main.innerHTML = cat && items.length ? renderGridSection(cat, items, true) : '';
    return;
  }

  main.innerHTML = CATEGORIES.map(cat => {
    const items = PRODUCTS.filter(p => p.category === cat.id);
    if (!items.length) return '';
    if (isGridAll || isBrowse) {
      return renderGridSection(cat, items, false);
    }
    return `
      <section id="section-${cat.id}" class="mb-10">
        <h2 class="text-[32px] font-extrabold text-navy uppercase tracking-wide mb-5">${cat.label}</h2>
        <div class="relative">
          <div id="row-${cat.id}" class="menu-row flex gap-5 overflow-x-auto hide-scrollbar pb-2 pr-14">
            ${items.map(p => productCard(p)).join('')}
          </div>
          <button type="button" data-action="scroll-row" data-row="${cat.id}" data-dir="1"
                  aria-label="Прокрутить вправо"
                  class="menu-scroll-btn absolute right-0 z-10 w-14 h-14 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center text-gray-400 text-4xl leading-none">
            ›
          </button>
        </div>
      </section>`;
  }).join('');
}

function getSectionScrollTop(main, section) {
  return section.offsetTop;
}

function scrollSidebarToActive() {
  if (!state.activeCategory) return;
  const activeBtn = document.querySelector(`#sidebar [data-category="${state.activeCategory}"]`);
  if (activeBtn) {
    activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function scrollToCategory(categoryId) {
  const main = document.getElementById('menu-content');
  const el = document.getElementById(`section-${categoryId}`);
  if (el && main) {
    const top = getSectionScrollTop(main, el);
    const behavior = state.menuView === 'grid' ? 'smooth' : 'instant';
    main.scrollTo({ top: Math.max(0, top), behavior });
  }
  state.activeCategory = categoryId;
  renderSidebar();
  scrollSidebarToActive();
}

function scrollMenuRow(categoryId, direction) {
  const row = document.getElementById(`row-${categoryId}`);
  if (!row) return;
  const cards = [...row.querySelectorAll(':scope > .bg-white.rounded-2xl')];
  if (!cards.length) return;

  const scrollLeft = row.scrollLeft;
  const maxScroll = row.scrollWidth - row.clientWidth;
  const edgeSlack = 4;

  if (direction > 0) {
    const nextCard = cards.find(card => card.offsetLeft > scrollLeft + edgeSlack);
    const target = nextCard ? nextCard.offsetLeft : maxScroll;
    row.scrollTo({ left: Math.min(target, maxScroll), behavior: 'smooth' });
    return;
  }

  let target = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    if (cards[i].offsetLeft < scrollLeft - edgeSlack) {
      target = cards[i].offsetLeft;
      break;
    }
  }
  row.scrollTo({ left: target, behavior: 'smooth' });
}

export {
  renderSidebar,
  productCard,
  updateViewToggle,
  setMenuView,
  renderGridSection,
  filterToCategory,
  showAllCategories,
  renderMenu,
  getSectionScrollTop,
  scrollSidebarToActive,
  scrollToCategory,
  scrollMenuRow,
};
