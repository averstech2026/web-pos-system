import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { openCreateOrderModal } from '../components/create-order-modal.js';
import {
  aggregateByPickupDate,
  fetchClients,
  fetchMenuItems,
  fetchOrdersFiltered,
  filterByStatus,
  groupDishesByCategory,
} from '../services/orders-data.js';
import { endOfDay, fromDateInputValue, resolvePeriod, startOfDay, toDateInputValue } from '../utils/dates.js';
import { fmtCount, fmtMoney } from '../utils/format.js';
import {
  fmtOrderDateTime,
  fmtPickupSlot,
  orderStatusBadgeClass,
  orderStatusLabel,
  orderTotal,
  paymentStatusLabel,
} from '../utils/order-format.js';
import { ORDER_STATUS } from '../../shared/schema.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';

const STATUS_OPTIONS = [
  { id: ORDER_STATUS.PENDING, label: 'Ожидает' },
  { id: ORDER_STATUS.COOKING, label: 'Готовится' },
  { id: ORDER_STATUS.READY, label: 'Готов' },
  { id: ORDER_STATUS.COMPLETED, label: 'Выдан' },
  { id: ORDER_STATUS.CANCELLED, label: 'Отменён' },
];

export class OrdersPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.view = 'list';
    this.statusFilters = [];
    this.statusDropdownOpen = false;
    this.dateField = 'createdAt';
    this.periodPreset = 'week';
    this.customFrom = toDateInputValue(new Date(Date.now() - 6 * 86400000));
    this.customTo = toDateInputValue();
    this.orders = [];
    this.clients = [];
    this.items = [];
    this.allRules = [];
    this.groupsByName = new Map();
    this.itemsById = new Map();
    this.usersById = new Map();
    this.loading = true;
    this.detailOrderId = null;
    this.handleStatusDropdownOutside = this.handleStatusDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
    this._onScrollClose = this._onScrollClose.bind(this);
    this.init();
  }

  _onScrollClose() {
    if (!this.statusDropdownOpen) return;
    this.statusDropdownOpen = false;
    this.syncStatusDropdown();
  }

  _onWindowResize() {
    if (!this.statusDropdownOpen) return;
    this.syncStatusDropdown();
  }

  bindScrollClose() {
    const content = this.container.querySelector('#admin-content');
    if (this._scrollEl && this._scrollEl !== content) {
      this._scrollEl.removeEventListener('scroll', this._onScrollClose);
      this._scrollEl = null;
    }
    if (!content || content === this._scrollEl) return;
    this._scrollEl = content;
    content.addEventListener('scroll', this._onScrollClose, { passive: true });
  }

  handleStatusDropdownOutside(e) {
    const statusDropdown = this.container.querySelector('#orders-status-dropdown');
    if (statusDropdown?.contains(e.target)) return;
    if (!this.statusDropdownOpen) return;
    this.statusDropdownOpen = false;
    this.syncStatusDropdown();
  }

  syncStatusDropdown() {
    const dropdown = this.container.querySelector('#orders-status-dropdown');
    const menu = this.container.querySelector('#orders-status-menu');
    const trigger = this.container.querySelector('#orders-status-trigger');
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', this.statusDropdownOpen);
    menu.hidden = !this.statusDropdownOpen;
    trigger.setAttribute('aria-expanded', String(this.statusDropdownOpen));

    const label = trigger.querySelector('.orders-status-trigger-label');
    if (label) label.textContent = this.statusFilterSummary();

    if (this.statusDropdownOpen) {
      const rect = trigger.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${Math.max(rect.width, 168)}px`;
    } else {
      menu.style.position = '';
      menu.style.top = '';
      menu.style.left = '';
      menu.style.minWidth = '';
    }
  }

  refreshOrdersList() {
    const page = this.container.querySelector('.orders-page');
    if (!page) return;

    const countEl = page.querySelector('.orders-count');
    if (countEl) countEl.textContent = this.ordersCountText();

    const listHost = page.querySelector('[data-orders-list]');
    if (listHost) {
      listHost.innerHTML = this.view === 'list' ? this.renderList() : this.renderPlan();
    }

    this.syncStatusDropdown();
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.orders-page')) return;

    if (e.target.closest('#orders-create-btn')) {
      openCreateOrderModal({
        clients: this.clients,
        items: this.items,
        groupsByName: this.groupsByName,
        allRules: this.allRules,
        onCreated: () => this.loadData(),
      });
      return;
    }

    const viewTab = e.target.closest('.orders-view-tabs [data-view]');
    if (viewTab) {
      this.view = viewTab.dataset.view;
      this.statusDropdownOpen = false;
      this.renderShell();
      return;
    }

    const statusTrigger = e.target.closest('#orders-status-trigger');
    if (statusTrigger) {
      e.stopPropagation();
      this.statusDropdownOpen = !this.statusDropdownOpen;
      this.syncStatusDropdown();
      return;
    }

    const statusAction = e.target.closest('[data-status-action]');
    if (statusAction) {
      e.preventDefault();
      if (statusAction.dataset.statusAction === 'clear') {
        this.statusFilters = [];
      }
      this.refreshOrdersList();
      return;
    }

    if (e.target.closest('#orders-status-menu')) return;

    const periodTab = e.target.closest('[data-period]');
    if (periodTab) {
      e.preventDefault();
      this.periodPreset = periodTab.dataset.period;
      this.statusDropdownOpen = false;
      if (this.periodPreset !== 'custom') this.loadData();
      else this.renderShell();
      return;
    }

    const modeBtn = e.target.closest('[data-date-field]');
    if (modeBtn) {
      this.dateField = modeBtn.dataset.dateField;
      this.statusDropdownOpen = false;
      this.loadData();
      return;
    }

    if (e.target.closest('#orders-apply-dates')) {
      this.customFrom = this.container.querySelector('#orders-from')?.value || this.customFrom;
      this.customTo = this.container.querySelector('#orders-to')?.value || this.customTo;
      this.statusDropdownOpen = false;
      this.loadData();
      return;
    }

    const row = e.target.closest('.orders-table [data-order-id]');
    if (row) {
      this.detailOrderId = row.dataset.orderId;
      this.statusDropdownOpen = false;
      this.renderShell();
      return;
    }

    if (e.target.closest('#order-detail-close') || e.target.closest('#order-detail-close-2')) {
      this.detailOrderId = null;
      this.renderShell();
      return;
    }

    if (e.target.id === 'order-detail-overlay') {
      this.detailOrderId = null;
      this.renderShell();
    }
  }

  _onContainerChange(e) {
    if (!this.container.querySelector('.orders-page')) return;

    const checkbox = e.target.closest('#orders-status-menu input[type="checkbox"][data-status]');
    if (!checkbox) return;

    const { status } = checkbox.dataset;
    if (checkbox.checked) {
      if (!this.statusFilters.includes(status)) this.statusFilters.push(status);
    } else {
      this.statusFilters = this.statusFilters.filter(id => id !== status);
    }

    this.refreshOrdersList();
  }

  async init() {
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();

    try {
      const period = this.periodPreset === 'custom'
        ? { start: startOfDay(fromDateInputValue(this.customFrom)), end: endOfDay(fromDateInputValue(this.customTo)) }
        : resolvePeriod(this.periodPreset, this.customFrom, this.customTo);

      const [orders, clients, items, availabilityRules, menuSettings] = await Promise.all([
        fetchOrdersFiltered(period.start, period.end, this.dateField),
        this.clients.length ? Promise.resolve(this.clients) : fetchClients(),
        this.items.length ? Promise.resolve(this.items) : fetchMenuItems(),
        fetchActiveAvailabilityRules(),
        fetchMenuSettings([]),
      ]);

      this.orders = orders;
      this.clients = clients;
      this.items = items;
      this.allRules = availabilityRules;
      this.groupsByName = new Map(
        (menuSettings.categoryGroups || []).map(g => [g.name, g]),
      );
      this.itemsById = new Map(items.map(i => [i.id, i]));
      this.usersById = new Map(clients.map(c => [c.id, c]));
      this.error = null;
    } catch (err) {
      console.error('[orders]', err);
      this.error = err.message || 'Не удалось загрузить заказы';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  filteredOrders() {
    return filterByStatus(this.orders, this.statusFilters);
  }

  ordersCountText() {
    const n = this.filteredOrders().length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'заказ'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'заказа'
        : 'заказов';
    return `${fmtCount(n)} ${word}`;
  }

  statusFilterSummary() {
    const selected = this.statusFilters;
    if (!selected.length) return 'Все статусы';

    if (selected.length === 1) {
      return STATUS_OPTIONS.find(s => s.id === selected[0])?.label || '1 статус';
    }

    if (selected.length === 2) {
      return selected
        .map(id => STATUS_OPTIONS.find(s => s.id === id)?.label)
        .filter(Boolean)
        .join(', ');
    }

    const n = selected.length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'статус'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'статуса'
        : 'статусов';
    return `${n} ${word}`;
  }

  renderStatusDropdown() {
    return `
      <div class="orders-status-dropdown ${this.statusDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="orders-status-dropdown">
        <button
          type="button"
          class="orders-status-trigger btn-press"
          id="orders-status-trigger"
          aria-expanded="${this.statusDropdownOpen}"
          aria-haspopup="listbox"
        >
          <span class="orders-status-trigger-label">${this.statusFilterSummary()}</span>
          <span class="orders-status-trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div class="orders-status-menu" id="orders-status-menu" role="listbox" ${this.statusDropdownOpen ? '' : 'hidden'}>
          ${STATUS_OPTIONS.map(s => `
            <label class="orders-status-option">
              <input
                type="checkbox"
                data-status="${s.id}"
                ${this.statusFilters.includes(s.id) ? 'checked' : ''}
              />
              <span>${s.label}</span>
            </label>
          `).join('')}
          <div class="orders-status-menu-foot">
            <button type="button" class="orders-status-reset btn-press" data-status-action="clear">Сбросить</button>
          </div>
        </div>
      </div>
    `;
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка заказов…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : this.renderContent();

    this.container.innerHTML = renderAdminShell({
      active: 'orders',
      title: 'Заказы',
      subtitle: 'Список, фильтры и сводка для кухни',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) {
      this.bindEvents();
      this.bindScrollClose();
      this.syncStatusDropdown();
    }
  }

  renderContent() {
    return `
      <div class="orders-page">
        ${this.renderFilters()}
        <div data-orders-list>${this.view === 'list' ? this.renderList() : this.renderPlan()}</div>
        ${this.detailOrderId ? this.renderDetailModal() : ''}
      </div>
    `;
  }

  renderFilters() {
    const periodTabs = [
      { id: 'day', label: 'День' },
      { id: 'week', label: 'Неделя' },
      { id: 'month', label: 'Месяц' },
      { id: 'custom', label: 'Период' },
    ];

    return `
      <section class="orders-filters card">
        <div class="orders-filters-main">
          <div class="orders-view-tabs" role="tablist">
            <button type="button" class="orders-view-tab btn-press ${this.view === 'list' ? 'orders-view-tab--active' : ''}" data-view="list">Список</button>
            <button type="button" class="orders-view-tab btn-press ${this.view === 'plan' ? 'orders-view-tab--active' : ''}" data-view="plan">Сводка</button>
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Статус</span>
            ${this.renderStatusDropdown()}
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Период</span>
            <div class="orders-chip-group">
              ${periodTabs.map(t => `
                <button type="button" class="orders-chip btn-press ${this.periodPreset === t.id ? 'orders-chip--active' : ''}" data-period="${t.id}">${t.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">По</span>
            <div class="orders-chip-group">
              <button type="button" class="orders-chip btn-press ${this.dateField === 'createdAt' ? 'orders-chip--active' : ''}" data-date-field="createdAt">Созданию</button>
              <button type="button" class="orders-chip btn-press ${this.dateField === 'dateSlot' ? 'orders-chip--active' : ''}" data-date-field="dateSlot">Выдаче</button>
            </div>
          </div>

          <div class="orders-filter-inline orders-filter-summary">
            <span class="orders-filter-label">Найдено</span>
            <span class="orders-count">${this.ordersCountText()}</span>
          </div>

          <div class="orders-filters-actions">
            <button type="button" class="btn btn-primary btn-press orders-create-btn" id="orders-create-btn">
              + Новый заказ
            </button>
          </div>
        </div>

        <div class="orders-custom-dates ${this.periodPreset === 'custom' ? '' : 'orders-custom-dates--hidden'}">
          <label class="period-date"><span>С</span><input type="date" id="orders-from" value="${this.customFrom}" /></label>
          <label class="period-date"><span>По</span><input type="date" id="orders-to" value="${this.customTo}" /></label>
          <button type="button" class="btn btn-outline btn-press orders-apply-btn" id="orders-apply-dates">Применить</button>
        </div>
      </section>
    `;
  }

  renderList() {
    const orders = this.filteredOrders();
    if (!orders.length) {
      return `<div class="orders-empty card"><p>Заказов не найдено по выбранным фильтрам</p></div>`;
    }

    return `
      <div class="orders-table-wrap card">
        <table class="orders-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Клиент</th>
              <th>Создан</th>
              <th>Выдача</th>
              <th>Статус</th>
              <th>Оплата</th>
              <th class="orders-th-num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => this.renderRow(o)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderRow(order) {
    const user = this.usersById.get(order.userId);
    const total = orderTotal(order.items);
    const payClass = order.paymentStatus === 'paid' ? 'orders-pay--paid' : 'orders-pay--unpaid';

    return `
      <tr class="orders-row btn-press" data-order-id="${order.id}" tabindex="0">
        <td><strong>${order.orderNumber || '—'}</strong></td>
        <td>
          <span class="orders-client">${user?.name || '—'}</span>
          ${user?.email ? `<span class="orders-client-email">${user.email}</span>` : ''}
        </td>
        <td>${fmtOrderDateTime(order.createdAt)}</td>
        <td>${fmtPickupSlot(order.dateSlot, order.timeSlot)}</td>
        <td><span class="badge ${orderStatusBadgeClass(order.status)}">${orderStatusLabel(order.status)}</span></td>
        <td><span class="orders-pay ${payClass}">${paymentStatusLabel(order.paymentStatus)}</span></td>
        <td class="orders-td-num">${order.paymentStatus === 'paid' ? fmtMoney(total) : '—'}</td>
      </tr>
    `;
  }

  renderPlan() {
    const aggregated = aggregateByPickupDate(this.filteredOrders(), this.itemsById);
    const dates = [...aggregated.keys()].sort();

    if (!dates.length) {
      return `<div class="orders-empty card"><p>Нет данных для сводки</p></div>`;
    }

    return `
      <div class="orders-plan">
        ${dates.map(dateKey => {
          const groups = groupDishesByCategory(aggregated.get(dateKey));
          const dateLabel = dateKey === '—' ? 'Без даты' : fmtPickupSlot(dateKey, '').replace(/, $/, '');
          return `
            <section class="orders-plan-day card">
              <h3 class="orders-plan-date">На ${dateLabel}</h3>
              ${groups.map(([category, dishes]) => `
                <div class="orders-plan-cat">
                  <h4 class="orders-plan-cat-title">${category}</h4>
                  <ul class="orders-plan-list">
                    ${dishes.map(d => `<li><span>${d.name}</span><strong>${fmtCount(d.qty)} шт</strong></li>`).join('')}
                  </ul>
                </div>
              `).join('')}
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  renderDetailModal() {
    const order = this.orders.find(o => o.id === this.detailOrderId);
    if (!order) return '';
    const user = this.usersById.get(order.userId);
    const items = order.items || [];
    const total = orderTotal(items);

    return `
      <div class="admin-modal-overlay" id="order-detail-overlay">
        <div class="admin-modal card admin-modal--md">
          <div class="admin-modal-head">
            <h2 class="admin-modal-title">Заказ № ${order.orderNumber}</h2>
            <button type="button" class="admin-modal-close btn-press" id="order-detail-close">✕</button>
          </div>
          <div class="admin-modal-body">
            <div class="orders-detail-meta">
              <p><span>Клиент</span> ${user?.name || '—'} ${user?.email ? `· ${user.email}` : ''}</p>
              <p><span>Создан</span> ${fmtOrderDateTime(order.createdAt)}</p>
              <p><span>Выдача</span> ${fmtPickupSlot(order.dateSlot, order.timeSlot)}</p>
              <p>
                <span class="badge ${orderStatusBadgeClass(order.status)}">${orderStatusLabel(order.status)}</span>
                <span class="orders-pay ${order.paymentStatus === 'paid' ? 'orders-pay--paid' : 'orders-pay--unpaid'}">${paymentStatusLabel(order.paymentStatus)}</span>
              </p>
            </div>
            <div class="orders-detail-items">
              ${items.map(i => `
                <div class="orders-detail-line">
                  <span>${i.name} × ${i.quantity}</span>
                  <span>${fmtMoney(i.price * i.quantity)}</span>
                </div>
              `).join('')}
              <div class="orders-detail-total">
                <span>Итого</span>
                <strong>${fmtMoney(total)}</strong>
              </div>
            </div>
          </div>
          <div class="admin-modal-foot">
            <button type="button" class="btn btn-outline btn-pill btn-press" id="order-detail-close-2">Закрыть</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.addEventListener('click', this.handleStatusDropdownOutside);
    window.addEventListener('resize', this._onWindowResize);
    this.container.addEventListener('click', this._onContainerClick);
    this.container.addEventListener('change', this._onContainerChange);
  }

  destroy() {
    this._eventsBound = false;
    document.removeEventListener('click', this.handleStatusDropdownOutside);
    window.removeEventListener('resize', this._onWindowResize);
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('change', this._onContainerChange);
    this._scrollEl?.removeEventListener('scroll', this._onScrollClose);
    this._scrollEl = null;
    document.getElementById('create-order-modal')?.remove();
  }
}
