import { ORDER_STATUS, ORDER_SOURCE, PAYMENT_STATUS } from '../../shared/schema.js';

const STATUS_LABELS = {
  [ORDER_STATUS.PENDING]: 'Ожидает',
  [ORDER_STATUS.COOKING]: 'Готовится',
  [ORDER_STATUS.READY]: 'Готов',
  [ORDER_STATUS.COMPLETED]: 'Выдан',
  [ORDER_STATUS.CANCELLED]: 'Отменён',
};

const STATUS_BADGE = {
  [ORDER_STATUS.PENDING]: 'badge-pending',
  [ORDER_STATUS.COOKING]: 'badge-cooking',
  [ORDER_STATUS.READY]: 'badge-ready',
  [ORDER_STATUS.COMPLETED]: 'badge-completed',
};

export function orderStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function orderStatusBadgeClass(status) {
  return STATUS_BADGE[status] || 'badge-completed';
}

export function paymentStatusLabel(status) {
  return status === PAYMENT_STATUS.PAID ? 'Оплачен' : 'Не оплачен';
}

/** @param {string | undefined} source */
export function orderSalesChannelLabel(source) {
  const src = source || ORDER_SOURCE.WEB;
  if (src === ORDER_SOURCE.KIOSK) return 'Киоск';
  return 'Веб';
}

/** @param {string | undefined} source */
export function orderSalesChannelBadgeClass(source) {
  const src = source || ORDER_SOURCE.WEB;
  return src === ORDER_SOURCE.KIOSK ? 'orders-source-badge--kiosk' : 'orders-source-badge--web';
}

export function orderTotal(items = []) {
  return items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
}

/** @param {import('firebase/firestore').Timestamp | null | undefined} ts */
export function fmtOrderDateTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** @param {import('firebase/firestore').Timestamp | null | undefined} ts */
export function fmtOrderDateCell(ts) {
  if (!ts?.toDate) return '—';
  const d = ts.toDate();
  const date = d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const time = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `<time class="ufm-date-cell"><span class="ufm-date-part">${date}</span><span class="ufm-time-part">${time}</span></time>`;
}

/** @param {string} iso YYYY-MM-DD */
export function fmtPickupDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtPickupSlot(dateSlot, timeSlot) {
  if (!dateSlot) return '—';
  return timeSlot ? `${fmtPickupDate(dateSlot)}, ${timeSlot}` : fmtPickupDate(dateSlot);
}
