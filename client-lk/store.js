/**
 * In-memory cart store — singleton that survives hash-navigation.
 * All pages import this module and share the same instance.
 */
import { applyPromoRules } from '../shared/apply-promo-rules.js';

export const cart = {
  _baseItems: [],
  _dateSlot: null,
  _timeSlot: null,
  _listeners: new Set(),
  _promoContext: null,
  _promoResult: null,

  get items() {
    return [...(this._promoResult?.items || this._baseItems)];
  },

  get baseItems() {
    return [...this._baseItems];
  },

  get appliedPromoIds() {
    return [...(this._promoResult?.appliedPromoIds || [])];
  },

  get discountTotal() {
    return this._promoResult?.discountTotal || 0;
  },

  get bonusGrants() {
    return [...(this._promoResult?.bonusGrants || [])];
  },

  get dateSlot() { return this._dateSlot; },
  get timeSlot() { return this._timeSlot; },

  /**
   * @param {object} ctx
   * @param {import('../shared/promo-rules.js').PromoRuleDoc[]} ctx.activePromos
   * @param {import('../shared/availability-rules.js').AvailabilityRuleDoc[]} ctx.allAvailabilityRules
   * @param {Array<{ id: string, name: string, price?: number, category?: string, nutrition?: object }>} ctx.catalogItems
   * @param {import('../shared/menu-catalog.js').CategoryGroup[]} ctx.categoryGroups
   * @param {import('../shared/promo-rules.js').ClientGroupId} [ctx.clientSegment]
   */
  setPromoContext(ctx) {
    this._promoContext = ctx;
    this._recomputePromos();
  },

  setSlot(dateSlot, timeSlot) {
    this._dateSlot = dateSlot;
    this._timeSlot = timeSlot;
    this._recomputePromos();
  },

  add(dishId, name, price, nutrition = null) {
    const ex = this._baseItems.find(i => i.dishId === dishId);
    if (ex) {
      ex.quantity += 1;
    } else {
      const line = { dishId, name, price, quantity: 1 };
      if (nutrition) line.nutrition = nutrition;
      this._baseItems.push(line);
    }
    this._recomputePromos();
    this._notify();
  },

  decrement(dishId) {
    const idx = this._baseItems.findIndex(i => i.dishId === dishId);
    if (idx === -1) return;
    if (this._baseItems[idx].quantity > 1) {
      this._baseItems[idx].quantity -= 1;
    } else {
      this._baseItems.splice(idx, 1);
    }
    this._recomputePromos();
    this._notify();
  },

  clear() {
    this._baseItems = [];
    this._dateSlot = null;
    this._timeSlot = null;
    this._promoResult = null;
    this._notify();
  },

  total() {
    return this.items.reduce((s, i) => s + i.price * i.quantity, 0);
  },

  count() {
    return this.items.reduce((s, i) => s + i.quantity, 0);
  },

  qty(dishId) {
    return this._baseItems.find(i => i.dishId === dishId)?.quantity || 0;
  },

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  _recomputePromos() {
    if (!this._promoContext?.activePromos?.length) {
      this._promoResult = null;
      return;
    }

    this._promoResult = applyPromoRules(
      this._baseItems,
      this._promoContext.activePromos,
      this._promoContext.allAvailabilityRules || [],
      {
        catalogItems: this._promoContext.catalogItems || [],
        categoryGroups: this._promoContext.categoryGroups || [],
        slot: {},
        clientSegment: this._promoContext.clientSegment || 'all',
      },
    );
  },

  _notify() {
    this._listeners.forEach(fn => fn());
  },
};
