/** Format ISO date 'YYYY-MM-DD' → 'DD.MM.YY' */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

/** Format number as RUB with 2 decimals */
export function fmtMoney(n) {
  return (n ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' р.';
}

/** Order status label in Russian */
export function orderStatusLabel(status) {
  return {
    pending: 'Ожидает оплаты',
    cooking: 'Готовится',
    ready: 'Готово',
    completed: 'Завершён',
    cancelled: 'Отменён',
  }[status] || status;
}

/** Order status icon */
export function orderStatusIcon(status) {
  return {
    pending: '⏳',
    cooking: '🍳',
    ready: '✅',
    completed: '✔️',
    cancelled: '✕',
  }[status] || '📋';
}

/** Sum order items total */
export function orderTotal(items = []) {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

/** Format Firestore timestamp or Date → 'DD.MM.YY HH:MM' */
export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
