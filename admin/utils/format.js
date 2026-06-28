/** @param {number} n */
export function fmtMoney(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

/** @param {number} n */
export function fmtCount(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('ru-RU');
}

/** @param {string} iso YYYY-MM-DD */
export function fmtDayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** @param {number} hour 0–23 */
export function fmtHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** @param {number|null|undefined} minutes */
export function fmtDuration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return '< 1 мин';
  const m = Math.round(minutes);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} ч ${rem} мин` : `${h} ч`;
}

/** @param {number} n 0–100 */
export function fmtPercent(n) {
  const v = Number.isFinite(n) ? n : 0;
  return `${Math.round(v)}%`;
}

/** @param {number} current @param {number} previous @returns {number|null} */
export function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

/** @param {number|null} delta @param {{ invert?: boolean }} [opts] */
export function fmtDeltaVsYesterday(delta, opts = {}) {
  const { invert = false } = opts;
  if (delta == null) return { text: 'новое за день', className: 'metric-delta--new' };
  if (delta === 0) return { text: 'без изменений', className: 'metric-delta--flat' };
  const arrow = delta > 0 ? '↑' : '↓';
  const positive = invert ? delta < 0 : delta > 0;
  const className = positive ? 'metric-delta--up' : 'metric-delta--down';
  return { text: `${arrow} ${Math.abs(Math.round(delta))}% к вчера`, className };
}

/** @param {number|null|undefined} current @param {number|null|undefined} previous */
export function pctChangeNullable(current, previous) {
  if (current == null || previous == null) {
    return current != null && previous == null ? null : undefined;
  }
  return pctChange(current, previous);
}

/** @param {Date} [d] */
export function fmtTodayLong(d = new Date()) {
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const rest = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${cap}, ${rest}`;
}

/** @param {number} n */
export function fmtDecimal(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
