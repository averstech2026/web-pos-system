import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { COL, ORDER_STATUS, createOrderReadyNotificationDoc } from '../../shared/schema.js';
import {
  renderKitchenShell, startClock, stopClock, bindKitchenNav,
} from '../components/layout.js';
import { openKitchenOrderSearch } from '../components/search.js';
import { kitchenSearch } from '../store.js';
import {
  expandItemLines, isLinePrepared, allLinesPrepared, allLinesIssued,
  isLineIssued, formatElapsed, orderPrepSeconds, orderIssueSeconds,
  fmtOrderCreatedShort,
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

  renderSelectAllLine(order, lines, prepared) {
    const allDone = allLinesPrepared(order.items, prepared);
    const partial = !allDone && lines.some(l => isLinePrepared(prepared, l.key));
    return `
      <li class="kt-order-line kt-order-line--select-all ${allDone ? 'kt-order-line--done' : ''}">
        <button class="kt-select-all-hit btn-press" type="button"
                data-action="toggle-all-lines" data-orderid="${order.id}"
                aria-label="${allDone ? 'Снять все отметки' : 'Отметить все блюда'}"></button>
        <span class="kt-check ${allDone ? 'kt-check--done' : partial ? 'kt-check--partial' : ''}" aria-hidden="true">
          ${allDone ? '✓' : partial ? '−' : ''}
        </span>
        <span class="kt-line-name kt-line-name--select-all">Все блюда</span>
        <span class="kt-line-qty">${lines.length}</span>
      </li>`;
  }

  renderCookingLine(order, line, prepared) {
    const done = isLinePrepared(prepared, line.key);
    return `
      <li class="kt-order-line ${done ? 'kt-order-line--done' : ''}">
        <button class="kt-check btn-press" type="button"
                data-action="toggle-line" data-orderid="${order.id}"
                data-line="${line.key}" aria-label="Отметить ${line.name}">
          ${done ? '✓' : ''}
        </button>
        <span class="kt-line-name">${line.name}</span>
        <span class="kt-line-qty">1</span>
      </li>`;
  }

  renderIssueLine(order, line, issued) {
    const issuedLine = isLineIssued(issued, line.key);
    return `
      <li class="kt-order-line kt-order-line--issue ${issuedLine ? 'kt-order-line--issued' : ''}">
        <span class="kt-check kt-check--readonly ${issuedLine ? 'kt-check--done' : ''}" aria-hidden="true">
          ${issuedLine ? '✓' : ''}
        </span>
        <span class="kt-line-name">${line.name}</span>
        <span class="kt-line-qty">1</span>
        <button class="kt-issue-btn btn-press ${issuedLine ? 'kt-issue-btn--done' : ''}"
                type="button" data-action="toggle-issue" data-orderid="${order.id}"
                data-line="${line.key}" ${issuedLine ? 'disabled' : ''}>
          ${issuedLine ? 'Выдан' : 'Выдать'}
        </button>
      </li>`;
  }

  renderOrderTimers(order) {
    const isReady = order.status === ORDER_STATUS.READY;
    const prep = formatElapsed(orderPrepSeconds(order));

    if (isReady && order.readyAt) {
      const issue = formatElapsed(orderIssueSeconds(order));
      return `
        <div class="kt-order-timers">
          <span class="kt-order-timer kt-order-timer--prep kt-order-timer--frozen"
                data-orderid="${order.id}" data-timer="prep" title="Приготовление">⏱ ${prep}</span>
          <span class="kt-order-timer kt-order-timer--issue"
                data-orderid="${order.id}" data-timer="issue" title="Выдача">⏱ ${issue}</span>
        </div>`;
    }

    return `
      <span class="kt-order-timer kt-order-timer--prep"
            data-orderid="${order.id}" data-timer="prep" title="Приготовление">⏱ ${prep}</span>`;
  }

  renderOrderCard(order) {
    const lines = expandItemLines(order.items);
    const prepared = order.preparedLines || [];
    const issued = order.issuedLines || [];
    const allDone = allLinesPrepared(order.items, prepared);
    const isReady = order.status === ORDER_STATUS.READY;
    const hasUnissued = isReady && !allLinesIssued(order.items, issued);
    const createdLabel = fmtOrderCreatedShort(order.createdAt);

    return `
      <article class="kt-order-card card ${isReady ? 'kt-order-card--ready' : ''}"
               data-orderid="${order.id}">
        <header class="kt-order-head">
          <div class="kt-order-head-row">
            <span class="kt-order-num">Заказ № ${order.orderNumber}</span>
            ${this.renderOrderTimers(order)}
          </div>
          <div class="kt-order-head-row kt-order-head-row--meta">
            <span class="kt-order-time">🕐 ${createdLabel}${order.timeSlot ? ` · ${order.timeSlot}` : ''}</span>
            ${isReady ? `<span class="kt-order-head-status">✓ Готов к выдаче</span>` : ''}
          </div>
        </header>
        <ul class="kt-order-items ${isReady ? 'kt-order-items--issue' : ''}">
          ${!isReady && lines.length > 0 ? this.renderSelectAllLine(order, lines, prepared) : ''}
          ${lines.map(line => (
            isReady
              ? this.renderIssueLine(order, line, issued)
              : this.renderCookingLine(order, line, prepared)
          )).join('')}
        </ul>
        ${!isReady ? `
          <div class="kt-order-footer">
            <button class="btn btn-primary btn-pill btn-press kt-order-action"
                    type="button" data-action="mark-ready" data-orderid="${order.id}"
                    ${allDone ? '' : 'disabled'}>
              Заказ готов
            </button>
          </div>
        ` : hasUnissued ? `
          <div class="kt-order-footer">
            <button class="btn btn-outline btn-pill btn-press kt-order-action kt-issue-all-btn"
                    type="button" data-action="issue-all" data-orderid="${order.id}">
              Выдать весь заказ
            </button>
          </div>
        ` : ''}
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
      this.orders.forEach(order => {
        const prep = formatElapsed(orderPrepSeconds(order));
        this.container.querySelectorAll(
          `.kt-order-timer[data-orderid="${order.id}"][data-timer="prep"]`,
        ).forEach(el => { el.textContent = `⏱ ${prep}`; });

        if (order.status === ORDER_STATUS.READY && order.readyAt) {
          const issue = formatElapsed(orderIssueSeconds(order));
          this.container.querySelectorAll(
            `.kt-order-timer[data-orderid="${order.id}"][data-timer="issue"]`,
          ).forEach(el => { el.textContent = `⏱ ${issue}`; });
        }
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

    if (action === 'toggle-line') await this.toggleLine(orderid, line);
    if (action === 'toggle-all-lines') await this.toggleAllLines(orderid);
    if (action === 'mark-ready') await this.markReady(orderid);
    if (action === 'toggle-issue') await this.toggleIssue(orderid, line);
    if (action === 'issue-all') await this.issueAll(orderid);
  }

  async toggleAllLines(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status === ORDER_STATUS.READY) return;

    const allKeys = expandItemLines(order.items).map(l => l.key);
    const allDone = allLinesPrepared(order.items, order.preparedLines);
    const prepared = allDone ? [] : allKeys;

    try {
      await updateDoc(doc(db, COL.ORDERS, orderId), { preparedLines: prepared });
    } catch (err) {
      console.error('Toggle all lines error:', err);
      alert('Не удалось обновить позиции.');
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
    if (!order || order.status === ORDER_STATUS.READY) return;
    if (!allLinesPrepared(order.items, order.preparedLines)) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COL.ORDERS, orderId), {
        status: ORDER_STATUS.READY,
        readyAt: serverTimestamp(),
      });
      if (order.userId) {
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

  async toggleIssue(orderId, lineKey) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status !== ORDER_STATUS.READY) return;

    const issued = [...(order.issuedLines || [])];
    if (!issued.includes(lineKey)) issued.push(lineKey);

    try {
      const updates = { issuedLines: issued };
      if (allLinesIssued(order.items, issued)) {
        updates.status = ORDER_STATUS.COMPLETED;
      }
      await updateDoc(doc(db, COL.ORDERS, orderId), updates);
    } catch (err) {
      console.error('Issue line error:', err);
      alert('Не удалось выдать позицию.');
    }
  }

  async issueAll(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || order.status !== ORDER_STATUS.READY) return;

    const allKeys = expandItemLines(order.items).map(l => l.key);

    try {
      await updateDoc(doc(db, COL.ORDERS, orderId), {
        issuedLines: allKeys,
        status: ORDER_STATUS.COMPLETED,
      });
    } catch (err) {
      console.error('Issue all error:', err);
      alert('Не удалось выдать заказ.');
    }
  }

  destroy() {
    this._unsub?.();
    this._searchUnsub?.();
    stopClock();
    this.stopTimers();
  }
}
