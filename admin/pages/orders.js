import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { openCreateOrderModal } from '../components/create-order-modal.js';
import { openOrderDetailModal } from '../components/order-detail-modal.js';
import {
  aggregateByPickupDate,
  fetchMenuItems,
  fetchOrdersFiltered,
  filterOrders,
  groupDishesByCategory,
} from '../services/orders-data.js';
import { fetchLoyaltyCategories, fetchUserGroups } from '../services/crm-ref-data.js';
import { fetchCrmUsers } from '../services/users-data.js';
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
import { renderFiltersResetBtn, syncFiltersResetBtn } from '../utils/filter-panel.js';

function hashOrderId() {
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('order') : null;
}

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
    this.search = '';
    this.statusFilters = [];
    this.groupFilters = [];
    this.loyaltyFilters = [];
    this.statusDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.loyaltyDropdownOpen = false;
    this.dateField = 'createdAt';
    this.periodPreset = 'week';
    this.customFrom = toDateInputValue(new Date(Date.now() - 6 * 86400000));
    this.customTo = toDateInputValue();
    this.orders = [];
    this.clients = [];
    this.userGroups = [];
    this.loyaltyCategories = [];
    this.items = [];
    this.allRules = [];
    this.groupsByName = new Map();
    this.itemsById = new Map();
    this.usersById = new Map();
    this.loading = true;
    this.detailOrderId = null;
    this._orderDetailModal = null;
    this.handleStatusDropdownOutside = this.handleStatusDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerInput = this._onContainerInput.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
    this._onScrollClose = this._onScrollClose.bind(this);
    this.init();
  }

  _onScrollClose() {
    if (!this.statusDropdownOpen && !this.groupDropdownOpen && !this.loyaltyDropdownOpen) return;
    this.closeFilterDropdowns();
  }

  _onWindowResize() {
    if (!this.statusDropdownOpen && !this.groupDropdownOpen && !this.loyaltyDropdownOpen) return;
    this.syncAllDropdowns();
  }

  closeFilterDropdowns() {
    this.statusDropdownOpen = false;
    this.groupDropdownOpen = false;
    this.loyaltyDropdownOpen = false;
    this.syncAllDropdowns();
  }

  syncDropdown(idPrefix) {
    const openMap = {
      status: this.statusDropdownOpen,
      group: this.groupDropdownOpen,
      loyalty: this.loyaltyDropdownOpen,
    };
    const summaryMap = {
      status: () => this.statusFilterSummary(),
      group: () => this.groupFilterSummary(),
      loyalty: () => this.loyaltyFilterSummary(),
    };
    const open = openMap[idPrefix];
    const dropdown = this.container.querySelector(`#orders-${idPrefix}-dropdown`);
    const menu = this.container.querySelector(`#orders-${idPrefix}-menu`);
    const trigger = this.container.querySelector(`#orders-${idPrefix}-trigger`);
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', open);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));

    const label = trigger.querySelector('.orders-status-trigger-label');
    if (label) label.textContent = summaryMap[idPrefix]();

    if (open) {
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

  syncAllDropdowns() {
    this.syncDropdown('status');
    this.syncDropdown('group');
    this.syncDropdown('loyalty');
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
    const groupDropdown = this.container.querySelector('#orders-group-dropdown');
    if (groupDropdown?.contains(e.target)) return;
    const loyaltyDropdown = this.container.querySelector('#orders-loyalty-dropdown');
    if (loyaltyDropdown?.contains(e.target)) return;

    if (!this.statusDropdownOpen && !this.groupDropdownOpen && !this.loyaltyDropdownOpen) return;
    this.closeFilterDropdowns();
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

    this.syncAllDropdowns();
    syncFiltersResetBtn(page, this.hasActiveFilters());
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.orders-page')) return;

    if (e.target.closest('[data-action="reset-filters"]')) {
      this.resetFilters();
      return;
    }

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
      this.closeFilterDropdowns();
      this.renderShell();
      return;
    }

    if (e.target.closest('#orders-group-trigger')) {
      e.stopPropagation();
      this.groupDropdownOpen = !this.groupDropdownOpen;
      this.statusDropdownOpen = false;
      this.loyaltyDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('#orders-loyalty-trigger')) {
      e.stopPropagation();
      this.loyaltyDropdownOpen = !this.loyaltyDropdownOpen;
      this.statusDropdownOpen = false;
      this.groupDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    const statusTrigger = e.target.closest('#orders-status-trigger');
    if (statusTrigger) {
      e.stopPropagation();
      this.statusDropdownOpen = !this.statusDropdownOpen;
      this.groupDropdownOpen = false;
      this.loyaltyDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('[data-group-action="clear"]')) {
      e.preventDefault();
      this.groupFilters = [];
      this.refreshOrdersList();
      return;
    }

    if (e.target.closest('[data-loyalty-action="clear"]')) {
      e.preventDefault();
      this.loyaltyFilters = [];
      this.refreshOrdersList();
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
    if (e.target.closest('#orders-group-menu')) return;
    if (e.target.closest('#orders-loyalty-menu')) return;

    const periodTab = e.target.closest('[data-period]');
    if (periodTab) {
      e.preventDefault();
      this.periodPreset = periodTab.dataset.period;
      this.closeFilterDropdowns();
      if (this.periodPreset !== 'custom') this.loadData();
      else this.renderShell();
      return;
    }

    const modeBtn = e.target.closest('[data-date-field]');
    if (modeBtn) {
      this.dateField = modeBtn.dataset.dateField;
      this.closeFilterDropdowns();
      this.loadData();
      return;
    }

    if (e.target.closest('#orders-apply-dates')) {
      this.customFrom = this.container.querySelector('#orders-from')?.value || this.customFrom;
      this.customTo = this.container.querySelector('#orders-to')?.value || this.customTo;
      this.closeFilterDropdowns();
      this.loadData();
      return;
    }

    const row = e.target.closest('.orders-table [data-order-id]');
    if (row) {
      this.openDetailModal(row.dataset.orderId);
      return;
    }
  }

  _onContainerInput(e) {
    if (!this.container.querySelector('.orders-page')) return;

    if (e.target.id === 'orders-search') {
      this.search = e.target.value;
      this.refreshOrdersList();
      const input = this.container.querySelector('#orders-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  _onContainerChange(e) {
    if (!this.container.querySelector('.orders-page')) return;

    const checkbox = e.target.closest('#orders-status-menu input[type="checkbox"][data-status]');
    if (checkbox) {
      const { status } = checkbox.dataset;
      if (checkbox.checked) {
        if (!this.statusFilters.includes(status)) this.statusFilters.push(status);
      } else {
        this.statusFilters = this.statusFilters.filter(id => id !== status);
      }
      this.refreshOrdersList();
      return;
    }

    const groupCb = e.target.closest('[data-group-filter]');
    if (groupCb) {
      const id = groupCb.dataset.groupFilter;
      if (groupCb.checked) {
        if (!this.groupFilters.includes(id)) this.groupFilters.push(id);
      } else {
        this.groupFilters = this.groupFilters.filter(x => x !== id);
      }
      this.refreshOrdersList();
      return;
    }

    const loyaltyCb = e.target.closest('[data-loyalty-filter]');
    if (loyaltyCb) {
      const id = loyaltyCb.dataset.loyaltyFilter;
      if (loyaltyCb.checked) {
        if (!this.loyaltyFilters.includes(id)) this.loyaltyFilters.push(id);
      } else {
        this.loyaltyFilters = this.loyaltyFilters.filter(x => x !== id);
      }
      this.refreshOrdersList();
    }
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

      const [orders, clients, items, availabilityRules, menuSettings, userGroups, loyaltyCategories] = await Promise.all([
        fetchOrdersFiltered(period.start, period.end, this.dateField),
        this.clients.length ? Promise.resolve(this.clients) : fetchCrmUsers(),
        this.items.length ? Promise.resolve(this.items) : fetchMenuItems(),
        fetchActiveAvailabilityRules(),
        fetchMenuSettings([]),
        this.userGroups.length ? Promise.resolve(this.userGroups) : fetchUserGroups(),
        this.loyaltyCategories.length ? Promise.resolve(this.loyaltyCategories) : fetchLoyaltyCategories(),
      ]);

      this.orders = orders;
      this.clients = clients;
      this.userGroups = userGroups;
      this.loyaltyCategories = loyaltyCategories;
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
      const deepOrder = hashOrderId();
      if (deepOrder && this.orders.some(o => o.id === deepOrder)) {
        this.openDetailModal(deepOrder);
      }
      this.renderShell();
    }
  }

  openDetailModal(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    this.closeFilterDropdowns();
    this._orderDetailModal?.close?.();
    this.detailOrderId = orderId;

    this._orderDetailModal = openOrderDetailModal({
      order,
      user: this.usersById.get(order.userId) || null,
      onClose: () => {
        this.detailOrderId = null;
        this._orderDetailModal = null;
      },
    });
  }

  filteredOrders() {
    return filterOrders(this.orders, this.usersById, {
      statuses: this.statusFilters,
      search: this.search,
      groupIds: this.groupFilters,
      loyaltyCategoryIds: this.loyaltyFilters,
    });
  }

  hasActiveFilters() {
    return Boolean(
      this.search.trim()
      || this.statusFilters.length
      || this.groupFilters.length
      || this.loyaltyFilters.length,
    );
  }

  resetFilters() {
    this.search = '';
    this.statusFilters = [];
    this.groupFilters = [];
    this.loyaltyFilters = [];
    this.closeFilterDropdowns();
    const searchInput = this.container.querySelector('#orders-search');
    if (searchInput) searchInput.value = '';
    this.refreshOrdersList();
  }

  groupName(id) {
    if (!id) return '—';
    return this.userGroups.find(g => g.id === id)?.name || id;
  }

  loyaltyName(id) {
    if (!id || id === '__none__') return 'Без категории';
    return this.loyaltyCategories.find(c => c.id === id)?.name || id;
  }

  groupFilterSummary() {
    if (!this.groupFilters.length) return 'Все группы';
    if (this.groupFilters.length === 1) return this.groupName(this.groupFilters[0]);
    return `${this.groupFilters.length} группы`;
  }

  loyaltyFilterSummary() {
    if (!this.loyaltyFilters.length) return 'Все категории';
    if (this.loyaltyFilters.length === 1) return this.loyaltyName(this.loyaltyFilters[0]);
    return `${this.loyaltyFilters.length} категории`;
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
      this.syncAllDropdowns();
    }
  }

  renderContent() {
    return `
      <div class="orders-page">
        ${this.renderFilters()}
        <div data-orders-list>${this.view === 'list' ? this.renderList() : this.renderPlan()}</div>
      </div>
    `;
  }

  renderGroupDropdown() {
    return `
      <div class="orders-status-dropdown ${this.groupDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="orders-group-dropdown">
        <button
          type="button"
          class="orders-status-trigger btn-press"
          id="orders-group-trigger"
          aria-expanded="${this.groupDropdownOpen}"
          aria-haspopup="listbox"
        >
          <span class="orders-status-trigger-label">${esc(this.groupFilterSummary())}</span>
          <span class="orders-status-trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div class="orders-status-menu" id="orders-group-menu" role="listbox" ${this.groupDropdownOpen ? '' : 'hidden'}>
          ${this.userGroups.map(g => `
            <label class="orders-status-option">
              <input type="checkbox" data-group-filter="${escAttr(g.id)}" ${this.groupFilters.includes(g.id) ? 'checked' : ''} />
              <span>${esc(g.name)}</span>
            </label>
          `).join('')}
          <div class="orders-status-menu-foot">
            <button type="button" class="orders-status-reset btn-press" data-group-action="clear">Сбросить</button>
          </div>
        </div>
      </div>
    `;
  }

  renderLoyaltyDropdown() {
    return `
      <div class="orders-status-dropdown ${this.loyaltyDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="orders-loyalty-dropdown">
        <button
          type="button"
          class="orders-status-trigger btn-press"
          id="orders-loyalty-trigger"
          aria-expanded="${this.loyaltyDropdownOpen}"
          aria-haspopup="listbox"
        >
          <span class="orders-status-trigger-label">${esc(this.loyaltyFilterSummary())}</span>
          <span class="orders-status-trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div class="orders-status-menu" id="orders-loyalty-menu" role="listbox" ${this.loyaltyDropdownOpen ? '' : 'hidden'}>
          <label class="orders-status-option">
            <input type="checkbox" data-loyalty-filter="__none__" ${this.loyaltyFilters.includes('__none__') ? 'checked' : ''} />
            <span>Без категории</span>
          </label>
          ${this.loyaltyCategories.map(c => `
            <label class="orders-status-option">
              <input type="checkbox" data-loyalty-filter="${escAttr(c.id)}" ${this.loyaltyFilters.includes(c.id) ? 'checked' : ''} />
              <span>${esc(c.name)}</span>
            </label>
          `).join('')}
          <div class="orders-status-menu-foot">
            <button type="button" class="orders-status-reset btn-press" data-loyalty-action="clear">Сбросить</button>
          </div>
        </div>
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
        <div class="orders-filters-primary">
          <div class="orders-filter-inline orders-filter-search">
            <span class="orders-filter-label">Поиск</span>
            <input
              type="search"
              class="orders-search-input"
              id="orders-search"
              placeholder="№ заказа, ФИО, email, телефон…"
              value="${escAttr(this.search)}"
              aria-label="Поиск заказов"
            />
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Статус</span>
            ${this.renderStatusDropdown()}
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Группа</span>
            ${this.renderGroupDropdown()}
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Категория</span>
            ${this.renderLoyaltyDropdown()}
          </div>

          ${renderFiltersResetBtn(this.hasActiveFilters())}
        </div>

        <div class="orders-filters-toolbar">
          <div class="admin-filters-toolbar-left">
            <button type="button" class="btn btn-primary btn-press orders-create-btn" id="orders-create-btn">
              + Новый заказ
            </button>

            <div class="orders-view-tabs" role="tablist">
              <button type="button" class="orders-view-tab btn-press ${this.view === 'list' ? 'orders-view-tab--active' : ''}" data-view="list">Список</button>
              <button type="button" class="orders-view-tab btn-press ${this.view === 'plan' ? 'orders-view-tab--active' : ''}" data-view="plan">Сводка</button>
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
          </div>

          <div class="admin-filters-toolbar-right">
            <span class="admin-filters-count">Найдено <span class="orders-count">${this.ordersCountText()}</span></span>
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
      <tr class="orders-row" data-order-id="${order.id}" tabindex="0">
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

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.addEventListener('click', this.handleStatusDropdownOutside);
    window.addEventListener('resize', this._onWindowResize);
    this.container.addEventListener('click', this._onContainerClick);
    this.container.addEventListener('input', this._onContainerInput);
    this.container.addEventListener('change', this._onContainerChange);
  }

  destroy() {
    this._eventsBound = false;
    document.removeEventListener('click', this.handleStatusDropdownOutside);
    window.removeEventListener('resize', this._onWindowResize);
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('input', this._onContainerInput);
    this.container.removeEventListener('change', this._onContainerChange);
    this._scrollEl?.removeEventListener('scroll', this._onScrollClose);
    this._scrollEl = null;
    this._orderDetailModal?.close?.();
    this._orderDetailModal = null;
    document.getElementById('create-order-modal')?.remove();
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
