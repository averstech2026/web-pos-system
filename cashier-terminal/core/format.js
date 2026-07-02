/** @param {number} value */
export function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** @param {number} value */
export function formatMoneyShort(value) {
  return `${formatMoney(value)}р.`;
}

/** @param {Date} [date] */
export function formatClock(date = new Date()) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** @param {Date} [date] */
export function formatDateLong(date = new Date()) {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).replace(' г.', 'г.');
}

/** @param {Date|import('firebase/firestore').Timestamp|null|undefined} ts */
export function formatOrderCreated(ts) {
  if (!ts) return '—';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!date) return '—';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${d}.${m}.${y}, ${h}:${min}:${s}`;
}

/** @param {string} s */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {string} s */
export function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
