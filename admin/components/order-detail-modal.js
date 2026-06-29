import { fmtMoney } from '../utils/format.js';
import {
  fmtOrderDateTime,
  fmtPickupSlot,
  orderStatusBadgeClass,
  orderStatusLabel,
  orderTotal,
  paymentStatusLabel,
} from '../utils/order-format.js';

/**
 * @param {object} p
 * @param {object} p.order
 * @param {{ name?: string, email?: string }|null} [p.user]
 * @param {() => void} [p.onClose]
 * @param {number} [p.zIndex=1001]
 */
export function openOrderDetailModal({ order, user = null, onClose, zIndex = 1001 }) {
  document.getElementById('order-detail-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'order-detail-modal';
  overlay.style.zIndex = String(zIndex);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const items = order.items || [];
  const total = orderTotal(items);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  overlay.innerHTML = `
    <div class="admin-modal card admin-modal--md">
      <div class="admin-modal-head">
        <h2 class="admin-modal-title">Заказ № ${esc(order.orderNumber)}</h2>
        <button type="button" class="admin-modal-close btn-press" id="order-detail-close">✕</button>
      </div>
      <div class="admin-modal-body">
        <div class="orders-detail-meta">
          <p><span>Клиент</span> ${esc(user?.name || '—')}${user?.email ? ` · ${esc(user.email)}` : ''}</p>
          <p><span>Создан</span> ${fmtOrderDateTime(order.createdAt)}</p>
          <p><span>Выдача</span> ${fmtPickupSlot(order.dateSlot, order.timeSlot)}</p>
          <p>
            <span class="badge ${orderStatusBadgeClass(order.status)}">${orderStatusLabel(order.status)}</span>
            <span class="orders-pay ${order.paymentStatus === 'paid' ? 'orders-pay--paid' : 'orders-pay--unpaid'}">${paymentStatusLabel(order.paymentStatus)}</span>
          </p>
        </div>
        <div class="orders-detail-items">
          ${items.map(i => `
            <div class="orders-detail-line">
              <span>${esc(i.name)} × ${i.quantity}</span>
              <span>${fmtMoney(i.price * i.quantity)}</span>
            </div>
          `).join('')}
          <div class="orders-detail-total">
            <span>Итого</span>
            <strong>${fmtMoney(total)}</strong>
          </div>
        </div>
      </div>
      <div class="admin-modal-foot">
        <button type="button" class="action-btn action-btn-secondary btn-press" id="order-detail-close-2">Закрыть</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
    if (e.target.closest('#order-detail-close') || e.target.closest('#order-detail-close-2')) close();
  });
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);

  return { close };
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
