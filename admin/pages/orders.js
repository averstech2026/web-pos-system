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
  orderSalesChannelBadgeClass,
  orderSalesChannelLabel,
  orderTotal,
  paymentStatusLabel,
} from '../utils/order-format.js';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../shared/schema.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { collectLocationOptions } from '../services/reports-data.js';
import { renderFiltersResetBtn, syncFiltersResetBtn } from '../utils/filter-panel.js';

const SOURCE_FILTER_TABS = [
  { id: 'all', label: 'Все' },
  { id: 'web', label: 'Веб (ЛК)' },
  { id: 'kiosk', label: 'Киоск' },
];

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
    this.sourceFilter = 'all';
    this.locationFilter = 'all';
    this.paymentFilter = 'all';
    this.statusDropdownOpen = false;
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
    this.rulesById = new Map();
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
    if (!this.statusDropdownOpen) return;
    this.closeFilterDropdowns();
  }

  _onWindowResize() {
    if (!this.statusDropdownOpen) return;
    this.syncAllDropdowns();
  }

  closeFilterDropdowns() {
    this.statusDropdownOpen = false;
    this.syncAllDropdowns();
  }

  syncDropdown(idPrefix) {
    const open = idPrefix === 'status' ? this.statusDropdownOpen : false;
    const summaryMap = {
      status: () => this.statusFilterSummary(),
    };
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
    this.closeFilterDropdowns();
  }

  refreshOrdersList() {
    const page = this.container.querySelector('.orders-page');
    if (!page) return;

    const countEl = page.querySelector('.orders-count');
    if (countEl) countEl.textContent = this.ordersCountText();

    this.syncPeriodSummary();
    this.syncLocationFilterSelect();

    const listHost = page.querySelector('[data-orders-list]');
    if (listHost) {
      listHost.innerHTML = this.view === 'list' ? this.renderList() : this.renderPlan();
      listHost.classList.remove('orders-list--loading');
    }

    this.syncAllDropdowns();
    syncFiltersResetBtn(page, this.hasActiveFilters());
  }

  resolveActivePeriod() {
    if (this.periodPreset === 'custom') {
      return {
        start: startOfDay(fromDateInputValue(this.customFrom)),
        end: endOfDay(fromDateInputValue(this.customTo)),
        preset: 'custom',
      };
    }
    return resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
  }

  formatPeriodDate(d) {
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  periodSummaryParts() {
    const { start, end, preset } = this.resolveActivePeriod();
    const presetLabels = {
      day: 'День',
      week: 'Неделя',
      month: 'Месяц',
      custom: 'Произвольный период',
    };
    return {
      range: `${this.formatPeriodDate(start)} — ${this.formatPeriodDate(end)}`,
      preset: presetLabels[preset] || preset,
      field: this.dateField === 'dateSlot' ? 'по дате выдачи' : 'по дате создания',
    };
  }

  renderPeriodSummary() {
    const { range, preset, field } = this.periodSummaryParts();
    return `
      <div class="orders-period-summary" data-orders-period-summary>
        <span class="orders-period-summary-label">Период отбора:</span>
        <strong class="orders-period-summary-range">${esc(range)}</strong>
        <span class="orders-period-summary-meta">${esc(preset)} · ${esc(field)}</span>
      </div>
    `;
  }

  syncPeriodSummary() {
    const page = this.container.querySelector('.orders-page');
    if (!page) return;

    const host = page.querySelector('[data-orders-period-summary]');
    if (!host) return;

    const { range, preset, field } = this.periodSummaryParts();
    const rangeEl = host.querySelector('.orders-period-summary-range');
    const metaEl = host.querySelector('.orders-period-summary-meta');
    if (rangeEl) rangeEl.textContent = range;
    if (metaEl) metaEl.textContent = `${preset} · ${field}`;
  }

  syncLocationFilterSelect() {
    const select = this.container.querySelector('#orders-location-filter');
    if (!select) return;

    const locations = this.locationOptions();
    const validIds = new Set(locations.map(loc => loc.id));
    if (this.locationFilter !== 'all' && !validIds.has(this.locationFilter)) {
      this.locationFilter = 'all';
    }

    select.innerHTML = `
      <option value="all" ${this.locationFilter === 'all' ? 'selected' : ''}>Все точки</option>
      ${locations.map(loc => `
        <option value="${escAttr(loc.id)}" ${this.locationFilter === loc.id ? 'selected' : ''}>${esc(loc.name)}</option>
      `).join('')}
    `;
  }

  syncFilterSegmentTabs(selector, activeValue, attr) {
    const page = this.container.querySelector('.orders-page');
    if (!page) return;

    page.querySelectorAll(selector).forEach(btn => {
      const value = btn.dataset[attr];
      const active = value === activeValue;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  syncViewFilterTabs() {
    this.syncFilterSegmentTabs('[data-view]', this.view, 'view');
  }

  syncPeriodFilterTabs() {
    this.syncFilterSegmentTabs('[data-period]', this.periodPreset, 'period');
  }

  syncDateFieldFilterTabs() {
    this.syncFilterSegmentTabs('[data-date-field]', this.dateField, 'dateField');
  }

  syncCustomDatesVisibility() {
    const page = this.container.querySelector('.orders-page');
    const block = page?.querySelector('.orders-custom-dates-inline');
    if (block) {
      block.classList.toggle('orders-custom-dates-inline--hidden', this.periodPreset !== 'custom');
    }
  }

  async reloadOrders() {
    const page = this.container.querySelector('.orders-page');
    const listHost = page?.querySelector('[data-orders-list]');
    listHost?.classList.add('orders-list--loading');

    try {
      const period = this.resolveActivePeriod();
      this.orders = await fetchOrdersFiltered(period.start, period.end, this.dateField);
      this.error = null;
    } catch (err) {
      console.error('[orders]', err);
      this.error = err.message || 'Не удалось загрузить заказы';
      listHost?.classList.remove('orders-list--loading');
      if (page) {
        const host = page.querySelector('[data-orders-list]');
        if (host) {
          host.innerHTML = `<div class="admin-error card">${esc(this.error)}</div>`;
        }
      }
      return;
    }

    this.refreshOrdersList();
  }

  syncSourceFilterTabs() {
    const page = this.container.querySelector('.orders-page');
    if (!page) return;

    page.querySelectorAll('[data-source-filter]').forEach(btn => {
      const active = btn.dataset.sourceFilter === this.sourceFilter;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
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

    const channelTab = e.target.closest('[data-source-filter]');
    if (channelTab) {
      this.sourceFilter = channelTab.dataset.sourceFilter || 'all';
      this.closeFilterDropdowns();
      this.syncSourceFilterTabs();
      this.refreshOrdersList();
      return;
    }

    const viewTab = e.target.closest('[data-view]');
    if (viewTab && this.container.querySelector('.orders-page')?.contains(viewTab)) {
      this.view = viewTab.dataset.view;
      this.closeFilterDropdowns();
      this.syncViewFilterTabs();
      this.refreshOrdersList();
      return;
    }

    const statusTrigger = e.target.closest('#orders-status-trigger');
    if (statusTrigger) {
      e.stopPropagation();
      this.statusDropdownOpen = !this.statusDropdownOpen;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('[data-status-action="clear"]')) {
      e.preventDefault();
      this.statusFilters = [];
      this.refreshOrdersList();
      return;
    }

    if (e.target.closest('#orders-status-menu')) return;

    const periodTab = e.target.closest('[data-period]');
    if (periodTab) {
      e.preventDefault();
      this.periodPreset = periodTab.dataset.period;
      this.closeFilterDropdowns();
      this.syncPeriodFilterTabs();
      this.syncCustomDatesVisibility();
      this.syncPeriodSummary();
      void this.reloadOrders();
      return;
    }

    const modeBtn = e.target.closest('[data-date-field]');
    if (modeBtn) {
      this.dateField = modeBtn.dataset.dateField;
      this.closeFilterDropdowns();
      this.syncDateFieldFilterTabs();
      this.syncPeriodSummary();
      void this.reloadOrders();
      return;
    }

    if (e.target.closest('#orders-apply-dates')) {
      this.customFrom = this.container.querySelector('#orders-from')?.value || this.customFrom;
      this.customTo = this.container.querySelector('#orders-to')?.value || this.customTo;
      this.closeFilterDropdowns();
      this.syncPeriodSummary();
      void this.reloadOrders();
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

    if (e.target.id === 'orders-location-filter') {
      this.locationFilter = e.target.value || 'all';
      this.closeFilterDropdowns();
      this.refreshOrdersList();
      return;
    }

    if (e.target.id === 'orders-payment-filter') {
      this.paymentFilter = e.target.value || 'all';
      this.closeFilterDropdowns();
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
      this.rulesById = new Map(availabilityRules.map(r => [r.id, r]));
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
      sourceFilter: this.sourceFilter,
      locationId: this.locationFilter,
      paymentFilter: this.paymentFilter,
      itemsById: this.itemsById,
      rulesById: this.rulesById,
    });
  }

  hasActiveFilters() {
    return Boolean(
      this.search.trim()
      || this.statusFilters.length
      || this.sourceFilter !== 'all'
      || this.locationFilter !== 'all'
      || this.paymentFilter !== 'all',
    );
  }

  resetFilters() {
    this.search = '';
    this.statusFilters = [];
    this.sourceFilter = 'all';
    this.locationFilter = 'all';
    this.paymentFilter = 'all';
    this.closeFilterDropdowns();
    const searchInput = this.container.querySelector('#orders-search');
    if (searchInput) searchInput.value = '';
    const locationSelect = this.container.querySelector('#orders-location-filter');
    if (locationSelect) locationSelect.value = 'all';
    const paymentSelect = this.container.querySelector('#orders-payment-filter');
    if (paymentSelect) paymentSelect.value = 'all';
    this.syncSourceFilterTabs();
    this.refreshOrdersList();
  }

  locationOptions() {
    return collectLocationOptions(this.orders, this.itemsById, this.rulesById);
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
        ${this.renderPeriodSummary()}
        <div data-orders-list>${this.view === 'list' ? this.renderList() : this.renderPlan()}</div>
      </div>
    `;
  }

  renderSourceFilterTabs() {
    return `
      <div class="products-availability-inline" role="group" aria-label="Фильтр по месту продажи">
        <span class="products-filter-label products-filter-label--inline">Место продажи:</span>
        <div class="period-tabs products-channel-tabs" role="tablist">
          ${SOURCE_FILTER_TABS.map(o => `
            <button
              type="button"
              class="period-tab btn-press ${this.sourceFilter === o.id ? 'period-tab--active' : ''}"
              data-source-filter="${o.id}"
              role="tab"
              aria-selected="${this.sourceFilter === o.id}"
            >${esc(o.label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderViewFilterTabs() {
    return `
      <div class="products-availability-inline" role="group" aria-label="Вид списка">
        <span class="products-filter-label products-filter-label--inline">Вид:</span>
        <div class="period-tabs products-channel-tabs" role="tablist">
          <button type="button" class="period-tab btn-press ${this.view === 'list' ? 'period-tab--active' : ''}" data-view="list" role="tab" aria-selected="${this.view === 'list'}">Список</button>
          <button type="button" class="period-tab btn-press ${this.view === 'plan' ? 'period-tab--active' : ''}" data-view="plan" role="tab" aria-selected="${this.view === 'plan'}">Сводка</button>
        </div>
      </div>
    `;
  }

  renderPeriodFilterTabs(periodTabs) {
    return `
      <div class="products-availability-inline" role="group" aria-label="Период заказов">
        <span class="products-filter-label products-filter-label--inline">Период:</span>
        <div class="period-tabs products-channel-tabs" role="tablist">
          ${periodTabs.map(t => `
            <button type="button" class="period-tab btn-press ${this.periodPreset === t.id ? 'period-tab--active' : ''}" data-period="${t.id}" role="tab" aria-selected="${this.periodPreset === t.id}">${t.label}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderDateFieldFilterTabs() {
    return `
      <div class="products-availability-inline" role="group" aria-label="Поле даты">
        <span class="products-filter-label products-filter-label--inline">По:</span>
        <div class="period-tabs products-channel-tabs" role="tablist">
          <button type="button" class="period-tab btn-press ${this.dateField === 'createdAt' ? 'period-tab--active' : ''}" data-date-field="createdAt" role="tab" aria-selected="${this.dateField === 'createdAt'}">Созданию</button>
          <button type="button" class="period-tab btn-press ${this.dateField === 'dateSlot' ? 'period-tab--active' : ''}" data-date-field="dateSlot" role="tab" aria-selected="${this.dateField === 'dateSlot'}">Выдаче</button>
        </div>
      </div>
    `;
  }

  renderCustomDatesInline() {
    return `
      <div class="orders-custom-dates-inline ${this.periodPreset === 'custom' ? '' : 'orders-custom-dates-inline--hidden'}">
        <label class="period-date period-date--compact"><span>С</span><input type="date" class="products-filter-control" id="orders-from" value="${this.customFrom}" /></label>
        <label class="period-date period-date--compact"><span>По</span><input type="date" class="products-filter-control" id="orders-to" value="${this.customTo}" /></label>
        <button type="button" class="btn btn-outline btn-press orders-apply-btn" id="orders-apply-dates">Применить</button>
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
    const locations = this.locationOptions();

    return `
      <section class="products-filters card orders-filters">
        <div class="products-filters-row products-filters-row--data">
          <div class="products-filter-field products-filter-field--search">
            <span class="products-filter-label">Поиск</span>
            <input
              type="search"
              class="products-search-input products-filter-control"
              id="orders-search"
              placeholder="№ заказа, ФИО, email, телефон…"
              value="${escAttr(this.search)}"
              aria-label="Поиск заказов"
            />
          </div>

          <div class="products-filter-field products-filter-field--group">
            <span class="products-filter-label">Статус</span>
            ${this.renderStatusDropdown()}
          </div>

          <div class="products-filter-field products-filter-field--schedule">
            <span class="products-filter-label">Точка</span>
            <select class="products-schedule-select products-filter-control" id="orders-location-filter" aria-label="Фильтр по точке">
              <option value="all" ${this.locationFilter === 'all' ? 'selected' : ''}>Все точки</option>
              ${locations.map(loc => `
                <option value="${escAttr(loc.id)}" ${this.locationFilter === loc.id ? 'selected' : ''}>${esc(loc.name)}</option>
              `).join('')}
            </select>
          </div>

          <div class="products-filter-field products-filter-field--allergens">
            <span class="products-filter-label">Оплата</span>
            <select class="products-schedule-select products-filter-control" id="orders-payment-filter" aria-label="Фильтр по оплате">
              <option value="all" ${this.paymentFilter === 'all' ? 'selected' : ''}>Все</option>
              <option value="${PAYMENT_STATUS.PAID}" ${this.paymentFilter === PAYMENT_STATUS.PAID ? 'selected' : ''}>Оплачен</option>
              <option value="${PAYMENT_STATUS.UNPAID}" ${this.paymentFilter === PAYMENT_STATUS.UNPAID ? 'selected' : ''}>Не оплачен</option>
            </select>
          </div>

          <div class="products-filters-reset-wrap">
            ${renderFiltersResetBtn(this.hasActiveFilters())}
          </div>
        </div>

        <div class="products-filters-row products-filters-row--controls orders-filters-row--controls">
          <div class="orders-filters-segments">
            ${this.renderViewFilterTabs()}
            ${this.renderSourceFilterTabs()}
            ${this.renderPeriodFilterTabs(periodTabs)}
            ${this.renderDateFieldFilterTabs()}
            ${this.renderCustomDatesInline()}
          </div>

          <span class="admin-filters-count products-filters-count">Найдено <span class="orders-count">${this.ordersCountText()}</span></span>
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
              <th>Место продажи</th>
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
    const sourceClass = orderSalesChannelBadgeClass(order.source);

    return `
      <tr class="orders-row" data-order-id="${order.id}" tabindex="0">
        <td><strong>${order.orderNumber || '—'}</strong></td>
        <td>
          <span class="orders-client">${user?.name || '—'}</span>
          ${user?.email ? `<span class="orders-client-email">${user.email}</span>` : ''}
        </td>
        <td><span class="orders-source-badge ${sourceClass}">${orderSalesChannelLabel(order.source)}</span></td>
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
