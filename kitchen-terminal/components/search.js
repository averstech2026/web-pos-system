import { kitchenSearch } from '../store.js';
import { openOrderSearchModal } from './order-search-modal.js';

/**
 * @param {object} p
 * @param {Array<object>} p.orders
 * @param {(path: string) => void} p.navigate
 */
export function openKitchenOrderSearch({ orders, navigate }) {
  openOrderSearchModal({
    orders,
    onApply: ({ orderIds, label, scrollToId }) => {
      kitchenSearch.setFilter({ orderIds, label, scrollToId });
      navigate('/orders');
    },
  });
}
