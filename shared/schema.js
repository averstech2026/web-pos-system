/**
 * Firestore flat-collection schema definitions.
 * Each function returns a plain object matching the document shape.
 * Use these as authoritative data contracts across all modules.
 */

import { serverTimestamp } from 'firebase/firestore';

// ─── Collection names ────────────────────────────────────────────────────────

export const COL = {
  USERS: 'users',
  USER_GROUPS: 'user_groups',
  LOYALTY_CATEGORIES: 'loyalty_categories',
  WALLETS: 'wallets',
  PAYMENT_METHODS: 'payment_methods',
  ITEMS: 'items',
  ORDERS: 'orders',
  CHECKS: 'checks',
  TRANSACTIONS: 'transactions',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
  AVAILABILITY_RULES: 'availability_rules',
  PROMO_RULES: 'promo_rules',
};

/** Subcollection under users/{userId} */
export const USER_SUB = {
  WALLET_HISTORY: 'wallet_history',
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

/** @type {Record<string, string>} */
export const USER_STATUS = {
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  FIRED: 'fired',
};

/** @deprecated Use loyalty_categories collection IDs */
export const LOYALTY_CATEGORY = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
};

/** @type {Record<string, string>} */
export const WALLET_OP_TYPE = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
};

/** Maps legacy/UI aliases to canonical wallet op types. */
export function normalizeWalletOpType(type) {
  if (type === 'deposit' || type === 'credit') return WALLET_OP_TYPE.DEPOSIT;
  if (type === 'withdraw' || type === 'debit') return WALLET_OP_TYPE.WITHDRAW;
  return type;
}

/** @type {Record<string, string>} */
export const RECEIPT_TYPE = {
  FISCAL: 'fiscal',
  NON_FISCAL: 'non_fiscal',
};

/** @type {Record<string, string>} */
export const PAYMENT_CURRENCY = {
  RUB: 'rub',
};

/** Default wallet templates for new CRM users */
export const DEFAULT_WALLET_DEFS = {
  personal: { name: 'Личные средства', restrictions: [] },
  dotation: { name: 'Дотация', restrictions: [] },
};

// ─── Document factory functions ───────────────────────────────────────────────

/**
 * @param {object} [user]
 * @returns {Record<string, { balance: number, name: string, restrictions: string[] }>}
 */
export function normalizeUserWallets(user = {}) {
  const legacyBalance = Number(user.balance) || 0;
  const wallets = user.wallets && typeof user.wallets === 'object' ? { ...user.wallets } : {};

  if (!wallets.personal) {
    wallets.personal = {
      balance: legacyBalance,
      name: DEFAULT_WALLET_DEFS.personal.name,
      restrictions: [...DEFAULT_WALLET_DEFS.personal.restrictions],
    };
  } else {
    wallets.personal = {
      name: wallets.personal.name || DEFAULT_WALLET_DEFS.personal.name,
      balance: Number(wallets.personal.balance) || 0,
      restrictions: Array.isArray(wallets.personal.restrictions)
        ? wallets.personal.restrictions
        : [],
    };
  }

  if (!wallets.dotation) {
    wallets.dotation = {
      balance: 0,
      name: DEFAULT_WALLET_DEFS.dotation.name,
      restrictions: [...DEFAULT_WALLET_DEFS.dotation.restrictions],
    };
  } else {
    wallets.dotation = {
      name: wallets.dotation.name || DEFAULT_WALLET_DEFS.dotation.name,
      balance: Number(wallets.dotation.balance) || 0,
      restrictions: Array.isArray(wallets.dotation.restrictions)
        ? wallets.dotation.restrictions
        : [],
    };
  }

  for (const [id, w] of Object.entries(wallets)) {
    if (id === 'personal' || id === 'dotation') continue;
    wallets[id] = {
      name: w?.name || id,
      balance: Number(w?.balance) || 0,
      restrictions: Array.isArray(w?.restrictions) ? w.restrictions : [],
    };
  }

  return wallets;
}

/** @param {Record<string, { balance: number }>} wallets */
export function totalWalletBalance(wallets) {
  return Object.values(wallets || {}).reduce((s, w) => s + (Number(w?.balance) || 0), 0);
}

/**
 * users/{uid}
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} p.email
 * @param {string} p.role
 * @param {number} [p.balance=0]
 * @param {string|null} [p.phone]
 * @param {string|null} [p.birthDate]
 * @param {boolean} [p.printReceipt]
 * @param {string} [p.status]
 * @param {string|null} [p.firedAt]
 * @param {string|null} [p.activeFrom]
 * @param {string|null} [p.activeTo]
 * @param {string|null} [p.userGroupId]
 * @param {string|null} [p.loyaltyCategoryId]
 * @param {string} [p.qrCode]
 * @param {string[]} [p.allergens]
 * @param {boolean} [p.allowsWebAccess]
 * @param {object} [p.wallets]
 */
export function createUserDoc({
  id,
  name,
  email,
  role,
  balance = 0,
  phone = null,
  birthDate = null,
  printReceipt = true,
  status = USER_STATUS.ACTIVE,
  firedAt = null,
  activeFrom = null,
  activeTo = null,
  userGroupId = null,
  loyaltyCategoryId = null,
  qrCode = '',
  allergens = [],
  allowsWebAccess = true,
  wallets = null,
}) {
  const normalizedWallets = normalizeUserWallets({
    balance: role === ROLES.CLIENT ? balance : 0,
    wallets,
  });

  const doc = {
    id,
    name,
    email,
    role,
    balance: role === ROLES.CLIENT ? totalWalletBalance(normalizedWallets) : 0,
    phone,
    birthDate,
    printReceipt,
    status,
    firedAt,
    activeFrom,
    activeTo,
    userGroupId,
    loyaltyCategoryId,
    qrCode,
    allergens,
    allowsWebAccess,
    wallets: normalizedWallets,
  };

  return doc;
}

/**
 * user_groups/{id}
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} [p.description]
 */
export function createUserGroupDoc({ id, name, description = '' }) {
  return { id, name, description };
}

/**
 * loyalty_categories/{id}
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {number} [p.discountPercent=0]
 * @param {number} [p.cashbackPercent=0]
 */
export function createLoyaltyCategoryDoc({
  id,
  name,
  discountPercent = 0,
  cashbackPercent = 0,
}) {
  return {
    id,
    name,
    discountPercent: Number(discountPercent) || 0,
    cashbackPercent: Number(cashbackPercent) || 0,
  };
}

/**
 * wallets/{id}
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} [p.description]
 * @param {string[]} [p.restrictions] - category group IDs
 */
export function createWalletDoc({ id, name, description = '', restrictions = [] }) {
  return {
    id,
    name,
    description: description || '',
    restrictions: Array.isArray(restrictions) ? restrictions : [],
  };
}

/**
 * payment_methods/{id}
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} [p.currency]
 * @param {string} [p.receiptType]
 * @param {string[]} [p.allowedCategories]
 * @param {string[]} [p.allowedUserGroups]
 */
export function createPaymentMethodDoc({
  id,
  name,
  currency = PAYMENT_CURRENCY.RUB,
  receiptType = RECEIPT_TYPE.FISCAL,
  allowedCategories = [],
  allowedUserGroups = [],
}) {
  return {
    id,
    name,
    currency: currency || PAYMENT_CURRENCY.RUB,
    receiptType: receiptType === RECEIPT_TYPE.NON_FISCAL
      ? RECEIPT_TYPE.NON_FISCAL
      : RECEIPT_TYPE.FISCAL,
    allowedCategories: Array.isArray(allowedCategories) ? allowedCategories : [],
    allowedUserGroups: Array.isArray(allowedUserGroups) ? allowedUserGroups : [],
  };
}

/**
 * users/{userId}/wallet_history/{id}
 * @param {object} p
 * @param {string} p.walletId
 * @param {string} p.walletName
 * @param {string} p.type - WALLET_OP_TYPE.*
 * @param {number} p.amount
 * @param {string} p.comment
 * @param {string} p.performedBy
 */
export function createWalletHistoryDoc({
  walletId,
  walletName,
  type,
  amount,
  comment = '',
  performedBy,
}) {
  return {
    walletId,
    walletName,
    type,
    amount,
    comment,
    performedBy,
    createdAt: serverTimestamp(),
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
 * @param {string|null} [p.availabilityRuleId=null] - ref to availability_rules/{id}
 * @param {string|null} [p.imageUrl=null] - local path, e.g. '/products/caesar.jpg'
 * @param {{ protein?: number, fat?: number, carbs?: number, kcal?: number }|null} [p.nutrition=null]
 * @param {string[]} [p.allergens=[]] - allergen ids from settings/menu
 */
export function createItemDoc({
  name, description, price, category, isAvailable = true, availabilityRuleId = null,
  imageUrl = null, nutrition = null, allergens = [],
}) {
  const doc = { name, description, price, category, isAvailable };
  if (availabilityRuleId) doc.availabilityRuleId = availabilityRuleId;
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
