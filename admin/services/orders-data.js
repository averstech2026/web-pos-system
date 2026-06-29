import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL, ORDER_STATUS, ROLES } from '../../shared/schema.js';
import { endOfDay, startOfDay, toDateInputValue } from '../utils/dates.js';

/**
 * @param {Date} start
 * @param {Date} end
 * @param {'createdAt' | 'dateSlot'} dateField
 */
export async function fetchOrdersFiltered(start, end, dateField = 'createdAt') {
  let snap;

  if (dateField === 'dateSlot') {
    const from = toDateInputValue(start);
    const to = toDateInputValue(end);
    const q = query(
      collection(db, COL.ORDERS),
      where('dateSlot', '>=', from),
      where('dateSlot', '<=', to),
    );
    snap = await getDocs(q);
  } else {
    const q = query(
      collection(db, COL.ORDERS),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
    );
    snap = await getDocs(q);
  }

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

export async function fetchClients() {
  const q = query(collection(db, COL.USERS), where('role', '==', ROLES.CLIENT));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

export async function fetchMenuItems() {
  const snap = await getDocs(collection(db, COL.ITEMS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * @param {Array<object>} orders
 * @param {string[]} [statuses] empty = all
 */
export function filterByStatus(orders, statuses) {
  if (!statuses?.length) return orders;
  const set = new Set(statuses);
  return orders.filter(o => set.has(o.status));
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} usersById
 * @param {object} filters
 */
export function filterOrders(orders, usersById, {
  statuses = [],
  search = '',
  groupIds = [],
  loyaltyCategoryIds = [],
} = {}) {
  let result = filterByStatus(orders, statuses);

  const q = search.trim().toLowerCase();
  const groupSet = groupIds.length ? new Set(groupIds) : null;
  const loyaltySet = loyaltyCategoryIds.length ? new Set(loyaltyCategoryIds) : null;

  return result.filter(order => {
    const user = usersById.get(order.userId);

    if (groupSet && !groupSet.has(user?.userGroupId || '')) return false;

    if (loyaltySet) {
      const catKey = user?.loyaltyCategoryId || '__none__';
      if (!loyaltySet.has(catKey)) return false;
    }

    if (!q) return true;

    const hay = [
      order.orderNumber,
      user?.name,
      user?.email,
      user?.phone,
    ].filter(Boolean).join(' ').toLowerCase();

    return hay.includes(q);
  });
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} itemsById
 * @returns {Map<string, Map<string, { category: string, name: string, qty: number }>>}
 */
export function aggregateByPickupDate(orders, itemsById) {
  const byDate = new Map();

  for (const order of orders) {
    if (order.status === ORDER_STATUS.CANCELLED) continue;
    const dateKey = order.dateSlot || '—';
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());

    const dishes = byDate.get(dateKey);
    for (const line of order.items || []) {
      const category = itemsById.get(line.dishId)?.category || 'Прочее';
      const dishKey = `${category}\0${line.name}`;
      const prev = dishes.get(dishKey);
      dishes.set(dishKey, {
        category,
        name: line.name,
        qty: (prev?.qty || 0) + (line.quantity || 0),
      });
    }
  }

  return byDate;
}

/** @param {Map<string, object>} dishesMap */
export function groupDishesByCategory(dishesMap) {
  const byCat = new Map();
  for (const dish of dishesMap.values()) {
    if (!byCat.has(dish.category)) byCat.set(dish.category, []);
    byCat.get(dish.category).push(dish);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'ru'));
  }
  return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
}
