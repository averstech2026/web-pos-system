/**
 * In-memory cart store — singleton that survives hash-navigation.
 * All pages import this module and share the same instance.
 */
export const cart = {
  _items: [],
  _dateSlot: null,
  _timeSlot: null,
  _listeners: new Set(),

  get items() { return [...this._items]; },
  get dateSlot() { return this._dateSlot; },
  get timeSlot() { return this._timeSlot; },

  setSlot(dateSlot, timeSlot) {
    this._dateSlot = dateSlot;
    this._timeSlot = timeSlot;
  },

  add(dishId, name, price, nutrition = null) {
    const ex = this._items.find(i => i.dishId === dishId);
    if (ex) {
      ex.quantity += 1;
    } else {
      const line = { dishId, name, price, quantity: 1 };
      if (nutrition) line.nutrition = nutrition;
      this._items.push(line);
    }
    this._notify();
  },

  decrement(dishId) {
    const idx = this._items.findIndex(i => i.dishId === dishId);
    if (idx === -1) return;
    if (this._items[idx].quantity > 1) {
      this._items[idx].quantity -= 1;
    } else {
      this._items.splice(idx, 1);
    }
    this._notify();
  },

  clear() {
    this._items = [];
    this._dateSlot = null;
    this._timeSlot = null;
    this._notify();
  },

  total() {
    return this._items.reduce((s, i) => s + i.price * i.quantity, 0);
  },

  count() {
    return this._items.reduce((s, i) => s + i.quantity, 0);
  },

  qty(dishId) {
    return this._items.find(i => i.dishId === dishId)?.quantity || 0;
  },

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  _notify() {
    this._listeners.forEach(fn => fn());
  },
};
