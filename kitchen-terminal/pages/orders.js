import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { COL, ORDER_STATUS, createOrderReadyNotificationDoc } from '../../shared/schema.js';
import {
  renderKitchenShell, startClock, stopClock, bindKitchenNav,
} from '../components/layout.js';
import { openKitchenOrderSearch } from '../components/search.js';
import { kitchenSearch } from '../store.js';
import {
  expandItemLines, isLinePrepared, allLinesPrepared,
  formatElapsed, orderPrepSeconds, fmtOrderCreatedShort, clientDisplayName,
} from '../utils/format.js';
import { renderTerminalLineNameHtml } from '../../shared/composite-order-display.js';

export class OrdersPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.orders = [];
    this.usersById = {};
    this.sortAsc = true;
    this._unsub = null;
    this._searchUnsub = null;
    this._timers = [];
    this.init();
  }

  init() {
    this._searchUnsub = kitchenSearch.subscribe(() => this.render());
    this.loadUsers();
    this.subscribe();
  }

  async loadUsers() {
    try {
      const snap = await getDocs(collection(db, COL.USERS));
      this.usersById = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
      this.render();
    } catch (err) {
      console.error('[kitchen] users load', err);
    }
  }

  subscribe() {
    const q = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', '==', ORDER_STATUS.COOKING),
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

  renderPrepLine(order, line, prepared) {
    const done = isLinePrepared(prepared, line.key);
    return `
      <li class="kt-order-line ${done ? 'kt-order-line--done' : ''}">
        <span class="kt-check kt-check--readonly ${done ? 'kt-check--done' : ''}" aria-hidden="true">
          ${done ? '✓' : ''}
        </span>
        <span class="kt-line-name">${renderTerminalLineNameHtml(line)}</span>
        <span class="kt-line-qty">1</span>
        <button class="kt-issue-btn btn-press ${done ? 'kt-issue-btn--done' : ''}"
                type="button" data-action="mark-line" data-orderid="${order.id}"
                data-line="${line.key}" ${done ? 'disabled' : ''}>
          Готово
        </button>
      </li>`;
  }

  renderOrderCard(order) {
    const lines = expandItemLines(order.items);
    const prepared = order.preparedLines || [];
    const allDone = allLinesPrepared(order.items, prepared);
    const createdLabel = fmtOrderCreatedShort(order.createdAt);
    const prep = formatElapsed(orderPrepSeconds(order));
    const clientName = clientDisplayName(order.userId, this.usersById);
    const preparedCount = lines.filter(l => isLinePrepared(prepared, l.key)).length;

    return `
      <article class="kt-order-card card" data-orderid="${order.id}">
        <header class="kt-order-head">
          <div class="kt-order-head-row">
            <span class="kt-order-num">Заказ № ${order.orderNumber}</span>
            <span class="kt-order-timer" data-orderid="${order.id}" data-timer="prep" title="Приготовление">⏱ ${prep}</span>
          </div>
          <div class="kt-order-head-row kt-order-head-row--meta">
            <span class="kt-order-client">${clientName}</span>
            <span class="kt-order-head-status">Оплачен</span>
          </div>
          <div class="kt-order-head-row kt-order-head-row--meta">
            <span class="kt-order-time">🕐 ${createdLabel}${order.timeSlot ? ` · ${order.timeSlot}` : ''}</span>
            <span class="kt-order-progress">${preparedCount}/${lines.length}</span>
          </div>
        </header>
        <ul class="kt-order-items">
          ${lines.map(line => this.renderPrepLine(order, line, prepared)).join('')}
        </ul>
        <div class="kt-order-footer">
          <button class="btn btn-primary btn-pill btn-press kt-order-action"
                  type="button" data-action="mark-ready" data-orderid="${order.id}"
                  ${allDone ? '' : 'disabled'}>
            Заказ готов
          </button>
        </div>
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

  renderToolbar() {
    const total = this.orders.length;
    return `
      <div class="kt-toolbar-inner">
        <span class="kt-toolbar-label">К приготовлению заказов: <strong>${total}</strong></span>
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
      toolbarHtml: this.renderToolbar(),
      toolbarClass: 'kt-toolbar--status',
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
      this.orders.forEach(order => {
        const prep = formatElapsed(orderPrepSeconds(order));
        this.container.querySelectorAll(
          `.kt-order-timer[data-orderid="${order.id}"][data-timer="prep"]`,
        ).forEach(el => { el.textContent = `⏱ ${prep}`; });
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

    if (action === 'mark-line') await this.markLine(orderid, line);
    if (action === 'mark-ready') await this.markReady(orderid);
  }

  async markLine(orderId, lineKey) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    if (isLinePrepared(order.preparedLines, lineKey)) return;

    const prepared = [...(order.preparedLines || []), lineKey];

    try {
      await updateDoc(doc(db, COL.ORDERS, orderId), { preparedLines: prepared });
    } catch (err) {
      console.error('Mark line error:', err);
      alert('Не удалось отметить позицию.');
    }
  }

  async markReady(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    if (!allLinesPrepared(order.items, order.preparedLines)) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COL.ORDERS, orderId), {
        status: ORDER_STATUS.READY,
        readyAt: serverTimestamp(),
      });
      if (order.userId && order.userId !== 'kiosk-guest') {
        const notifRef = doc(collection(db, COL.NOTIFICATIONS));
        batch.set(notifRef, createOrderReadyNotificationDoc({
          userId: order.userId,
          orderNumber: order.orderNumber,
        }));
      }
      await batch.commit();
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
