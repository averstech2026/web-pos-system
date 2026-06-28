import { fmtDate, fmtMoney, orderStatusIcon, orderStatusLabel, orderTotal } from '../utils/format.js';
import { canCancelOrder } from '../../shared/orders.js';
import { renderNutritionGrid, sumNutrition } from '../../shared/nutrition.js';

/**
 * Render order detail modal HTML (caller must bind close + overlay click).
 * @param {{ id: string, data: object }} order
 */
export function renderOrderDetailModal(order) {
  const o = order.data;
  const items = o.items || [];
  const total = orderTotal(items);
  const orderNutrition = sumNutrition(items);
  const nutritionHtml = orderNutrition
    ? `<div class="pay-nutrition">${renderNutritionGrid(orderNutrition, { title: 'КБЖУ заказа' })}</div>`
    : '';
  const icon = orderStatusIcon(o.status);
  const label = orderStatusLabel(o.status);
  const payLabel = o.paymentStatus === 'paid' ? 'Оплачен' : 'Не оплачен';

  return `
    <div class="modal-overlay" id="order-detail-modal" role="dialog" aria-modal="true">
      <div class="modal card order-detail-modal">
        <div class="modal-header">
          <span class="modal-title">Заказ № ${o.orderNumber}</span>
          <button class="modal-close" id="btn-order-detail-close" aria-label="Закрыть">✕</button>
        </div>

        <div class="order-detail-meta">
          <span class="order-detail-icon">${icon}</span>
          <div>
            <div class="order-detail-slot">${fmtDate(o.dateSlot)}, ${o.timeSlot || ''}</div>
            <div class="order-detail-badges">
              <span class="order-status-pill order-status-pill--${o.status}">${label}</span>
              <span class="order-status-pill order-status-pill--${o.paymentStatus === 'paid' ? 'paid' : 'unpaid-pay'}">${payLabel}</span>
            </div>
          </div>
        </div>

        <div class="order-detail-items card">
          <div class="order-detail-items-title">Состав заказа</div>
          <div class="pay-items-list">
            ${items.map(i => `
              <div class="pay-item-row">
                <span>${i.name} <span class="qty">× ${i.quantity}</span></span>
                <span>${fmtMoney(i.price * i.quantity)}</span>
              </div>
            `).join('')}
          </div>
          <hr class="pay-divider" />
          <div class="pay-total-row">
            <span>Итого</span>
            <span>${fmtMoney(total)}</span>
          </div>
          ${nutritionHtml}
        </div>

        ${canCancelOrder(o) ? `
          <div class="order-detail-actions">
            <button class="btn btn-primary btn-pill btn-press" id="btn-order-pay" data-orderid="${order.id}">
              Оплатить заказ
            </button>
            <button class="btn btn-outline btn-outline-danger btn-pill btn-press" id="btn-order-cancel" data-orderid="${order.id}">
              Отменить заказ
            </button>
          </div>
        ` : o.paymentStatus === 'unpaid' && o.status !== 'completed' && o.status !== 'cancelled' ? `
          <button class="btn btn-primary btn-pill btn-press" id="btn-order-pay" data-orderid="${order.id}">
            Оплатить заказ
          </button>
        ` : ''}

        <button class="btn btn-outline btn-pill btn-press" id="btn-order-detail-close-2">Закрыть</button>
      </div>
    </div>
  `;
}

/** Mount modal into document.body and wire close / pay / cancel handlers */
export function openOrderDetailModal(order, { onClose, onPay, onCancel }) {
  const existing = document.getElementById('order-detail-modal');
  existing?.remove();

  document.body.insertAdjacentHTML('beforeend', renderOrderDetailModal(order));

  const modal = document.getElementById('order-detail-modal');
  const hide = () => {
    modal.remove();
    onClose?.();
  };

  document.getElementById('btn-order-detail-close').addEventListener('click', hide);
  document.getElementById('btn-order-detail-close-2').addEventListener('click', hide);
  modal.addEventListener('click', e => {
    if (e.target === modal) hide();
  });

  const payBtn = document.getElementById('btn-order-pay');
  if (payBtn) {
    payBtn.addEventListener('click', () => {
      hide();
      onPay?.(payBtn.dataset.orderid);
    });
  }

  const cancelBtn = document.getElementById('btn-order-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Отменить заказ? Это действие нельзя отменить.')) return;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Отменяем…';
      try {
        await onCancel?.(cancelBtn.dataset.orderid);
        hide();
      } catch (err) {
        console.error('Cancel order error:', err);
        alert(err.message || 'Не удалось отменить заказ.');
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Отменить заказ';
      }
    });
  }
}
