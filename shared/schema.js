/**
 * Firestore flat-collection schema definitions.
 * Each function returns a plain object matching the document shape.
 * Use these as authoritative data contracts across all modules.
 */

import { serverTimestamp } from 'firebase/firestore';

// ─── Collection names ────────────────────────────────────────────────────────

export const COL = {
  USERS: 'users',
  ITEMS: 'items',
  ORDERS: 'orders',
  CHECKS: 'checks',
  TRANSACTIONS: 'transactions',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
};

// ─── Allowed enum values ─────────────────────────────────────────────────────

/** @type {Record<string, string>} */
export const ROLES = {
  CLIENT: 'client',
  COOK: 'cook',
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

/** @type {Record<string, string>} */
export const ORDER_STATUS = {
  PENDING: 'pending',
  COOKING: 'cooking',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** @type {Record<string, string>} */
export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
};

/** @type {Record<string, string>} */
export const TX_TYPE = {
  INTERNAL_BALANCE: 'internal_balance',
  BANK_CARD: 'bank_card',
};

/** @type {Record<string, string>} */
export const TX_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
};

/** @type {Record<string, string>} */
export const NOTIF_TYPE = {
  ORDER: 'order',
  PROMO: 'promo',
  SYSTEM: 'system',
};

// ─── Document factory functions ───────────────────────────────────────────────

/**
 * users/{uid}
 * @param {object} p
 * @param {string} p.id      - Firebase Auth UID
 * @param {string} p.name
 * @param {string} p.email
 * @param {string} p.role    - one of ROLES.*
 * @param {number} [p.balance=0] - only meaningful for ROLES.CLIENT
 */
export function createUserDoc({
  id, name, email, role, balance = 0,
  birthDate = null, printReceipt = true,
}) {
  return {
    id,
    name,
    email,
    role,
    balance: role === ROLES.CLIENT ? balance : 0,
    birthDate,
    printReceipt,
  };
}

/**
 * items/{id}
 * @param {object} p
 * @param {string} p.name
 * @param {string} p.description
 * @param {number} p.price
 * @param {string} p.category
 * @param {boolean} [p.isAvailable=true]
 * @param {import('./item-availability.js').ItemAvailabilityRules} [p.availability]
 * @param {string|null} [p.imageUrl=null] - local path, e.g. '/products/caesar.jpg'
 * @param {{ protein?: number, fat?: number, carbs?: number, kcal?: number }|null} [p.nutrition=null]
 * @param {string[]} [p.allergens=[]] - allergen ids from settings/menu
 */
export function createItemDoc({
  name, description, price, category, isAvailable = true, availability = null,
  imageUrl = null, nutrition = null, allergens = [],
}) {
  const doc = { name, description, price, category, isAvailable };
  const rules = availability?.restricted ? availability : null;
  if (rules) doc.availability = rules;
  if (imageUrl) doc.imageUrl = imageUrl;
  if (nutrition) doc.nutrition = nutrition;
  if (allergens?.length) doc.allergens = allergens;
  return doc;
}

/**
 * orders/{id}
 * @param {object} p
 * @param {string} p.orderNumber  - 3-digit queue number, e.g. '042'
 * @param {string} p.userId
 * @param {string} p.dateSlot     - 'YYYY-MM-DD'
 * @param {string} p.timeSlot     - 'HH:MM'
 * @param {Array<{dishId:string, name:string, price:number, quantity:number, nutrition?:object}>} p.items
 */
export function createOrderDoc({ orderNumber, userId, dateSlot, timeSlot, items }) {
  return {
    orderNumber,
    userId,
    checkId: null,
    status: ORDER_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    items,
    dateSlot,
    timeSlot,
    createdAt: serverTimestamp(),
  };
}

/**
 * checks/{id}
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.userId
 * @param {number} p.subtotal
 * @param {number} p.total
 * @param {{ balance: number, card: number }} p.paymentParts
 * @param {{ fd: string, fp: string }} p.fiscalData
 */
export function createCheckDoc({ orderId, userId, subtotal, total, paymentParts, fiscalData }) {
  return {
    orderId,
    userId,
    subtotal,
    total,
    paymentParts,
    fiscalData,
    createdAt: serverTimestamp(),
  };
}

/**
 * transactions/{id}
 * @param {object} p
 * @param {string} p.checkId
 * @param {string} p.orderId
 * @param {string} p.type    - one of TX_TYPE.*
 * @param {number} p.amount
 * @param {string} [p.status='success']
 */
export function createTransactionDoc({ checkId, orderId, type, amount, status = TX_STATUS.SUCCESS }) {
  return {
    checkId,
    orderId,
    type,
    amount,
    status,
    createdAt: serverTimestamp(),
  };
}

/**
 * notifications/{id}
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.type    - one of NOTIF_TYPE.*
 * @param {string} p.title
 * @param {string} p.body
 * @param {boolean} [p.read=false]
 */
export function createNotificationDoc({ userId, type, title, body, read = false }) {
  return {
    userId,
    type,
    title,
    body,
    read,
    createdAt: serverTimestamp(),
  };
}

/** Notification sent to the client when kitchen marks an order ready. */
export function createOrderReadyNotificationDoc({ userId, orderNumber }) {
  return createNotificationDoc({
    userId,
    type: NOTIF_TYPE.ORDER,
    title: 'Заказ готов к выдаче',
    body: `Ваш заказ №${orderNumber} готов. Покажите QR-код на кассе.`,
  });
}
