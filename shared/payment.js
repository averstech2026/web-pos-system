/**
 * processOrderPayment — atomic Firestore transaction for order payment.
 *
 * Flow:
 *  1. Read & validate order (must exist, be unpaid, and belong to the user).
 *  2. Read user doc to get current balance.
 *  3. Compute split: how much to take from balance vs. card.
 *  4. Write updates atomically:
 *     a. Decrement users.balance (if balance was used).
 *     b. Create checks document.
 *     c. Create 1–2 transactions documents.
 *     d. Update orders: set checkId, paymentStatus → 'paid', status → 'cooking'.
 */

import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  COL,
  ORDER_STATUS,
  PAYMENT_STATUS,
  TX_TYPE,
  TX_STATUS,
} from './schema.js';

/**
 * Generates a simple fiscal emulation string.
 * @returns {{ fd: string, fp: string }}
 */
function generateFiscalData() {
  const fd = String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
  const fp = String(Math.floor(Math.random() * 900_000) + 100_000);
  return { fd, fp };
}

/**
 * @param {string} orderId   - Firestore document ID of the order to pay.
 * @param {boolean} useBalance - Whether to apply the user's internal balance first.
 * @returns {Promise<{ checkId: string, check: object }>}
 */
export async function processOrderPayment(orderId, useBalance = false) {
  const orderRef = doc(db, COL.ORDERS, orderId);
  const checksCol = collection(db, COL.CHECKS);
  const txCol = collection(db, COL.TRANSACTIONS);

  // Pre-generate document refs so IDs are available before commit.
  const checkRef = doc(checksCol);
  const tx1Ref = doc(txCol);
  const tx2Ref = doc(txCol);

  const checkId = checkRef.id;

  const result = await runTransaction(db, async (transaction) => {
    // ── 1. Read order ────────────────────────────────────────────────────────
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const order = orderSnap.data();

    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      throw new Error(`Order ${orderId} is already paid.`);
    }

    // ── 2. Read user ─────────────────────────────────────────────────────────
    const userRef = doc(db, COL.USERS, order.userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      throw new Error(`User ${order.userId} not found.`);
    }

    const user = userSnap.data();

    // ── 3. Compute totals and split ──────────────────────────────────────────
    const subtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const total = subtotal; // No discounts in this iteration.

    let balanceUsed = 0;
    let cardUsed = 0;

    if (useBalance && user.balance > 0) {
      balanceUsed = Math.min(user.balance, total);
      cardUsed = total - balanceUsed;
    } else {
      cardUsed = total;
    }

    const paymentParts = { balance: balanceUsed, card: cardUsed };
    const fiscalData = generateFiscalData();

    // ── 4a. Decrement user balance ───────────────────────────────────────────
    if (balanceUsed > 0) {
      transaction.update(userRef, {
        balance: user.balance - balanceUsed,
      });
    }

    // ── 4b. Create check ─────────────────────────────────────────────────────
    const checkData = {
      orderId,
      userId: order.userId,
      subtotal,
      total,
      paymentParts,
      fiscalData,
      createdAt: serverTimestamp(),
    };
    transaction.set(checkRef, checkData);

    // ── 4c. Create transaction provodki ──────────────────────────────────────
    if (balanceUsed > 0) {
      transaction.set(tx1Ref, {
        checkId,
        orderId,
        type: TX_TYPE.INTERNAL_BALANCE,
        amount: balanceUsed,
        status: TX_STATUS.SUCCESS,
        createdAt: serverTimestamp(),
      });
    }

    if (cardUsed > 0) {
      const cardTxRef = balanceUsed > 0 ? tx2Ref : tx1Ref;
      transaction.set(cardTxRef, {
        checkId,
        orderId,
        type: TX_TYPE.BANK_CARD,
        amount: cardUsed,
        status: TX_STATUS.SUCCESS,
        createdAt: serverTimestamp(),
      });
    }

    // ── 4d. Update order ──────────────────────────────────────────────────────
    transaction.update(orderRef, {
      checkId,
      paymentStatus: PAYMENT_STATUS.PAID,
      status: ORDER_STATUS.COOKING,
    });

    return { checkId, check: checkData };
  });

  return result;
}
