import { ORDER_STATUS } from '../../shared/schema.js';
import { orderTotal } from '../utils/order-format.js';
import {
  buildItemsByNameMap,
  kitchenWorkshopLabel,
  resolveDishCategory,
} from './kitchen-catalog.js';

export { buildItemsByNameMap };

/**
 * @param {Array<object>} orders
 * @param {object} filters
 * @param {string[]} [filters.shiftIds]
 * @param {string[]} [filters.employeeIds]
 * @param {string[]} [filters.locationIds]
 * @param {Map<string, object>} [filters.itemsById]
 * @param {Map<string, object>} [filters.rulesById]
 */
export function filterReportOrders(orders, {
  shiftIds = [],
  employeeIds = [],
  locationIds = [],
  itemsById = new Map(),
  rulesById = new Map(),
} = {}) {
  const shiftSet = shiftIds.length ? new Set(shiftIds) : null;
  const employeeSet = employeeIds.length ? new Set(employeeIds) : null;
  const locationSet = locationIds.length ? new Set(locationIds) : null;

  return orders.filter(order => {
    if (order.status === ORDER_STATUS.CANCELLED) return false;
    if (employeeSet && !employeeSet.has(order.userId)) return false;
    if (shiftSet && !shiftSet.has(order.timeSlot || '')) return false;
    if (locationSet) {
      const loc = resolveOrderLocation(order, itemsById, rulesById);
      if (!locationSet.has(loc.id)) return false;
    }
    return true;
  });
}

/**
 * @param {object} order
 * @param {Map<string, object>} itemsById
 * @returns {{ id: string, name: string }}
 */
/**
 * @param {object} order
 * @param {Map<string, object>} itemsById
 * @param {Map<string, { id: string, name: string }>} [rulesById]
 */
export function resolveOrderLocation(order, itemsById, rulesById = new Map()) {
  for (const line of order.items || []) {
    const ruleId = itemsById.get(line.dishId)?.availabilityRuleId;
    if (ruleId) {
      return { id: ruleId, name: rulesById.get(ruleId)?.name || ruleId };
    }
  }
  return { id: '__default__', name: 'Основная столовая' };
}

/** @param {Array<object>} orders */
export function collectShiftOptions(orders) {
  const set = new Set();
  for (const o of orders) {
    if (o.timeSlot) set.add(o.timeSlot);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** @param {Array<object>} orders @param {Map<string, object>} usersById */
export function collectEmployeeOptions(orders, usersById) {
  const ids = new Set();
  for (const o of orders) {
    if (o.userId && usersById.has(o.userId)) ids.add(o.userId);
  }
  return [...ids]
    .map(id => ({ id, name: usersById.get(id)?.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} itemsById
 * @param {Map<string, { id: string, name: string }>} [rulesById]
 */
export function collectLocationOptions(orders, itemsById, rulesById = new Map()) {
  const map = new Map([['__default__', 'Основная столовая']]);
  for (const rule of rulesById.values()) {
    map.set(rule.id, rule.name);
  }
  for (const o of orders) {
    const loc = resolveOrderLocation(o, itemsById, rulesById);
    if (!map.has(loc.id)) map.set(loc.id, loc.name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} usersById
 * @param {Map<string, object>} groupsById
 * @param {Map<string, object>} itemsById
 * @param {Map<string, { id: string, name: string }>} rulesById
 */
export function buildNutritionSummary(orders, usersById, groupsById, itemsById, rulesById) {
  /** @type {Map<string, object>} */
  const byUser = new Map();

  for (const order of orders) {
    const userId = order.userId;
    if (!userId) continue;

    if (!byUser.has(userId)) {
      const user = usersById.get(userId) || {};
      const group = groupsById.get(user.userGroupId || '');
      byUser.set(userId, {
        userId,
        personnelNumber: user.qrCode || user.id?.slice(0, 8) || '—',
        name: user.name || '—',
        organization: group?.name || '—',
        shifts: new Set(),
        orderCount: 0,
        totalSum: 0,
        orders: [],
      });
    }

    const row = byUser.get(userId);
    if (order.timeSlot) row.shifts.add(order.timeSlot);
    const sum = orderTotal(order.items);
    row.orderCount += 1;
    row.totalSum += sum;
    row.orders.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      dateSlot: order.dateSlot,
      timeSlot: order.timeSlot,
      location: resolveOrderLocationName(order, itemsById, rulesById),
      menu: resolveOrderMenuLabel(order, itemsById, rulesById),
      items: order.items || [],
      sum,
      note: order.note || '',
    });
  }

  return [...byUser.values()]
    .map(row => ({
      ...row,
      shift: row.shifts.size === 1
        ? [...row.shifts][0]
        : row.shifts.size > 1 ? 'Разные' : '—',
      shifts: undefined,
      orders: row.orders.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} usersById
 * @param {Map<string, object>} itemsById
 */
export function buildDishesReport(orders, usersById, itemsById) {
  /** @type {Map<string, object>} */
  const byDish = new Map();

  for (const order of orders) {
    for (const line of order.items || []) {
      const dishKey = line.dishId || line.name;
      const item = itemsById.get(line.dishId);
      const category = item?.category || 'Прочее';
      const qty = Number(line.quantity) || 0;
      const sum = (Number(line.price) || 0) * qty;

      if (!byDish.has(dishKey)) {
        byDish.set(dishKey, {
          dishKey,
          name: line.name || '—',
          category,
          totalQty: 0,
          totalSum: 0,
          details: [],
        });
      }

      const row = byDish.get(dishKey);
      row.totalQty += qty;
      row.totalSum += sum;
      const user = usersById.get(order.userId);
      row.details.push({
        userName: user?.name || '—',
        createdAt: order.createdAt,
        dateSlot: order.dateSlot,
        timeSlot: order.timeSlot,
        quantity: qty,
        orderNumber: order.orderNumber,
      });
    }
  }

  return [...byDish.values()]
    .sort((a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name, 'ru'));
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} usersById
 */
export function buildOrdersPaymentsReport(orders, usersById) {
  return [...orders]
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    })
    .map(order => {
      const user = usersById.get(order.userId);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        userName: user?.name || '—',
        paymentStatus: order.paymentStatus,
        total: orderTotal(order.items),
        items: order.items || [],
      };
    });
}

/**
 * @param {Array<object>} orders
 * @param {Map<string, object>} itemsById
 * @param {Map<string, object>} [itemsByName]
 * @param {{ sortDir?: 'asc' | 'desc' }} [opts]
 */
export function buildKitchenReport(orders, itemsById, itemsByName = buildItemsByNameMap([...itemsById.values()]), opts = {}) {
  const { sortDir = 'desc' } = opts;
  /** @type {Map<string, object>} */
  const byDish = new Map();

  for (const order of orders) {
    for (const line of order.items || []) {
      const dishKey = line.dishId || line.name;
      const category = resolveDishCategory(line, itemsById, itemsByName);
      const workshop = kitchenWorkshopLabel(category);
      const qty = Number(line.quantity) || 0;

      if (!byDish.has(dishKey)) {
        byDish.set(dishKey, {
          dishKey,
          name: line.name || '—',
          workshop,
          totalQty: 0,
        });
      }
      byDish.get(dishKey).totalQty += qty;
    }
  }

  return [...byDish.values()].sort((a, b) => {
    const qtyCmp = sortDir === 'desc' ? b.totalQty - a.totalQty : a.totalQty - b.totalQty;
    if (qtyCmp !== 0) return qtyCmp;
    return a.name.localeCompare(b.name, 'ru');
  });
}

function resolveOrderLocationName(order, itemsById, rulesById) {
  const loc = resolveOrderLocation(order, itemsById);
  if (loc.id === '__default__') return loc.name;
  return rulesById.get(loc.id)?.name || loc.name;
}

function resolveOrderMenuLabel(order, itemsById, rulesById) {
  const names = new Set();
  for (const line of order.items || []) {
    const ruleId = itemsById.get(line.dishId)?.availabilityRuleId;
    if (ruleId) names.add(rulesById.get(ruleId)?.name || ruleId);
  }
  if (!names.size) return 'Основное меню';
  return [...names].join(', ');
}
