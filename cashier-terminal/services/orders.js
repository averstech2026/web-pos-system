import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';
import { finalizePosOrderPayment as persistPosOrderPayment } from '../../shared/pos-payment.js';
import {
  COL,
  ORDER_SOURCE,
  ORDER_STATUS,
  PAYMENT_STATUS,
  createOrderDoc,
} from '../../shared/schema.js';
import { state, getTotal } from '../core/state.js';
import { isDemoModeActive } from './dev-demo.js';

function orderNum() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function currentSlot() {
  const now = new Date();
  return {
    dateSlot: now.toISOString().slice(0, 10),
    timeSlot: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

/** @returns {string} */
function resolveOrderUserId() {
  return state.guest?.id || auth.currentUser?.uid || 'pos-demo';
}

/** @returns {import('../core/state.js').state.currentOrder} */
export async function startNewPosOrder() {
  const createdAt = new Date();
  const orderNumber = orderNum();
  const { dateSlot, timeSlot } = currentSlot();
  const userId = resolveOrderUserId();

  if (isDemoModeActive()) {
    state.currentOrder = { id: `demo-order-${Date.now()}`, orderNumber, createdAt };
    return state.currentOrder;
  }

  const payload = createOrderDoc({
    orderNumber,
    userId,
    dateSlot,
    timeSlot,
    items: [],
    source: ORDER_SOURCE.POS,
  });
  payload.status = ORDER_STATUS.PENDING;
  payload.paymentStatus = PAYMENT_STATUS.UNPAID;
  payload.cashierLogin = state.cashier?.login || state.cashier?.name || null;
  payload.posStationName = state.channel?.stationName || null;
  payload.posPointName = state.channel?.pointName || null;

  const ref = await addDoc(collection(db, COL.ORDERS), payload);
  state.currentOrder = { id: ref.id, orderNumber, createdAt };
  return state.currentOrder;
}

/** @returns {Promise<import('../core/state.js').state.currentOrder>} */
export async function ensureCurrentPosOrder() {
  if (state.currentOrder?.id && state.currentOrder?.orderNumber) {
    return state.currentOrder;
  }
  return startNewPosOrder();
}

function buildReceiptItems() {
  return state.receiptLines.map(line => ({
    dishId: line.productId,
    name: line.name,
    price: line.price,
    quantity: line.quantity,
  }));
}

/**
 * Persist paid receipt, split payments, check and transactions; open a new bill.
 * @param {Array<{ method: string, methodId?: string, amount: number, at?: Date }>} [payments]
 */
export async function finalizePosOrderOnPayment(payments = []) {
  const order = state.currentOrder;
  const items = buildReceiptItems();
  const orderTotal = getTotal();

  if (order?.id && !isDemoModeActive() && items.length && payments.length) {
    await persistPosOrderPayment({
      orderId: order.id,
      payments: payments.map(p => ({
        methodId: p.methodId || '',
        method: p.method,
        amount: Number(p.amount) || 0,
        at: p.at instanceof Date ? p.at : new Date(),
      })),
      items,
      orderTotal,
      guestId: state.guest?.id || null,
      guestName: state.guest?.fullName || state.guest?.name || null,
      cashierLogin: state.cashier?.login || state.cashier?.name || null,
      posStationName: state.channel?.stationName || null,
      posPointName: state.channel?.pointName || null,
      performedBy: state.cashier?.login || 'pos-cashier',
    });
  } else if (order?.id && !isDemoModeActive() && items.length) {
    await updateDoc(doc(db, COL.ORDERS, order.id), {
      items,
      userId: resolveOrderUserId(),
      cashierLogin: state.cashier?.login || state.cashier?.name || null,
      posStationName: state.channel?.stationName || null,
      posPointName: state.channel?.pointName || null,
    });
  }

  return startNewPosOrder();
}
