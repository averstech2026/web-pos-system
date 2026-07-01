import { deliverySearch } from '../store.js';
import { openOrderSearchModal } from './order-search-modal.js';

/**
 * @param {object} p
 * @param {Array<object>} p.orders
 * @param {{ focusQr?: boolean }} [p.options]
 */
export function openDeliveryOrderSearch({ orders, options = {} }) {
  openOrderSearchModal({
    orders,
    focusQr: options.focusQr,
    onApply: ({ orderIds, label, scrollToId }) => {
      deliverySearch.setFilter({ orderIds, label, scrollToId });
    },
  });
}
