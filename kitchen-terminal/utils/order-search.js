import { db } from '../../shared/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { COL } from '../../shared/schema.js';

/**
 * Parse QR payload from client LK card.
 * @param {string} raw
 */
export function parseQrPayload(raw) {
  const text = raw.trim();
  if (text.startsWith('LK:')) {
    return { type: 'userId', value: text.slice(3) };
  }
  return { type: 'raw', value: text };
}

/**
 * @param {string} orderNumber
 * @param {string} orderNumberField
 */
function matchesOrderNumber(orderNumber, orderNumberField) {
  const q = orderNumber.trim();
  if (!q) return true;
  const field = String(orderNumberField);
  if (field.includes(q)) return true;
  const qNum = q.replace(/\D/g, '');
  const fNum = field.replace(/\D/g, '');
  if (qNum && fNum && Number(qNum) === Number(fNum)) return true;
  return field.padStart(3, '0').includes(q.padStart(3, '0'));
}

/**
 * Find kitchen orders by number, client name, or QR payload.
 * @param {Array<{ id: string, userId: string, orderNumber: string }>} orders
 * @param {{ orderNumber?: string, name?: string, qrPayload?: string }} criteria
 */
export async function findKitchenOrders(orders, { orderNumber = '', name = '', qrPayload = '' } = {}) {
  const hasNumber = Boolean(orderNumber.trim());
  const hasName = Boolean(name.trim());
  const hasQr = Boolean(qrPayload.trim());

  if (!hasNumber && !hasName && !hasQr) {
    throw new Error('Введите номер заказа, ФИО или отсканируйте QR.');
  }

  let userIds = null;

  if (hasQr) {
    const parsed = parseQrPayload(qrPayload);
    if (parsed.type === 'userId') {
      userIds = [parsed.value];
    } else {
      throw new Error('Неизвестный формат QR. Используйте карту из личного кабинета.');
    }
  }

  if (hasName) {
    const q = name.trim().toLowerCase();
    const usersSnap = await getDocs(collection(db, COL.USERS));
    const byName = usersSnap.docs
      .filter(d => d.data().name?.toLowerCase().includes(q))
      .map(d => d.id);

    if (byName.length === 0) {
      return [];
    }

    userIds = userIds
      ? userIds.filter(id => byName.includes(id))
      : byName;
  }

  let matched = [...orders];

  if (userIds !== null) {
    matched = matched.filter(o => userIds.includes(o.userId));
  }

  if (hasNumber) {
    matched = matched.filter(o => matchesOrderNumber(orderNumber, o.orderNumber));
  }

  return matched;
}

/**
 * @param {Array<{ id: string, userId: string, orderNumber: string }>} orders
 * @param {Record<string, { name?: string }>} usersById
 */
export function describeSearchResults(orders, usersById = {}) {
  return orders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    clientName: usersById[o.userId]?.name || 'Клиент',
    status: o.status,
  }));
}
