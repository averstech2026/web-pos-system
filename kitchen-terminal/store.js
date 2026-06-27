/** Shared kitchen-terminal search filter (persists across pages) */
let searchFilter = null;
const listeners = new Set();

/** @typedef {{ orderIds: string[], label?: string, scrollToId?: string }} KitchenSearchFilter */

export const kitchenSearch = {
  /** @returns {KitchenSearchFilter | null} */
  getFilter() {
    return searchFilter;
  },

  /** @param {KitchenSearchFilter | null} filter */
  setFilter(filter) {
    searchFilter = filter;
    listeners.forEach(fn => fn(filter));
  },

  clear() {
    searchFilter = null;
    listeners.forEach(fn => fn(null));
  },

  /** @param {(f: KitchenSearchFilter | null) => void} fn */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
