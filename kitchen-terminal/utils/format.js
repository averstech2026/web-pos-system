/** @returns {string} e.g. "12:45" */
export function fmtClock(d = new Date()) {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** @returns {string} e.g. "понедельник, 09 апреля 2024 г." */
export function fmtDateLong(d = new Date()) {
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const rest = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${weekdayCap}, ${rest}`;
}

/**
 * Elapsed mm:ss from Firestore timestamp or Date.
 * @param {import('firebase/firestore').Timestamp | Date | null | undefined} ts
 */
export function elapsedSince(ts) {
  if (!ts) return '00:00';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : ts.getTime?.() ?? 0;
  if (!ms) return '00:00';
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Expand order items into individual prep lines */
export function expandItemLines(items = []) {
  const lines = [];
  items.forEach(item => {
    for (let i = 0; i < item.quantity; i += 1) {
      lines.push({
        key: `${item.dishId}:${i}`,
        dishId: item.dishId,
        name: item.name,
        price: item.price,
      });
    }
  });
  return lines;
}

export function isLinePrepared(preparedLines, key) {
  return Array.isArray(preparedLines) && preparedLines.includes(key);
}

export function allLinesPrepared(items, preparedLines) {
  return expandItemLines(items).every(l => isLinePrepared(preparedLines, l.key));
}
