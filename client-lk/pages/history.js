import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import { cancelUnpaidOrder } from '../../shared/orders.js';
import { fmtDate, fmtDateTime, fmtMoney, orderStatusIcon, orderTotal } from '../utils/format.js';
import { openOrderDetailModal } from '../components/order-detail.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

export class HistoryPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this._unsub = null;
    this.init();
  }

  async init() {
    if (!auth.currentUser) { this.navigate('/auth'); return; }
    this.renderShell();
    this.subscribeHistory();
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="lk-shell subpage-shell">
        <header class="lk-header">
          <div class="lk-header-left">
            <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
            <span class="subpage-title">История заказов</span>
          </div>
          <div class="lk-header-right">
            <img class="header-logo" src="${logoUrl}" alt="iFCM TECH" />
          </div>
        </header>

        <main class="lk-main">
          <div id="history-list" class="history-list">
            <div class="loading-text">Загрузка…</div>
          </div>
        </main>
      </div>
    `;

    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));
  }

  subscribeHistory() {
    const baseQ = query(
      collection(db, COL.ORDERS),
      where('userId', '==', auth.currentUser.uid),
      where('status', 'in', [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED]),
    );

    this._unsub = onSnapshot(baseQ, snap => {
      const el = document.getElementById('history-list');
      if (!el) return;

      const docs = [...snap.docs].sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() ?? 0;
        const tb = b.data().createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      }).slice(0, 50);

      if (docs.length === 0) {
        el.innerHTML = `<p class="empty-text">Завершённых заказов пока нет</p>`;
        return;
      }

      el.innerHTML = docs.map(d => {
        const o = d.data();
        const total = orderTotal(o.items);
        const icon = orderStatusIcon(o.status);
        const cancelled = o.status === ORDER_STATUS.CANCELLED;
        const createdLabel = fmtDateTime(o.createdAt);
        const pickupLabel = [fmtDate(o.dateSlot), o.timeSlot].filter(Boolean).join(', ');

        return `
          <button class="history-card card btn-press${cancelled ? ' history-card--cancelled' : ''}" data-orderid="${d.id}" type="button">
            <div class="history-card-icon">${icon}</div>
            <div class="history-card-info">
              <div class="history-card-num">Заказ № ${o.orderNumber}${createdLabel ? ` · ${createdLabel}` : ''}</div>
              <div class="history-card-meta">${pickupLabel ? `Выдача: ${pickupLabel} · ` : ''}${(o.items || []).length} поз.${cancelled ? ' · Отменён' : ''}</div>
            </div>
            <div class="history-card-total">${cancelled ? '—' : fmtMoney(total)}</div>
          </button>
        `;
      }).join('');

      el.querySelectorAll('[data-orderid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const docSnap = docs.find(d => d.id === btn.dataset.orderid);
          if (!docSnap) return;
          openOrderDetailModal(
            { id: docSnap.id, data: docSnap.data() },
            {
              onPay: id => this.navigate(`/payment?orderId=${id}`),
              onCancel: id => cancelUnpaidOrder(id),
            },
          );
        });
      });
    }, err => {
      console.error('History snapshot error:', err);
      const el = document.getElementById('history-list');
      if (el) el.innerHTML = `<p class="empty-text">Не удалось загрузить историю</p>`;
    });
  }

  destroy() {
    this._unsub?.();
  }
}
