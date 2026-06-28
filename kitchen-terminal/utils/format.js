/** Compact date/time for order card header */
export function fmtOrderCreatedShort(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
 * @param {import('firebase/firestore').Timestamp | Date | null | undefined} ts
 */
function tsToMs(ts) {
  if (!ts) return 0;
  return typeof ts.toMillis === 'function' ? ts.toMillis() : ts.getTime?.() ?? 0;
}

/** @param {number} seconds */
export function formatElapsed(seconds) {
  const sec = Math.max(0, Math.floor(seconds));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Elapsed mm:ss from Firestore timestamp or Date.
 * @param {import('firebase/firestore').Timestamp | Date | null | undefined} ts
 */
export function elapsedSince(ts) {
  const ms = tsToMs(ts);
  if (!ms) return '00:00';
  return formatElapsed((Date.now() - ms) / 1000);
}

/** Fixed prep time: createdAt → readyAt (or now while cooking). */
export function orderPrepSeconds(order) {
  const start = tsToMs(order?.createdAt);
  if (!start) return 0;
  const end = order?.status === 'ready' && order?.readyAt
    ? tsToMs(order.readyAt)
    : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Live issue time: readyAt → now (ready orders only). */
export function orderIssueSeconds(order) {
  if (order?.status !== 'ready') return 0;
  const ready = tsToMs(order?.readyAt);
  if (!ready) return 0;
  return Math.max(0, Math.floor((Date.now() - ready) / 1000));
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

export function isLineIssued(issuedLines, key) {
  return Array.isArray(issuedLines) && issuedLines.includes(key);
}

export function allLinesIssued(items, issuedLines) {
  return expandItemLines(items).every(l => isLineIssued(issuedLines, l.key));
}
