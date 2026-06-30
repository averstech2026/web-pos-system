import { addDoc, collection } from 'firebase/firestore';
import { db } from '@shared/firebase.js';
import { COL, ORDER_SOURCE, createOrderDoc } from '@shared/schema.js';
import { processOrderPayment } from '@shared/payment.js';
import { state } from '../core/state.js';
import { getCartTotal, getSubtotal } from '../core/cart.js';
import { UPSELL_PRICE, DEMO_CUSTOMER } from '../data/constants.js';
import { PRODUCTS } from './catalog.js';
import { ensureKioskSession, ensureKioskGuestUser, KIOSK_GUEST_USER_ID } from './auth.js';

function isDevPaymentFallbackError(err) {
  const code = err?.code || '';
  const message = err?.message || '';
  return code === 'permission-denied'
    || code === 'resource-exhausted'
    || /quota/i.test(message);
}

async function processKioskPayment(orderId, useBalance) {
  try {
    return await processOrderPayment(orderId, useBalance);
  } catch (err) {
    if (import.meta.env.DEV && isDevPaymentFallbackError(err)) {
      console.warn('[kiosk] demo payment fallback (dev only)', err);
      return {
        checkId: `demo-check-${orderId}`,
        check: { total: getCartTotal(), subtotal: getSubtotal() },
      };
    }
    throw err;
  }
}

function orderNum() {
  return String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
}

function currentSlot() {
  const now = new Date();
  return {
    dateSlot: now.toISOString().slice(0, 10),
    timeSlot: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

function buildOrderItems() {
  const items = [];
  for (const [id, qty] of Object.entries(state.cart)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p || qty <= 0) continue;
    items.push({
      dishId: p.id,
      name: p.name,
      price: p.price,
      quantity: qty,
    });
  }
  if (state.upsellAdded) {
    items.push({
      dishId: 'kiosk-upsell-bag',
      name: 'Пакет',
      price: UPSELL_PRICE,
      quantity: 1,
    });
  }
  if (!items.length) {
    const cartIds = Object.keys(state.cart);
    if (cartIds.length) {
      throw new Error('Товары в корзине недоступны. Вернитесь в меню и добавьте блюда заново.');
    }
    throw new Error('Корзина пуста');
  }
  return items;
}

/**
 * @param {object} p
 * @param {boolean} p.useBalance
 * @param {string} [p.customerUserId]
 */
export async function submitKioskOrder({ useBalance, customerUserId }) {
  const items = buildOrderItems();

  await ensureKioskSession();

  const userId = customerUserId || KIOSK_GUEST_USER_ID;
  if (userId === KIOSK_GUEST_USER_ID) {
    await ensureKioskGuestUser();
  }
  const { dateSlot, timeSlot } = currentSlot();

  const orderPayload = createOrderDoc({
    orderNumber: orderNum(),
    userId,
    dateSlot,
    timeSlot,
    items,
    source: ORDER_SOURCE.KIOSK,
  });

  const ref = await addDoc(collection(db, COL.ORDERS), orderPayload);
  await processKioskPayment(ref.id, useBalance);

  return {
    orderId: ref.id,
    orderNumber: orderPayload.orderNumber,
    total: getCartTotal(),
    subtotal: getSubtotal(),
  };
}

/** @param {boolean} useBalance */
export async function completeKioskPayment(useBalance) {
  const customerUserId = useBalance && state.customer
    ? (state.customer.userId || DEMO_CUSTOMER.userId)
    : KIOSK_GUEST_USER_ID;
  return submitKioskOrder({ useBalance, customerUserId });
}
