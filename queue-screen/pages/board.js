import { db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import { ensureQueueSession } from '../services/auth.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

export class QueueBoard {
  constructor(container) {
    this.container = container;
    this.cookingOrders = [];
    this.readyOrders = [];
    this.error = null;
    this._unsubs = [];
    this._clockTimer = null;
    this._prevReadyIds = new Set();
    this._highlightIds = new Set();
    this._highlightTimer = null;
    this._reauthPending = false;
  }

  init() {
    this.renderShell();
    this.startClock();
    this.subscribe();
  }

  resubscribe() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    this.subscribe();
  }

  subscribe() {
    const cookingQ = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', '==', ORDER_STATUS.COOKING),
    );

    const readyQ = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', '==', ORDER_STATUS.READY),
    );

    this._unsubs.push(
      onSnapshot(cookingQ, snap => {
        this.cookingOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.error = null;
        this.renderBoard();
      }, err => this.handleSubscribeError(err)),
    );

    this._unsubs.push(
      onSnapshot(readyQ, snap => {
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const nextIds = new Set(orders.map(o => o.id));
        const newlyReady = orders.filter(o => !this._prevReadyIds.has(o.id));
        this._prevReadyIds = nextIds;

        if (newlyReady.length) {
          newlyReady.forEach(o => this._highlightIds.add(o.id));
          this.clearHighlightTimer();
          this._highlightTimer = setTimeout(() => {
            this._highlightIds.clear();
            this.renderBoard();
          }, 6000);
        }

        this.readyOrders = orders;
        this.error = null;
        this.renderBoard();
      }, err => this.handleSubscribeError(err)),
    );
  }

  async handleSubscribeError(err) {
    console.error('[queue-screen]', err);
    const code = err?.code || '';

    if (code === 'permission-denied' && !this._reauthPending) {
      this._reauthPending = true;
      try {
        await ensureQueueSession();
        this.error = null;
        this.resubscribe();
        return;
      } catch (reauthErr) {
        console.error('[queue-screen] re-auth', reauthErr);
      } finally {
        this._reauthPending = false;
      }
    }

    this.error = err.message || 'Не удалось загрузить очередь';
    this.renderShell();
  }

  clearHighlightTimer() {
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer);
      this._highlightTimer = null;
    }
  }

  sortByNumber(orders) {
    return [...orders].sort((a, b) => {
      const na = Number(a.orderNumber) || 0;
      const nb = Number(b.orderNumber) || 0;
      return na - nb;
    });
  }

  startClock() {
    this.tickClock();
    this._clockTimer = setInterval(() => this.tickClock(), 1000);
  }

  tickClock() {
    const el = this.container.querySelector('#qs-clock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="qs-shell">
        <header class="qs-header">
          <div class="qs-brand">
            <img class="qs-logo" src="${logoUrl}" alt="iFCM TECH" />
            <div class="qs-brand-text">
              <span class="qs-brand-title">Экран очереди</span>
              <span class="qs-brand-sub">Следите за номером заказа</span>
            </div>
          </div>
          <time class="qs-clock" id="qs-clock" aria-live="off"></time>
        </header>

        <main class="qs-main" id="qs-main">
          ${this.error
            ? `<div class="qs-error"><p>${esc(this.error)}</p><p class="qs-error-hint">Проверьте Firestore rules и индексы</p></div>`
            : this.renderColumns()}
        </main>
      </div>
    `;
    this.tickClock();
  }

  renderBoard() {
    const main = this.container.querySelector('#qs-main');
    if (!main || this.error) return;
    main.innerHTML = this.renderColumns();
  }

  renderColumns() {
    const cooking = this.sortByNumber(this.cookingOrders);
    const ready = this.sortByNumber(this.readyOrders);

    return `
      <section class="qs-column qs-column--cooking" aria-labelledby="qs-cooking-title">
        <header class="qs-column-head">
          <h2 class="qs-column-title" id="qs-cooking-title">Готовится</h2>
          <span class="qs-column-count">${cooking.length}</span>
        </header>
        <div class="qs-grid" role="list">
          ${this.renderNumbers(cooking, new Set())}
        </div>
      </section>

      <section class="qs-column qs-column--ready" aria-labelledby="qs-ready-title">
        <header class="qs-column-head">
          <h2 class="qs-column-title" id="qs-ready-title">Готово</h2>
          <span class="qs-column-count qs-column-count--ready">${ready.length}</span>
        </header>
        <div class="qs-grid" role="list">
          ${this.renderNumbers(ready, this._highlightIds)}
        </div>
      </section>
    `;
  }

  renderNumbers(orders, highlightIds) {
    if (!orders.length) {
      return '<p class="qs-empty">Пока нет заказов</p>';
    }

    return orders.map(order => {
      const num = esc(String(order.orderNumber || '—'));
      const highlight = highlightIds.has(order.id);
      return `
        <div
          class="qs-num${highlight ? ' qs-num--pulse' : ''}"
          role="listitem"
          aria-label="Заказ ${num}"
        >${num}</div>
      `;
    }).join('');
  }

  destroy() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    this.clearHighlightTimer();
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
