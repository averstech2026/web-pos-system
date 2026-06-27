import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import {
  renderKitchenShell, startClock, stopClock, bindKitchenNav,
} from '../components/layout.js';
import { openKitchenOrderSearch } from '../components/search.js';
import { kitchenSearch } from '../store.js';
import {
  expandItemLines, isLinePrepared, allLinesPrepared, elapsedSince,
} from '../utils/format.js';

export class OrdersPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.orders = [];
    this.sortAsc = true;
    this._unsub = null;
    this._searchUnsub = null;
    this._timers = [];
    this.init();
  }

  init() {
    this._searchUnsub = kitchenSearch.subscribe(() => this.render());
    this.subscribe();
  }

  subscribe() {
    const q = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', 'in', [ORDER_STATUS.COOKING, ORDER_STATUS.READY]),
    );

    this._unsub = onSnapshot(q, snap => {
      this.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.render();
    }, err => {
      console.error('Orders subscribe error:', err);
      this.container.innerHTML = `
        <div class="kt-error card">
          <p>Не удалось загрузить заказы.</p>
          <p class="kt-error-hint">Проверьте правила Firestore и индексы.</p>
        </div>`;
    });
  }

  filteredOrders() {
    let list = [...this.orders];
    const filter = kitchenSearch.getFilter();
    if (filter?.orderIds?.length) {
      const ids = new Set(filter.orderIds);
      list = list.filter(o => ids.has(o.id));
    }
    list.sort((a, b) => {
      const na = Number(a.orderNumber) || 0;
      const nb = Number(b.orderNumber) || 0;
      return this.sortAsc ? na - nb : nb - na;
    });
    return list;
  }

  renderOrderCard(order) {
    const lines = expandItemLines(order.items);
    const prepared = order.preparedLines || [];
    const allDone = allLinesPrepared(order.items, prepared);
    const isReady = order.status === ORDER_STATUS.READY;
    const createdLabel = order.createdAt?.toDate
      ? order.createdAt.toDate().toLocaleString('ru-RU')
      : '—';

    return `
      <article class="kt-order-card card ${isReady ? 'kt-order-card--ready' : ''}"
               data-orderid="${order.id}">
        <header class="kt-order-head">
          <span class="kt-order-num">Заказ № ${order.orderNumber}</span>
          <span class="kt-order-time">🕐 ${createdLabel}</span>
          <span class="kt-order-timer" data-orderid="${order.id}">⏱ ${elapsedSince(order.createdAt)}</span>
        </header>
        <ul class="kt-order-items">
          ${lines.map(line => {
            const done = isLinePrepared(prepared, line.key);
            return `
              <li class="kt-order-line ${done ? 'kt-order-line--done' : ''}">
                <button class="kt-check btn-press" type="button"
                        data-action="toggle-line" data-orderid="${order.id}"
                        data-line="${line.key}" aria-label="Отметить ${line.name}"
                        ${isReady ? 'disabled' : ''}>
                  ${done ? '✓' : ''}
                </button>
                <span class="kt-line-name">${line.name}</span>
                <span class="kt-line-qty">1</span>
              </li>`;
          }).join('')}
        </ul>
        ${!isReady ? `
          <button class="btn btn-primary btn-pill btn-press kt-ready-btn"
                  type="button" data-action="mark-ready" data-orderid="${order.id}"
                  ${allDone ? '' : 'disabled'}>
            Заказ готов
          </button>
        ` : `
          <div class="kt-ready-badge">✓ Готов к выдаче</div>
        `}
      </article>
    `;
  }

  renderSearchBanner() {
    const filter = kitchenSearch.getFilter();
    if (!filter?.orderIds?.length) return '';

    return `
      <div class="kt-search-banner">
        <span>Фильтр: ${filter.label || 'поиск'} (${filter.orderIds.length})</span>
        <button class="kt-search-banner-clear btn-press" type="button" id="kt-clear-search">
          Сбросить ✕
        </button>
      </div>
    `;
  }

  render() {
    const orders = this.filteredOrders();
    const filter = kitchenSearch.getFilter();

    const bodyHtml = `
      ${this.renderSearchBanner()}
      ${orders.length === 0
        ? `<p class="kt-empty">${filter?.orderIds?.length ? 'По вашему запросу заказов нет среди текущих' : 'Нет заказов на готовку'}</p>`
        : `<div class="kt-orders-grid">${orders.map(o => this.renderOrderCard(o)).join('')}</div>`}
    `;

    this.container.innerHTML = renderKitchenShell({
      title: 'Кухонный терминал',
      activeTab: 'orders',
      bodyHtml,
    });

    startClock();
    this.startTimers();
    bindKitchenNav(this.container, this.navigate, {
      onSort: () => {
        this.sortAsc = !this.sortAsc;
        this.render();
      },
      onSearch: () => openKitchenOrderSearch({ orders: this.orders, navigate: this.navigate }),
    });

    document.getElementById('kt-clear-search')?.addEventListener('click', () => {
      kitchenSearch.clear();
    });

    this.container.querySelector('#kt-main')?.addEventListener('click', e => this.onClick(e));

    const scrollId = filter?.scrollToId;
    if (scrollId) {
      requestAnimationFrame(() => {
        const card = this.container.querySelector(`[data-orderid="${scrollId}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.classList.add('kt-order-card--highlight');
        kitchenSearch.setFilter({ ...filter, scrollToId: undefined });
        setTimeout(() => card?.classList.remove('kt-order-card--highlight'), 2500);
      });
    }
  }

  startTimers() {
    this.stopTimers();
    const tick = () => {
      this.container.querySelectorAll('.kt-order-timer').forEach(el => {
        const id = el.dataset.orderid;
        const order = this.orders.find(o => o.id === id);
        if (order) el.textContent = `⏱ ${elapsedSince(order.createdAt)}`;
      });
    };
    tick();
    this._timers.push(setInterval(tick, 1000));
  }

  stopTimers() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
  }

  async onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, orderid, line } = btn.dataset;

    if (action === 'toggle-line') {
      await this.toggleLine(orderid, line);
    }
    if (action === 'mark-ready') {
      await this.markReady(orderid);
    }
  }

  async toggleLine(orderId, lineKey) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    const prepared = [...(order.preparedLines || [])];
    const idx = prepared.indexOf(lineKey);
    if (idx === -1) prepared.push(lineKey);
    else prepared.splice(idx, 1);

    try {
      await updateDoc(doc(db, COL.ORDERS, orderId), { preparedLines: prepared });
    } catch (err) {
      console.error('Toggle line error:', err);
      alert('Не удалось обновить позицию.');
    }
  }

  async markReady(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || !allLinesPrepared(order.items, order.preparedLines)) return;

    try {
      await updateDoc(doc(db, COL.ORDERS, orderId), { status: ORDER_STATUS.READY });
    } catch (err) {
      console.error('Mark ready error:', err);
      alert('Не удалось отметить заказ готовым.');
    }
  }

  destroy() {
    this._unsub?.();
    this._searchUnsub?.();
    stopClock();
    this.stopTimers();
  }
}
