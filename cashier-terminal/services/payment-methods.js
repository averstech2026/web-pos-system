import { fetchPaymentMethods } from '../../admin/services/payments-data.js';
import { POS_PAYMENT_TYPE_OPTIONS, normalizePosPaymentTypes } from '../../shared/pos-channel.js';

/** Demo catalog when Firebase is unavailable. */
export const DEMO_PAYMENT_METHODS = [
  { id: 'cash', name: 'Наличные' },
  { id: 'card', name: 'Банковские карты' },
  { id: 'internal', name: 'Внутренний платёж' },
  { id: 'dotation', name: 'Дотация' },
];

/**
 * Payment buttons for POS: intersection of channel allowed methods and POS types,
 * with names from the admin payment_methods catalog.
 * @param {object|null|undefined} channel
 * @param {Array<{ id: string, name?: string }>} catalog
 */
export function resolvePosPaymentMethodButtons(channel, catalog = []) {
  const allowedChannel = channel?.allowedPaymentMethods || [];
  const posTypes = normalizePosPaymentTypes(channel?.posPaymentTypes);
  const catalogById = new Map((catalog || []).map(m => [m.id, m]));

  let ids = posTypes;
  if (allowedChannel.length) {
    const allowedSet = new Set(allowedChannel);
    ids = posTypes.filter(id => allowedSet.has(id));
  }

  return ids.map(id => {
    const method = catalogById.get(id);
    const fallback = POS_PAYMENT_TYPE_OPTIONS.find(o => o.id === id);
    return {
      id,
      name: method?.name || fallback?.label || id,
    };
  });
}

/** @returns {Promise<Array<{ id: string, name: string }>>} */
export async function loadPosPaymentMethods() {
  try {
    const methods = await fetchPaymentMethods();
    return methods.map(m => ({ id: m.id, name: m.name }));
  } catch (err) {
    console.warn('[cashier-terminal] payment methods', err);
    return [...DEMO_PAYMENT_METHODS];
  }
}

/** @returns {Array<{ id: string, name: string }>} */
export function getDemoPaymentMethods() {
  return [...DEMO_PAYMENT_METHODS];
}
