import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL, ROLES, ORDER_STATUS, PAYMENT_STATUS } from '../../shared/schema.js';
import { eachDayKey, endOfDay, startOfDay } from '../utils/dates.js';
import { pctChange, pctChangeNullable } from '../utils/format.js';

/**
 * @param {Date} start
 * @param {Date} end
 */
async function fetchOrdersInRange(start, end) {
  const q = query(
    collection(db, COL.ORDERS),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * @param {Date} start
 * @param {Date} end
 */
async function fetchChecksInRange(start, end) {
  const q = query(
    collection(db, COL.CHECKS),
    where('createdAt', '>=', Timestamp.fromDate(start)),
    where('createdAt', '<=', Timestamp.fromDate(end)),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function countClients() {
  const q = query(collection(db, COL.USERS), where('role', '==', ROLES.CLIENT));
  const snap = await getDocs(q);
  return snap.size;
}

function sumCheckTotals(checks) {
  return checks.reduce((sum, c) => sum + (Number(c.total) || 0), 0);
}

/** Средний чек = выручка / количество чеков (оплаченных заказов) */
function avgCheckFromChecks(revenue, checks) {
  const count = checks.length;
  return count > 0 ? revenue / count : 0;
}

function uniqueClientIdsFromChecks(checks) {
  return new Set(checks.map(c => c.userId).filter(Boolean));
}

/** Exclude cancelled orders from analytics */
function activeOrders(orders) {
  return orders.filter(o => o.status !== ORDER_STATUS.CANCELLED);
}

function tsToMs(ts) {
  if (!ts) return null;
  return typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

/** @param {Array<{ createdAt?: object, paidAt?: object, readyAt?: object }>} orders */
function avgPrepTimeMinutes(orders) {
  const mins = [];
  for (const o of orders) {
    const start = tsToMs(o.paidAt) || tsToMs(o.createdAt);
    const end = tsToMs(o.readyAt);
    if (start == null || end == null) continue;
    const m = (end - start) / 60_000;
    if (m >= 0) mins.push(m);
  }
  if (!mins.length) return null;
  return mins.reduce((a, b) => a + b, 0) / mins.length;
}

function sumPaymentParts(checks) {
  return checks.reduce(
    (acc, c) => ({
      balance: acc.balance + (Number(c.paymentParts?.balance) || 0),
      card: acc.card + (Number(c.paymentParts?.card) || 0),
    }),
    { balance: 0, card: 0 },
  );
}

/** @param {Array<{ items?: Array<{ quantity?: number }> }>} orders */
function countItemsSold(orders) {
  let totalQty = 0;
  for (const o of orders) {
    for (const item of o.items || []) {
      totalQty += item.quantity || 0;
    }
  }
  return totalQty;
}

/**
 * @param {Array<{ items?: Array<{ name: string, quantity: number }> }>} orders
 * @param {number} [limit=8]
 */
export function aggregateTopDishes(orders, limit = 8) {
  const counts = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = item.name || 'Без названия';
      counts.set(key, (counts.get(key) || 0) + (item.quantity || 0));
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
}

/**
 * @param {Array<{ createdAt?: import('firebase/firestore').Timestamp }>} orders
 */
export function aggregateOrdersByHour(orders) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const order of orders) {
    const ts = order.createdAt?.toDate?.();
    if (!ts) continue;
    buckets[ts.getHours()].count += 1;
  }
  return buckets;
}

/**
 * @param {Array<{ createdAt?: import('firebase/firestore').Timestamp }>} orders
 * @param {Date} start
 * @param {Date} end
 */
export function aggregateOrdersByDay(orders, start, end) {
  const keys = eachDayKey(start, end);
  const map = Object.fromEntries(keys.map(k => [k, 0]));

  for (const order of orders) {
    const ts = order.createdAt?.toDate?.();
    if (!ts) continue;
    const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
    if (key in map) map[key] += 1;
  }

  return keys.map(key => ({ key, count: map[key] }));
}

/** Оперативные метрики за сегодня + сравнение с вчера */
export async function fetchDashboardSnapshot() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);

  const [
    ordersToday,
    ordersYesterday,
    checksToday,
    checksYesterday,
    clientsTotal,
  ] = await Promise.all([
    fetchOrdersInRange(todayStart, todayEnd),
    fetchOrdersInRange(yesterdayStart, yesterdayEnd),
    fetchChecksInRange(todayStart, todayEnd),
    fetchChecksInRange(yesterdayStart, yesterdayEnd),
    countClients(),
  ]);

  const todayActive = activeOrders(ordersToday);
  const todayPaid = todayActive.filter(o => o.paymentStatus === PAYMENT_STATUS.PAID);
  const yesterdayActive = activeOrders(ordersYesterday);
  const yesterdayPaid = yesterdayActive.filter(o => o.paymentStatus === PAYMENT_STATUS.PAID);

  const revenueToday = sumCheckTotals(checksToday);
  const revenueYesterday = sumCheckTotals(checksYesterday);
  const ordersTodayCount = todayActive.length;
  const ordersYesterdayCount = yesterdayActive.length;

  const avgCheckToday = avgCheckFromChecks(revenueToday, checksToday);
  const avgCheckYesterday = avgCheckFromChecks(revenueYesterday, checksYesterday);
  const avgPrepMin = avgPrepTimeMinutes(todayPaid);
  const avgPrepYesterday = avgPrepTimeMinutes(yesterdayPaid);

  const paymentPartsToday = sumPaymentParts(checksToday);
  const portionsSoldToday = countItemsSold(todayPaid);

  return {
    ordersToday: ordersTodayCount,
    ordersTodayDelta: pctChange(ordersTodayCount, ordersYesterdayCount),
    ordersYesterday: ordersYesterdayCount,
    revenueToday,
    revenueTodayDelta: pctChange(revenueToday, revenueYesterday),
    revenueYesterday,
    clientsTotal,
    avgCheckToday,
    avgCheckTodayDelta: pctChangeNullable(avgCheckToday, checksYesterday.length ? avgCheckYesterday : null),
    avgCheckYesterday,
    checksTodayCount: checksToday.length,
    checksYesterdayCount: checksYesterday.length,
    uniqueClientsToday: uniqueClientIdsFromChecks(checksToday).size,
    avgPrepMin,
    avgPrepMinDelta: pctChangeNullable(avgPrepMin, avgPrepYesterday),
    avgPrepYesterday,
    inProgress: todayActive.filter(
      o => o.status === ORDER_STATUS.COOKING || o.status === ORDER_STATUS.READY,
    ).length,
    completedToday: todayActive.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
    balanceShare: revenueToday > 0 ? (paymentPartsToday.balance / revenueToday) * 100 : 0,
    balanceAmount: paymentPartsToday.balance,
    avgItemsPerOrder: todayPaid.length > 0 ? portionsSoldToday / todayPaid.length : 0,
    portionsSoldToday,
    cancelledToday: ordersToday.filter(o => o.status === ORDER_STATUS.CANCELLED).length,
  };
}

/**
 * Period analytics for charts and filtered summary.
 * @param {Date} start
 * @param {Date} end
 */
export async function fetchPeriodAnalytics(start, end) {
  const [orders, checks] = await Promise.all([
    fetchOrdersInRange(start, end),
    fetchChecksInRange(start, end),
  ]);

  const filtered = activeOrders(orders);
  const revenue = sumCheckTotals(checks);
  const uniqueClients = uniqueClientIdsFromChecks(checks);

  return {
    ordersCount: filtered.length,
    revenue,
    avgCheck: avgCheckFromChecks(revenue, checks),
    checksCount: checks.length,
    uniqueClients: uniqueClients.size,
    ordersByHour: aggregateOrdersByHour(filtered),
    ordersByDay: aggregateOrdersByDay(filtered, start, end),
    topDishes: aggregateTopDishes(filtered),
  };
}
