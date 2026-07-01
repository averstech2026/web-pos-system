/** Shared delivery-terminal search filter */
let searchFilter = null;
const listeners = new Set();

/** @typedef {{ orderIds: string[], label?: string, scrollToId?: string }} DeliverySearchFilter */

export const deliverySearch = {
  /** @returns {DeliverySearchFilter | null} */
  getFilter() {
    return searchFilter;
  },

  /** @param {DeliverySearchFilter | null} filter */
  setFilter(filter) {
    searchFilter = filter;
    listeners.forEach(fn => fn(filter));
  },

  clear() {
    searchFilter = null;
    listeners.forEach(fn => fn(null));
  },

  /** @param {(f: DeliverySearchFilter | null) => void} fn */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
