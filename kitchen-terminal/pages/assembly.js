import { db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot, getDocs,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import {
  renderKitchenShell, startClock, stopClock, bindKitchenNav,
} from '../components/layout.js';
import { openKitchenOrderSearch } from '../components/search.js';

const CATEGORY_ORDER = [
  'Салаты',
  'Первые блюда',
  'Вторые блюда',
  'Выпечка',
  'Напитки',
];

export class AssemblyPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.orders = [];
    this.itemCategories = new Map();
    this.filters = { timeSlot: '', category: '' };
    this._unsub = null;
    this.init();
  }

  async init() {
    await this.loadItemCategories();
    this.subscribe();
  }

  async loadItemCategories() {
    const snap = await getDocs(collection(db, COL.ITEMS));
    snap.docs.forEach(d => {
      const data = d.data();
      this.itemCategories.set(d.id, data.category || 'Прочее');
      this.itemCategories.set(data.name, data.category || 'Прочее');
    });
  }

  subscribe() {
    const q = query(
      collection(db, COL.ORDERS),
      where('paymentStatus', '==', 'paid'),
      where('status', '==', ORDER_STATUS.COOKING),
    );

    this._unsub = onSnapshot(q, snap => {
      this.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.render();
    });
  }

  getCategory(item) {
    return this.itemCategories.get(item.dishId)
      || this.itemCategories.get(item.name)
      || 'Прочее';
  }

  timeSlotOptions() {
    const slots = new Set(this.orders.map(o => o.timeSlot).filter(Boolean));
    return [...slots].sort();
  }

  categoryOptions() {
    const cats = new Set();
    this.orders.forEach(o => {
      (o.items || []).forEach(i => cats.add(this.getCategory(i)));
    });
    return [...cats].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'ru');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  aggregateDishes() {
    /** @type {Map<string, { name: string, category: string, count: number, orderNumbers: Set<string> }>} */
    const map = new Map();

    this.orders.forEach(order => {
      if (this.filters.timeSlot && order.timeSlot !== this.filters.timeSlot) return;

      (order.items || []).forEach(item => {
        const category = this.getCategory(item);
        if (this.filters.category && category !== this.filters.category) return;

        const key = `${category}::${item.name}`;
        if (!map.has(key)) {
          map.set(key, {
            name: item.name,
            category,
            count: 0,
            orderNumbers: new Set(),
          });
        }
        const row = map.get(key);
        row.count += item.quantity;
        row.orderNumbers.add(order.orderNumber);
      });
    });

    const byCategory = new Map();
    map.forEach(row => {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category).push(row);
    });

    byCategory.forEach(rows => {
      rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    });

    return [...byCategory.entries()].sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'ru');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  renderToolbar() {
    const slots = this.timeSlotOptions();
    const cats = this.categoryOptions();

    return `
      <div class="kt-toolbar-inner">
        <span class="kt-toolbar-label">Необходимо приготовить:</span>
        <select class="kt-filter kt-filter--time" id="filter-time">
          <option value="">Все слоты</option>
          ${slots.map(s => `
            <option value="${s}" ${this.filters.timeSlot === s ? 'selected' : ''}>К ${s}</option>
          `).join('')}
        </select>
        <select class="kt-filter" id="filter-category">
          <option value="">Все категории</option>
          ${cats.map(c => `
            <option value="${c}" ${this.filters.category === c ? 'selected' : ''}>${c}</option>
          `).join('')}
        </select>
        <button class="btn btn-outline btn-outline-danger btn-pill btn-press kt-reset-btn"
                type="button" id="btn-reset-filters">
          Сбросить
        </button>
      </div>
    `;
  }

  renderSections() {
    const groups = this.aggregateDishes();
    if (groups.length === 0) {
      return `<p class="kt-empty">Нет блюд к сборке</p>`;
    }

    return groups.map(([category, rows]) => `
      <section class="kt-assembly-section card">
        <h2 class="kt-assembly-title">${category.toUpperCase()}</h2>
        <ul class="kt-assembly-list">
          <li class="kt-assembly-header">
            <span class="kt-assembly-col-name">название</span>
            <span class="kt-assembly-col-qty">кол-во</span>
            <span class="kt-assembly-col-orders">номер заказа</span>
          </li>
          ${rows.map(row => `
            <li class="kt-assembly-row">
              <span class="kt-assembly-name">${row.name}</span>
              <span class="kt-assembly-badge">${row.count}</span>
              <span class="kt-assembly-orders" title="Номера заказов">
                ${[...row.orderNumbers].sort((a, b) => Number(a) - Number(b)).join(', ')}
              </span>
            </li>
          `).join('')}
        </ul>
      </section>
    `).join('');
  }

  render() {
    this.container.innerHTML = renderKitchenShell({
      title: 'Кухонный терминал',
      activeTab: 'assembly',
      toolbarHtml: this.renderToolbar(),
      bodyHtml: `<div class="kt-assembly-wrap">${this.renderSections()}</div>`,
    });

    startClock();
    bindKitchenNav(this.container, this.navigate, {
      onSearch: () => openKitchenOrderSearch({ orders: this.orders, navigate: this.navigate }),
    });

    document.getElementById('filter-time')?.addEventListener('change', e => {
      this.filters.timeSlot = e.target.value;
      this.render();
    });
    document.getElementById('filter-category')?.addEventListener('change', e => {
      this.filters.category = e.target.value;
      this.render();
    });
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
      this.filters = { timeSlot: '', category: '' };
      this.render();
    });
  }

  destroy() {
    this._unsub?.();
    stopClock();
  }
}
