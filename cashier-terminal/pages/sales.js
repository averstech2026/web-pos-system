import { renderShellHeader, bindLiveClock } from '../components/shell.js';
import { renderModals, openProduct } from '../components/modals.js';
import { TOOL_ICONS } from '../components/toolbar-icons.js';
import {
  formatMoney, formatMoneyShort, esc, escAttr,
} from '../core/format.js';
import {
  state, resetReceipt, getTotal, getSubtotal, getDiscountAmount,
} from '../core/state.js';
import {
  ensureDesignPreview, isDesignPreviewActive, resolveDisplayTotals, PREVIEW_CATALOG_TILES,
} from '../core/demo-preview.js';
import { renderPosGuestTotalsLine } from '../services/guests.js';
import { ensureCurrentPosOrder } from '../services/orders.js';
import { resolvePosPaymentMethodButtons } from '../services/payment-methods.js';
import { POS_CATALOG_DISPLAY } from '../../shared/pos-channel.js';

const GRID_COLS = 4;
const GRID_ROWS = 6;
const PAGE_SIZE = GRID_COLS * GRID_ROWS;

export class SalesPage {
  /** @param {HTMLElement} container @param {() => void} onLogout */
  constructor(container, onLogout) {
    this.container = container;
    this.onLogout = onLogout;
    this.cleanupClock = null;
    if (isDesignPreviewActive()) {
      ensureDesignPreview();
    }
    void ensureCurrentPosOrder().then(() => this.render());
    this.render();
    window.addEventListener('ct:rerender', this.onRerender);
  }

  onRerender = () => {
    this.render();
  };

  /** @param {string} id */
  isLineSelected(id) {
    if (state.multiSelectMode) return state.selectedLineIds.has(id);
    return state.selectedLineId === id;
  }

  toggleMultiSelect() {
    const allIds = state.receiptLines.map(l => l.id);
    const allSelected = allIds.length > 0
      && allIds.every(lineId => state.selectedLineIds.has(lineId));

    if (state.multiSelectMode && allSelected) {
      state.multiSelectMode = false;
      state.selectedLineId = allIds[0] || null;
      state.selectedLineIds = state.selectedLineId ? new Set([state.selectedLineId]) : new Set();
      return;
    }

    state.multiSelectMode = true;
    state.selectedLineIds = new Set(allIds);
    state.selectedLineId = allIds[allIds.length - 1] || null;
  }

  /** @param {string} id */
  toggleLineSelection(id) {
    if (!state.multiSelectMode) {
      state.selectedLineId = id;
      state.selectedLineIds = new Set([id]);
      return;
    }

    const next = new Set(state.selectedLineIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    state.selectedLineIds = next;
    state.selectedLineId = id;

    if (!next.size) {
      state.multiSelectMode = false;
      state.selectedLineId = null;
    }
  }

  getSelectedLineIds() {
    if (state.multiSelectMode && state.selectedLineIds.size) {
      return [...state.selectedLineIds];
    }
    return state.selectedLineId ? [state.selectedLineId] : [];
  }

  syncSelectionAfterLinesChanged() {
    const ids = new Set(state.receiptLines.map(l => l.id));
    state.selectedLineIds = new Set([...state.selectedLineIds].filter(id => ids.has(id)));

    if (state.selectedLineId && !ids.has(state.selectedLineId)) {
      state.selectedLineId = state.receiptLines[0]?.id || null;
    }

    if (state.multiSelectMode && !state.selectedLineIds.size) {
      state.multiSelectMode = false;
    }
  }

  render() {
    const channel = state.channel || {};
    const isSco = channel.operationMode === 'sco';
    const showPhotos = channel.showProductPhotos === true;
    const isFlat = channel.catalogDisplay === POS_CATALOG_DISPLAY.FLAT;
    const statusText = this.catalogStatusText();

    this.container.innerHTML = `
      <div class="ct-sales-screen">
        ${renderShellHeader({ variant: 'sales', showBillInfo: true })}
        <div class="ct-sales-workspace">
          <section class="ct-panel ct-panel--receipt">
            <div class="ct-panel-inner ct-panel-inner--white">
              ${this.renderReceiptList()}
              ${isSco ? '' : this.renderToolbar()}
              ${this.renderTotals()}
              ${this.renderActionButtons(isSco)}
            </div>
          </section>
          <section class="ct-panel ct-panel--catalog">
            <div class="ct-panel-inner ct-panel-inner--catalog">
              ${this.renderCatalogNav(isFlat)}
              <div class="ct-catalog-body">
                ${this.renderProductGrid(showPhotos, isFlat)}
              </div>
              <div class="ct-catalog-footer">
                <div class="ct-catalog-capsule">${esc(statusText)}</div>
                <div class="ct-catalog-heart-corner" aria-hidden="true">${TOOL_ICONS.heartSmall}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    renderModals(this.container);
    this.bind();
    this.cleanupClock?.();
    this.cleanupClock = bindLiveClock(this.container);
  }

  catalogStatusText() {
    const selected = state.receiptLines.find(l => l.id === state.selectedLineId);
    if (selected?.name) return selected.name;
    const last = state.receiptLines[state.receiptLines.length - 1];
    return last?.name || '';
  }

  renderReceiptList() {
    const lines = state.receiptLines;
    if (!lines.length) {
      return `
        <div class="ct-receipt-list-wrap ct-receipt-list-wrap--empty">
          <div class="ct-receipt-empty">Добавьте товары из каталога справа</div>
        </div>
      `;
    }

    return `
      <div class="ct-receipt-list-wrap">
        <div class="ct-receipt-list" data-receipt-scroll>
          ${lines.map((line, idx) => {
            const selected = this.isLineSelected(line.id);
            const lineTotal = line.price * line.quantity * (1 - (line.discountPct || 0) / 100);
            const zebra = idx % 2 === 1 ? 'ct-receipt-row--alt' : '';
            return `
              <div class="ct-receipt-row ${zebra} ${selected ? 'ct-receipt-row--selected' : ''}" data-line-id="${escAttr(line.id)}">
                <span class="ct-receipt-index">${idx + 1}</span>
                <span class="ct-receipt-name">${esc(line.name)}</span>
                <div class="ct-receipt-qty">
                  <button type="button" class="ct-qty-btn btn-press" data-action="line-minus" data-id="${escAttr(line.id)}">${TOOL_ICONS.minus}</button>
                  <span class="ct-qty-value">${line.quantity}</span>
                  <button type="button" class="ct-qty-btn btn-press" data-action="line-plus" data-id="${escAttr(line.id)}">${TOOL_ICONS.plus}</button>
                </div>
                <button type="button" class="ct-receipt-delete btn-press" data-action="line-delete" data-id="${escAttr(line.id)}" aria-label="Удалить">${TOOL_ICONS.trash}</button>
                <span class="ct-receipt-price">${formatMoneyShort(lineTotal)}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="ct-receipt-scroll-float ct-receipt-scroll-float--hidden" aria-hidden="true">
          <button type="button" class="ct-receipt-scroll-btn btn-press" data-action="receipt-scroll-up" title="Вверх">${TOOL_ICONS.chevUp}</button>
          <button type="button" class="ct-receipt-scroll-btn btn-press" data-action="receipt-scroll-down" title="Вниз">${TOOL_ICONS.chevDown}</button>
        </div>
      </div>
    `;
  }

  renderToolbar() {
    return `
      <div class="ct-toolbar ct-toolbar--flat">
        <button type="button" class="ct-tool-flat btn-press ${state.multiSelectMode ? 'ct-tool-flat--active' : ''}" data-action="select-all" title="Множественный выбор">${TOOL_ICONS.list}</button>
        <button type="button" class="ct-tool-flat btn-press" data-action="qty-minus">${TOOL_ICONS.minus}</button>
        <button type="button" class="ct-tool-flat ct-tool-flat--text btn-press" data-action="qty-input">123</button>
        <button type="button" class="ct-tool-flat btn-press" data-action="qty-plus">${TOOL_ICONS.plus}</button>
        <button type="button" class="ct-tool-flat ct-tool-flat--fx btn-press" data-action="price-list" title="Прайс-лист">Fx</button>
        <span class="ct-tool-flat-label">Прайс</span>
        <button type="button" class="ct-tool-flat btn-press" data-action="discount" title="Скидка">${TOOL_ICONS.percent}</button>
        <button type="button" class="ct-tool-flat btn-press" data-action="clear-receipt" title="Очистить экран">${TOOL_ICONS.broom}</button>
        <button type="button" class="ct-tool-flat ct-tool-flat--text btn-press" data-action="half-portion" title="Половина порции">1/2</button>
        <button type="button" class="ct-tool-flat ct-tool-flat--x btn-press" data-action="delete-selected" title="Удалить">${TOOL_ICONS.close}</button>
      </div>
    `;
  }

  renderTotals() {
    const demo = resolveDisplayTotals();
    const subtotal = demo?.subtotal ?? getSubtotal();
    const discount = demo?.discount ?? getDiscountAmount();
    const total = demo?.total ?? getTotal();
    const received = demo?.received ?? state.receivedAmount;
    const guestLine = renderPosGuestTotalsLine(state.guest);

    return `
      <div class="ct-totals-wrap">
        ${guestLine}
        <div class="ct-totals-board">
          <div class="ct-totals-cell">
            <em class="ct-totals-label">Получено:</em>
            <strong class="ct-totals-amount">${formatMoney(received)} Р</strong>
          </div>
          <div class="ct-totals-cell">
            <em class="ct-totals-label">Скидка %:</em>
            <strong class="ct-totals-amount">${formatMoney(discount)} Р</strong>
          </div>
          <div class="ct-totals-cell">
            <em class="ct-totals-label">Без скидки:</em>
            <strong class="ct-totals-amount">${formatMoney(subtotal)} Р</strong>
          </div>
          <div class="ct-totals-cell ct-totals-cell--pay">
            <div class="ct-totals-pay-row">
              <em class="ct-totals-label">Итого:</em>
              <strong class="ct-totals-amount">${formatMoney(total)} Р</strong>
            </div>
            <div class="ct-totals-pay-row ct-totals-pay-row--main">
              <em class="ct-totals-label">К ОПЛАТЕ:</em>
              <strong class="ct-totals-amount ct-totals-amount--main">${formatMoney(total)} Р</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** @param {boolean} isSco */
  renderActionButtons(isSco) {
    const guest = state.guest;

    return `
      <div class="ct-action-bar">
        <button type="button" class="ct-action-btn ct-action-btn--pay btn-press" data-action="pay">ЧЕК</button>
        ${isSco ? '' : `<button type="button" class="ct-action-btn ct-action-btn--card btn-press ${guest ? 'ct-action-btn--card-active' : ''}" data-action="guest">КАРТА</button>`}
        ${isSco ? '' : `<button type="button" class="ct-action-btn ct-action-btn--card btn-press" data-action="payments">ПЛАТЕЖИ</button>`}
        <button type="button" class="ct-action-btn ct-action-btn--exit btn-press" data-action="logout">ВЫХОД</button>
      </div>
    `;
  }

  /** @param {boolean} isFlat */
  renderCatalogNav(isFlat) {
    const backDisabled = state.catalogView === 'preview'
      || (!state.catalogPath.length && state.catalogView !== 'search');

    return `
      <div class="ct-catalog-nav ct-catalog-nav--flat">
        <button type="button" class="ct-nav-flat btn-press" data-action="cat-back" ${backDisabled ? 'disabled' : ''}>${TOOL_ICONS.back}</button>
        <button type="button" class="ct-nav-flat btn-press" data-action="cat-home" title="Домой">${TOOL_ICONS.home}</button>
        <button type="button" class="ct-nav-flat btn-press" data-action="cat-favorites" title="Избранное">${TOOL_ICONS.heart}</button>
        <button type="button" class="ct-nav-flat btn-press" data-action="cat-search" title="Поиск">${TOOL_ICONS.search}</button>
        <div class="ct-catalog-nav-scroll">
          <button type="button" class="ct-nav-scroll btn-press" data-action="grid-up">${TOOL_ICONS.chevUp}</button>
          <button type="button" class="ct-nav-scroll btn-press" data-action="grid-down">${TOOL_ICONS.chevDown}</button>
        </div>
      </div>
    `;
  }

  /** @param {boolean} showPhotos @param {boolean} isFlat */
  renderProductGrid(showPhotos, isFlat) {
    if (state.catalogView === 'search') {
      return `
        <div class="ct-search-bar">
          <input type="text" data-search-input value="${escAttr(state.searchQuery)}" placeholder="Поиск товара..." />
        </div>
        <div class="ct-product-grid">${this.renderTiles(this.getVisibleTiles(isFlat), showPhotos)}</div>
      `;
    }

    const tiles = this.getVisibleTiles(isFlat);
    const page = state.gridScrollPage;
    const pageTiles = tiles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return `<div class="ct-product-grid">${this.renderTiles(pageTiles, showPhotos)}</div>`;
  }

  /** @param {string} name @param {number} price */
  renderTileContent(name, price) {
    return `
      <span class="ct-tile-content">
        <span class="ct-tile-name">${esc(name)}</span>
        <span class="ct-tile-price">${formatMoney(price)} ₽</span>
      </span>
    `;
  }

  /** @param {object[]} tiles @param {boolean} showPhotos */
  renderTiles(tiles, showPhotos) {
    if (!tiles.length) {
      return '<div class="ct-catalog-empty">Нет товаров для отображения</div>';
    }

    return tiles.map(tile => {
      if (tile.type === 'category') {
        const bg = tile.color && tile.color !== '#C5CED6' ? tile.color : '#c5ced6';
        return `
          <button type="button" class="ct-product-tile ct-product-tile--category btn-press" data-category="${escAttr(tile.name)}" style="background:${escAttr(bg)}">
            <span>${esc(tile.name)}</span>
          </button>
        `;
      }

      if (tile.type === 'preview') {
        return `
          <button type="button" class="ct-product-tile ct-product-tile--preview btn-press" data-preview-tile="${escAttr(tile.id)}" style="background:${escAttr(tile.color)}">
            ${this.renderTileContent(tile.name, tile.price)}
          </button>
        `;
      }

      const inCart = state.receiptLines.some(l => l.productId === tile.id);
      return `
        <button type="button" class="ct-product-tile btn-press ${inCart ? 'ct-product-tile--in-cart' : ''}" data-product-id="${escAttr(tile.id)}" style="${showPhotos && tile.imageUrl ? `background-image:url(${escAttr(tile.imageUrl)})` : `background:${escAttr(tile.tileColor || '#c5ced6')}`}">
          ${this.renderTileContent(tile.name, tile.price)}
        </button>
      `;
    }).join('');
  }

  /** @param {boolean} isFlat */
  getVisibleTiles(isFlat) {
    if (state.catalogView === 'preview') {
      return PREVIEW_CATALOG_TILES.map(t => ({ ...t, type: 'preview' }));
    }

    if (state.catalogView === 'favorites') {
      return state.items
        .filter(i => state.favorites.includes(i.id))
        .map(i => ({ ...i, type: 'product' }));
    }

    if (state.catalogView === 'search' || isFlat) {
      let items = [...state.items];
      const q = state.searchQuery.trim().toLowerCase();
      if (q) {
        items = items.filter(i =>
          i.name?.toLowerCase().includes(q)
          || i.category?.toLowerCase().includes(q),
        );
      }
      return items.map(i => ({ ...i, type: 'product' }));
    }

    if (!state.catalogPath.length) {
      return state.categoryGroups.map(g => ({
        type: 'category',
        name: g.name,
        color: g.color,
      }));
    }

    const category = state.catalogPath[state.catalogPath.length - 1];
    return state.items
      .filter(i => i.category === category)
      .map(i => ({ ...i, type: 'product' }));
  }

  bind() {
    const root = this.container;

    root.querySelectorAll('[data-line-id]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        this.toggleLineSelection(row.dataset.lineId);
        this.render();
      });
    });

    root.querySelectorAll('[data-action="line-minus"]').forEach(btn => {
      btn.addEventListener('click', () => this.adjustLine(btn.dataset.id, -1));
    });
    root.querySelectorAll('[data-action="line-plus"]').forEach(btn => {
      btn.addEventListener('click', () => this.adjustLine(btn.dataset.id, 1));
    });
    root.querySelectorAll('[data-action="line-delete"]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteLine(btn.dataset.id));
    });

    root.querySelector('[data-action="select-all"]')?.addEventListener('click', () => {
      this.toggleMultiSelect();
      this.render();
    });

    root.querySelector('[data-action="qty-input"]')?.addEventListener('click', () => {
      if (!state.selectedLineId) return;
      const line = state.receiptLines.find(l => l.id === state.selectedLineId);
      state.modal = 'quantity';
      state.modalData = { value: String(line?.quantity ?? 1) };
      this.render();
    });

    root.querySelector('[data-action="qty-minus"]')?.addEventListener('click', () => {
      if (state.selectedLineId) this.adjustLine(state.selectedLineId, -1);
    });
    root.querySelector('[data-action="qty-plus"]')?.addEventListener('click', () => {
      if (state.selectedLineId) this.adjustLine(state.selectedLineId, 1);
    });

    root.querySelector('[data-action="price-list"]')?.addEventListener('click', () => {
      state.modal = 'price_list';
      this.render();
    });

    root.querySelector('[data-action="discount"]')?.addEventListener('click', () => {
      state.modal = 'discount';
      state.modalData = { value: String(state.receiptDiscountPct || '') };
      this.render();
    });

    root.querySelector('[data-action="clear-receipt"]')?.addEventListener('click', () => {
      resetReceipt();
      state.guest = null;
      state.catalogView = 'categories';
      this.render();
    });

    root.querySelector('[data-action="half-portion"]')?.addEventListener('click', () => {
      if (!state.selectedLineId) return;
      state.modal = 'quantity';
      state.modalData = { value: '0,5', preset: '0,5' };
      this.render();
    });

    root.querySelector('[data-action="delete-selected"]')?.addEventListener('click', () => {
      const ids = this.getSelectedLineIds();
      if (!ids.length) return;
      state.designPreview = false;
      const remove = new Set(ids);
      state.receiptLines = state.receiptLines.filter(l => !remove.has(l.id));
      state.multiSelectMode = false;
      state.selectedLineIds = new Set();
      state.selectedLineId = state.receiptLines[0]?.id || null;
      this.render();
    });

    root.querySelector('[data-action="pay"]')?.addEventListener('click', () => {
      if (!state.receiptLines.length) return;
      const total = resolveDisplayTotals()?.total ?? getTotal();
      const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
      state.modal = 'payment';
      state.modalData = {
        received: total.toFixed(2).replace('.', ','),
        selectedPaymentMethodId: methods[0]?.id || null,
      };
      this.render();
    });

    root.querySelector('[data-action="guest"]')?.addEventListener('click', () => {
      if (state.guest) {
        state.modal = 'guest_details';
        state.modalData = {};
      } else {
        state.modal = 'customer_search';
        state.modalData = { search: '', selectedId: null };
      }
      this.render();
    });

    root.querySelector('[data-action="payments"]')?.addEventListener('click', () => {
      state.modal = 'payments_log';
      this.render();
    });

    root.querySelector('[data-action="logout"]')?.addEventListener('click', () => {
      if (state.receiptLines.length) {
        state.savedCart = {
          lines: [...state.receiptLines],
          guest: state.guest,
          discount: state.receiptDiscountPct,
          currentOrder: state.currentOrder,
        };
      }
      this.onLogout();
    });

    root.querySelector('[data-action="cat-back"]')?.addEventListener('click', () => {
      if (state.catalogView === 'preview') {
        state.catalogView = 'categories';
        state.designPreview = false;
      } else if (state.catalogView === 'search') {
        state.catalogView = 'categories';
        state.searchQuery = '';
      } else {
        state.catalogPath.pop();
      }
      state.gridScrollPage = 0;
      this.render();
    });

    root.querySelector('[data-action="cat-home"]')?.addEventListener('click', () => {
      state.catalogPath = [];
      state.catalogView = 'categories';
      state.searchQuery = '';
      state.designPreview = false;
      state.gridScrollPage = 0;
      this.render();
    });

    root.querySelector('[data-action="cat-favorites"]')?.addEventListener('click', () => {
      state.catalogView = 'favorites';
      state.designPreview = false;
      state.gridScrollPage = 0;
      this.render();
    });

    root.querySelector('[data-action="cat-search"]')?.addEventListener('click', () => {
      state.catalogView = 'search';
      state.designPreview = false;
      state.gridScrollPage = 0;
      this.render();
    });

    root.querySelector('[data-action="grid-up"]')?.addEventListener('click', () => {
      state.gridScrollPage = Math.max(0, state.gridScrollPage - 1);
      this.render();
    });

    root.querySelector('[data-action="grid-down"]')?.addEventListener('click', () => {
      state.gridScrollPage += 1;
      this.render();
    });

    root.querySelector('[data-search-input]')?.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      state.gridScrollPage = 0;
      this.render();
    });

    root.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.catalogPath.push(btn.dataset.category);
        state.gridScrollPage = 0;
        this.render();
      });
    });

    root.querySelectorAll('[data-product-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const product = state.items.find(i => i.id === btn.dataset.productId);
        if (product) {
          openProduct(product);
          this.render();
        }
      });
    });

    root.querySelectorAll('[data-preview-tile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const demo = state.items.find(i => i.id === 'demo-bun');
        if (demo) openProduct(demo);
        this.render();
      });
    });

    this.setupReceiptScroll();
  }

  setupReceiptScroll() {
    this._receiptScrollObs?.disconnect();

    const wrap = this.container.querySelector('.ct-receipt-list-wrap:not(.ct-receipt-list-wrap--empty)');
    if (!wrap) return;

    const list = wrap.querySelector('[data-receipt-scroll]');
    const float = wrap.querySelector('.ct-receipt-scroll-float');
    if (!list || !float) return;

    const update = () => {
      const canScroll = list.scrollHeight > list.clientHeight + 2;
      float.classList.toggle('ct-receipt-scroll-float--hidden', !canScroll);
      const up = float.querySelector('[data-action="receipt-scroll-up"]');
      const down = float.querySelector('[data-action="receipt-scroll-down"]');
      if (up) up.disabled = list.scrollTop <= 1;
      if (down) down.disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
    };

    update();
    list.addEventListener('scroll', update, { passive: true });
    this._receiptScrollObs = new ResizeObserver(update);
    this._receiptScrollObs.observe(list);

    float.querySelector('[data-action="receipt-scroll-up"]')?.addEventListener('click', () => {
      list.scrollBy({ top: -64, behavior: 'smooth' });
    });
    float.querySelector('[data-action="receipt-scroll-down"]')?.addEventListener('click', () => {
      list.scrollBy({ top: 64, behavior: 'smooth' });
    });
  }

  /** @param {string} id @param {number} delta */
  adjustLine(id, delta) {
    state.designPreview = false;
    state.receiptLines = state.receiptLines.map(line => {
      if (line.id !== id) return line;
      const qty = Math.max(0.01, line.quantity + delta);
      return { ...line, quantity: qty };
    }).filter(l => l.quantity > 0);
    this.syncSelectionAfterLinesChanged();
    this.render();
  }

  /** @param {string} id */
  deleteLine(id) {
    state.designPreview = false;
    state.receiptLines = state.receiptLines.filter(l => l.id !== id);
    state.selectedLineIds.delete(id);
    this.syncSelectionAfterLinesChanged();
    this.render();
  }

  destroy() {
    window.removeEventListener('ct:rerender', this.onRerender);
    this._receiptScrollObs?.disconnect();
    this.cleanupClock?.();
    this.container.innerHTML = '';
  }
}
