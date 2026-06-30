import { state } from '../core/state.js';
import { SEARCH_KEYBOARD_ROWS, SEARCH_KB_ICON } from '../data/constants.js';
import { PRODUCTS } from '../services/catalog.js';
import { formatPrice, cartIconSvg, cartQtyControl } from '../core/format.js';
import { getSubtotal } from '../core/cart.js';
import { navigateTo } from '../core/navigation.js';

// ─── Поиск ─────────────────────────────────────────────────────
function filterProductsByQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.composition || '').toLowerCase().includes(q)
  );
}

function searchResultRow(p) {
  const qty = state.cart[p.id] || 0;
  const cartBtn = qty === 0 ? `
    <button type="button" data-action="add-to-cart" data-product="${p.id}"
            class="btn-press search-cart-btn shrink-0 flex items-center justify-center gap-2 uppercase">
      ${cartIconSvg('w-5 h-5')}
      В корзину
    </button>` : cartQtyControl(p.id, qty);
  return `
    <div class="search-result-row flex items-center gap-5 py-5 px-6 border-b border-gray-100">
      <img src="${p.image}" alt="${p.name}" class="w-[100px] h-[100px] object-cover rounded-xl shrink-0 bg-gray-50" loading="lazy" />
      <p class="flex-1 min-w-0 text-[26px] font-medium text-gray-800 leading-snug pr-2">${p.name}</p>
      <span class="text-[30px] font-extrabold text-navy shrink-0 w-[100px] text-right leading-none">${formatPrice(p.price)}</span>
      ${cartBtn}
    </div>`;
}

function updateSearchQueryDisplay() {
  const el = document.getElementById('search-query-display');
  const cursor = document.getElementById('search-cursor');
  if (el) el.textContent = state.searchQuery;
  if (cursor) cursor.classList.toggle('hidden', !state.searchQuery);
}

function renderSearchResults() {
  const container = document.getElementById('search-results');
  const totalEl = document.getElementById('search-total');
  const countEl = document.getElementById('search-results-count');
  if (!container) return;

  updateSearchQueryDisplay();
  if (totalEl) totalEl.textContent = formatPrice(getSubtotal());

  const results = filterProductsByQuery(state.searchQuery);
  if (countEl) countEl.textContent = String(results.length);
  if (!state.searchQuery.trim()) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full py-16 text-center px-8">
        <svg class="w-20 h-20 text-gray-300 mb-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>
        </svg>
        <p class="text-[28px] text-gray-400 font-medium">Введите запрос для поиска</p>
      </div>`;
    return;
  }
  if (!results.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full py-16 text-center px-8">
        <p class="text-[28px] text-gray-400 font-medium">Ничего не найдено</p>
      </div>`;
    return;
  }
  container.innerHTML = results.map(p => searchResultRow(p)).join('');
}

function renderSearchKeyboard() {
  const kb = document.getElementById('search-keyboard');
  if (!kb) return;

  const letterKey = key => `
    <button type="button" data-action="search-key" data-key="${key}" class="btn-press search-key">${key}</button>`;
  const fnKey = (action, content, extra = '') => `
    <button type="button" data-action="${action}" class="btn-press search-key search-key-fn search-key-side ${extra}">${content}</button>`;

  const [row1, row2, row3] = SEARCH_KEYBOARD_ROWS;

  kb.innerHTML = `
    <div class="search-kb-row">
      <div class="search-kb-letters">${row1.map(letterKey).join('')}</div>
      ${fnKey('search-backspace', SEARCH_KB_ICON.backspace)}
    </div>
    <div class="search-kb-row">
      <div class="search-kb-letters">${row2.map(letterKey).join('')}</div>
      ${fnKey('search-enter', SEARCH_KB_ICON.enter)}
    </div>
    <div class="search-kb-row">
      <button type="button" tabindex="-1" class="btn-press search-key search-key-fn search-key-side-left">${SEARCH_KB_ICON.bookmark}</button>
      <div class="search-kb-letters">${row3.map(letterKey).join('')}</div>
      <button type="button" tabindex="-1" class="btn-press search-key search-key-fn search-key-side">${SEARCH_KB_ICON.shift}</button>
    </div>
    <div class="search-kb-row">
      <button type="button" tabindex="-1" class="btn-press search-key search-key-fn search-key-side-left search-key-symbols">.?123</button>
      <button type="button" data-action="search-key" data-key=" " class="btn-press search-key search-key-space">
        <span class="search-key-space-line"></span>
      </button>
      <button type="button" tabindex="-1" class="btn-press search-key search-key-fn search-key-side search-key-lang">EN</button>
    </div>`;
}

function renderSearch() {
  renderSearchKeyboard();
  renderSearchResults();
}

function openSearch() {
  navigateTo('search');
}

function appendSearchChar(ch) {
  state.searchQuery += ch;
  renderSearchResults();
}

function backspaceSearch() {
  state.searchQuery = state.searchQuery.slice(0, -1);
  renderSearchResults();
}

function clearSearchQuery() {
  state.searchQuery = '';
  renderSearchResults();
}

export {
  filterProductsByQuery,
  searchResultRow,
  updateSearchQueryDisplay,
  renderSearchResults,
  renderSearchKeyboard,
  renderSearch,
  openSearch,
  appendSearchChar,
  backspaceSearch,
  clearSearchQuery,
};
