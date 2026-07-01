import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import {
  renderDeliveryShell, startClock, stopClock, bindDeliveryNav,
} from '../components/layout.js';
import { openDeliveryOrderSearch } from '../components/search.js';
import { deliverySearch } from '../store.js';
import {
  expandItemLines,
  isLineIssued,
  allLinesIssued,
  formatElapsed,
  orderIssueSeconds,
  fmtOrderCreatedShort,
  clientDisplayName,
} from '../utils/format.js';
import { renderTerminalLineNameHtml } from '../../shared/composite-order-display.js';

export class QueuePage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.orders = [];
    this.usersById = {};
    this.sortAsc = true;
    this._unsub = null;
    this._searchUnsub = null;
    this._timers = [];
    this._usersLoaded = false;
    this.init();
  }

  init() {
    this._searchUnsub = deliverySearch.subscribe(() => this.render());
    this.loadUsers();
    this.subscribe();
  }

  async loadUsers() {
    try {
      const snap = await getDocs(collection(db, COL.USERS));
      this.usersById = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
      this._usersLoaded = true;
      this.render();
    } catch (err) {
      console.error('[delivery] users load', err);
    }
  }

  subscribe() {
    const q = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', '==', ORDER_STATUS.READY),
    );

    this._unsub = onSnapshot(q, snap => {
      this.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.render();
    }, err => {
      console.error('Delivery orders subscribe error:', err);
      this.container.innerHTML = `
        <div class="dt-error card">
          <p>Не удалось загрузить очередь выдачи.</p>
          <p class="dt-error-hint">Проверьте правила Firestore и индексы.</p>
        </div>`;
    });
  }

  filteredOrders() {
    let list = [...this.orders];
    const filter = deliverySearch.getFilter();
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

  renderIssueLine(order, line, issued) {
    const issuedLine = isLineIssued(issued, line.key);
    return `
      <li class="dt-order-line ${issuedLine ? 'dt-order-line--issued' : ''}">
        <span class="dt-check dt-check--readonly ${issuedLine ? 'dt-check--done' : ''}" aria-hidden="true">
          ${issuedLine ? '✓' : ''}
        </span>
        <span class="dt-line-name">${renderTerminalLineNameHtml(line)}</span>
        <span class="dt-line-qty">1</span>
        <button class="dt-issue-btn btn-press ${issuedLine ? 'dt-issue-btn--done' : ''}"
                type="button" data-action="toggle-issue" data-orderid="${order.id}"
                data-line="${line.key}" ${issuedLine ? 'disabled' : ''}>
          ${issuedLine ? 'Выдан' : 'Выдать'}
        </button>
      </li>`;
  }

  renderOrderCard(order) {
    const lines = expandItemLines(order.items);
    const issued = order.issuedLines || [];
    const hasUnissued = !allLinesIssued(order.items, issued);
    const createdLabel = fmtOrderCreatedShort(order.createdAt);
    const issue = formatElapsed(orderIssueSeconds(order));
    const clientName = clientDisplayName(order.userId, this.usersById);
    const issuedCount = lines.filter(l => isLineIssued(issued, l.key)).length;

    return `
      <article class="dt-order-card card" data-orderid="${order.id}">
        <header class="dt-order-head">
          <div class="dt-order-head-row">
            <span class="dt-order-num">Заказ № ${order.orderNumber}</span>
            <span class="dt-order-timer" data-orderid="${order.id}" data-timer="issue" title="Ожидание выдачи">⏱ ${issue}</span>
          </div>
          <div class="dt-order-head-row dt-order-head-row--meta">
            <span class="dt-order-client">${clientName}</span>
            <span class="dt-order-head-status">Готов</span>
          </div>
          <div class="dt-order-head-row dt-order-head-row--meta">
            <span class="dt-order-time">🕐 ${createdLabel}${order.timeSlot ? ` · ${order.timeSlot}` : ''}</span>
            <span class="dt-order-progress">${issuedCount}/${lines.length}</span>
          </div>
        </header>
        <ul class="dt-order-items">
          ${lines.map(line => this.renderIssueLine(order, line, issued)).join('')}
        </ul>
        ${hasUnissued ? `
          <div class="dt-order-footer">
            <button class="btn btn-primary btn-pill btn-press dt-order-action"
                    type="button" data-action="issue-all" data-orderid="${order.id}">
              Выдать весь заказ
            </button>
          </div>
        ` : ''}
      </article>
    `;
  }

  renderSearchBanner() {
    const filter = deliverySearch.getFilter();
    if (!filter?.orderIds?.length) return '';

    return `
      <div class="dt-search-banner">
        <span>Фильтр: ${filter.label || 'поиск'} (${filter.orderIds.length})</span>
        <button class="dt-search-banner-clear btn-press" type="button" id="dt-clear-search">
          Сбросить ✕
        </button>
      </div>
    `;
  }

  render() {
    const orders = this.filteredOrders();
    const filter = deliverySearch.getFilter();
    const totalReady = this.orders.length;

    const countHtml = `
      <div class="dt-toolbar-inner">
        <span class="dt-toolbar-label">Готово к выдаче: <strong>${totalReady}</strong></span>
      </div>
    `;

    const bodyHtml = `
      ${this.renderSearchBanner()}
      ${orders.length === 0
        ? `<p class="dt-empty">${filter?.orderIds?.length ? 'По вашему запросу заказов нет в очереди' : 'Нет заказов к выдаче'}</p>`
        : `<div class="dt-orders-grid">${orders.map(o => this.renderOrderCard(o)).join('')}</div>`}
    `;

    this.container.innerHTML = renderDeliveryShell({
      title: 'Терминал выдачи',
      countHtml,
      bodyHtml,
    });

    startClock();
    bindDeliveryNav(this.container, {
      onSort: () => {
        this.sortAsc = !this.sortAsc;
        this.render();
      },
      onSearch: () => openDeliveryOrderSearch({ orders: this.orders }),
      onScan: () => openDeliveryOrderSearch({ orders: this.orders, options: { focusQr: true } }),
    });

    this.container.querySelector('#dt-clear-search')?.addEventListener('click', () => {
      deliverySearch.clear();
    });

    this.container.querySelector('#dt-main')?.addEventListener('click', this.onClick);
    this.scrollToHighlight();
    this.startTimers();
  }

  scrollToHighlight() {
    const filter = deliverySearch.getFilter();
    if (!filter?.scrollToId) return;
    requestAnimationFrame(() => {
      const card = this.container.querySelector(`[data-orderid="${filter.scrollToId}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('dt-order-card--highlight');
      setTimeout(() => card?.classList.remove('dt-order-card--highlight'), 2500);
    });
  }

  onClick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, orderid, line } = btn.dataset;
    if (action === 'toggle-issue') await this.toggleIssue(orderid, line);
    if (action === 'issue-all') await this.issueAll(orderid);
  };

  startTimers() {
    this.stopTimers();
    const tick = () => {
      this.orders.forEach(order => {
        const issue = formatElapsed(orderIssueSeconds(order));
        this.container.querySelectorAll(
          `.dt-order-timer[data-orderid="${order.id}"][data-timer="issue"]`,
        ).forEach(el => { el.textContent = `⏱ ${issue}`; });
      });
    };
    tick();
    this._timers.push(setInterval(tick, 1000));
  }

  stopTimers() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
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
        updates.completedAt = serverTimestamp();
        updates.issuedBy = auth.currentUser?.uid || null;
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
        completedAt: serverTimestamp(),
        issuedBy: auth.currentUser?.uid || null,
      });
      deliverySearch.clear();
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
