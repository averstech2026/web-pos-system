import { db } from './firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { COL, ORDER_STATUS, PAYMENT_STATUS } from './schema.js';

/**
 * Cancel an unpaid order owned by the current user.
 * @param {string} orderId
 * @returns {Promise<void>}
 */
export async function cancelUnpaidOrder(orderId) {
  const orderRef = doc(db, COL.ORDERS, orderId);
  const snap = await getDoc(orderRef);

  if (!snap.exists()) {
    throw new Error('Заказ не найден.');
  }

  const order = snap.data();

  if (order.paymentStatus !== PAYMENT_STATUS.UNPAID) {
    throw new Error('Оплаченный заказ нельзя отменить.');
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return;
  }

  if (order.status !== ORDER_STATUS.PENDING) {
    throw new Error('Этот заказ уже передан на кухню и не может быть отменён.');
  }

  await updateDoc(orderRef, { status: ORDER_STATUS.CANCELLED });
}

/** @param {object} order */
export function canCancelOrder(order) {
  return order.paymentStatus === PAYMENT_STATUS.UNPAID
    && order.status === ORDER_STATUS.PENDING;
}
