import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { fetchOrdersFiltered, fetchMenuItems } from '../services/orders-data.js';
import { fetchCrmUsers } from '../services/users-data.js';
import { fetchUserGroups } from '../services/crm-ref-data.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import {
  buildDishesReport,
  buildKitchenReport,
  buildNutritionSummary,
  buildOrdersPaymentsReport,
  buildValidationLogsReport,
  buildClientTransactionsReport,
  collectEmployeeOptions,
  collectLocationOptions,
  collectShiftOptions,
  filterReportOrders,
  buildItemsByNameMap,
} from '../services/reports-data.js';
import {
  endOfDay,
  fmtPlanDateLong,
  fmtReportDateShort,
  fromDateInputValue,
  isSameDateKey,
  resolvePeriod,
  startOfDay,
  toDateInputValue,
  tomorrowDateInputValue,
} from '../utils/dates.js';
import { fmtCount, fmtMoney } from '../utils/format.js';
import {
  fmtOrderDateTime,
  fmtPickupSlot,
  orderTotal,
  paymentStatusLabel,
} from '../utils/order-format.js';
import { renderFiltersResetBtn, syncFiltersResetBtn } from '../utils/filter-panel.js';
import { fetchValidationLogs, fetchValidatorTransactions } from '../services/validation-logs-data.js';

/** @typedef {'nutrition' | 'dishes' | 'orders' | 'kitchen' | 'validations' | 'client-transactions'} ReportId */

const REPORT_CATALOG = [
  {
    id: 'nutrition',
    title: 'Сводный отчёт по питанию',
    description: 'Заказы и суммы по сотрудникам с детализацией позиций за период',
    icon: 'bar-chart-3',
    tone: 'indigo',
  },
  {
    id: 'dishes',
    title: 'Отчёт по товарам',
    description: 'Группировка по товарам: объёмы, суммы и кто заказывал',
    icon: 'utensils',
    tone: 'rose',
  },
  {
    id: 'orders',
    title: 'Заказы и оплаты',
    description: 'Сквозная лента заказов со статусом оплаты и составом чека',
    icon: 'shopping-bag',
    tone: 'sky',
  },
  {
    id: 'kitchen',
    title: 'Производственный отчёт',
    description: 'Агрегированные объёмы блюд для кухни без цен и персональных данных',
    icon: 'chef-hat',
    tone: 'amber',
  },
  {
    id: 'validations',
    title: 'Отчёт по валидациям',
    description: 'Лента проходов по пропуску: успешные выдачи и отказы в реальном времени',
    icon: 'shield-check',
    tone: 'emerald',
  },
  {
    id: 'client-transactions',
    title: 'Транзакции клиентов',
    description: 'Финансовые движения: оплаты заказов и списания по валидатору',
    icon: 'wallet',
    tone: 'violet',
  },
];

/** @type {Record<string, string[]>} */
const TABLE_COL_WIDTHS = {
  nutrition: ['48px', '16%', '110px', '72px', '24%', '80px', '110px'],
  dishes: ['48px', '32%', '26%', '110px', '110px'],
  orders: ['48px', '12%', '14%', '28%', '160px', '110px'],
  kitchen: ['42%', '32%', '26%'],
  validations: ['14%', '14%', '10%', '12%', '16%', '10%', '24%'],
  'client-transactions': ['14%', '18%', '28%', '12%', '14%', '14%'],
};

const NESTED_NUTRITION_COL_WIDTHS = ['80px', '120px', '13%', '15%', '28%', '88px', '10%'];

function renderNestedColgroup(widths) {
  return `<colgroup>${widths.map(w => `<col style="width:${w}" />`).join('')}</colgroup>`;
}

function renderColgroup(variant) {
  const widths = TABLE_COL_WIDTHS[variant] || [];
  return `<colgroup>${widths.map(w => `<col style="width:${w}" />`).join('')}</colgroup>`;
}

const REPORT_ICONS = {
  'bar-chart-3': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  utensils: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  'shopping-bag': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  'chef-hat': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.245-.025-.51-.08-.75a2.5 2.5 0 0 0-1.32-1.68C15.24 12.12 14.06 12 13 12H11c-1.06 0-2.24.12-3.6.62a2.5 2.5 0 0 0-1.32 1.68c-.055.24-.08.505-.08.75V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/><path d="M6 13h12"/><path d="M9 5.07A4 4 0 0 1 12 3a4 4 0 0 1 3 3.07"/><path d="M6 9h12"/></svg>',
  'shield-check': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  wallet: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
  'arrow-left': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
  chevron: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  'sort-desc': '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  'sort-asc': '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
  calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
};

export class ReportsPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    /** @type {ReportId | null} */
    this.activeReport = null;
    this.periodPreset = 'week';
    this.customFrom = toDateInputValue(new Date(Date.now() - 6 * 86400000));
    this.customTo = toDateInputValue();
    this.dateField = 'dateSlot';
    this.locationFilters = [];
    this.shiftFilters = [];
    this.employeeFilters = [];
    this.locationDropdownOpen = false;
    this.shiftDropdownOpen = false;
    this.employeeDropdownOpen = false;
    /** @type {Set<string>} */
    this.expandedRows = new Set();
    this.orders = [];
    this.clients = [];
    this.userGroups = [];
    this.items = [];
    this.rules = [];
    this.usersById = new Map();
    this.groupsById = new Map();
    this.itemsById = new Map();
    this.itemsByName = new Map();
    this.rulesById = new Map();
    this.validationLogs = [];
    this.validatorTransactions = [];
    this.kitchenPlanDate = tomorrowDateInputValue();
    /** @type {'today' | 'tomorrow' | 'custom'} */
    this.kitchenDayTab = 'tomorrow';
    /** @type {'asc' | 'desc'} */
    this.kitchenQtySort = 'desc';
    this.reportPeriod = null;
    this.loading = false;
    this.error = null;
    this._eventsBound = false;
    this.handleDropdownOutside = this.handleDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this._onContainerInput = this._onContainerInput.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
    this.init();
  }

  init() {
    this.renderShell();
    if (this.activeReport) this.loadData();
  }

  initKitchenDefaults() {
    this.kitchenPlanDate = tomorrowDateInputValue();
    this.kitchenDayTab = 'tomorrow';
    this.kitchenQtySort = 'desc';
    this.dateField = 'dateSlot';
  }

  syncKitchenDayTabFromDate() {
    const today = toDateInputValue();
    const tomorrow = tomorrowDateInputValue();
    if (isSameDateKey(this.kitchenPlanDate, today)) this.kitchenDayTab = 'today';
    else if (isSameDateKey(this.kitchenPlanDate, tomorrow)) this.kitchenDayTab = 'tomorrow';
    else this.kitchenDayTab = 'custom';
  }

  kitchenPlanTitle() {
    const label = fmtPlanDateLong(this.kitchenPlanDate);
    if (this.kitchenDayTab === 'today') {
      return `План производства на сегодня, ${label}`;
    }
    if (this.kitchenDayTab === 'tomorrow') {
      return `План производства на завтра, ${label}`;
    }
    return `План производства на выбранный день: ${label}`;
  }

  async loadData({ soft = false } = {}) {
    if (!this.activeReport) return;
    if (!soft) {
      this.loading = true;
      this.error = null;
      this.renderShell();
    } else if (this.activeReport === 'kitchen') {
      this.container.querySelector('#reports-kitchen-body-host')
        ?.classList.add('reports-kitchen-body-host--loading');
    } else {
      this.error = null;
      this.container.querySelector('#reports-body-host')
        ?.classList.add('reports-body-host--loading');
    }

    try {
      let period;
      if (this.activeReport === 'kitchen') {
        const day = startOfDay(fromDateInputValue(this.kitchenPlanDate));
        period = { start: day, end: endOfDay(day) };
        this.dateField = 'dateSlot';
      } else {
        period = this.periodPreset === 'custom'
          ? { start: startOfDay(fromDateInputValue(this.customFrom)), end: endOfDay(fromDateInputValue(this.customTo)) }
          : resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
      }

      const [orders, clients, items, rules, groups] = await Promise.all([
        fetchOrdersFiltered(period.start, period.end, this.dateField),
        this.clients.length ? Promise.resolve(this.clients) : fetchCrmUsers(),
        this.items.length ? Promise.resolve(this.items) : fetchMenuItems(),
        this.rules.length ? Promise.resolve(this.rules) : fetchActiveAvailabilityRules(),
        this.userGroups.length ? Promise.resolve(this.userGroups) : fetchUserGroups(),
      ]);

      this.orders = orders;
      this.clients = clients;
      this.items = items;
      this.rules = rules;
      this.userGroups = groups;
      this.usersById = new Map(clients.map(c => [c.id, c]));
      this.groupsById = new Map(groups.map(g => [g.id, g]));
      this.itemsById = new Map(items.map(i => [i.id, i]));
      this.itemsByName = buildItemsByNameMap(items);
      this.rulesById = new Map(rules.map(r => [r.id, r]));
      this.reportPeriod = {
        start: toDateInputValue(period.start),
        end: toDateInputValue(period.end),
      };
      this._reportPeriodRange = period;

      if (this.activeReport === 'validations') {
        this.validationLogs = await fetchValidationLogs({ limitCount: 1000 });
      }
      if (this.activeReport === 'client-transactions') {
        this.validatorTransactions = await fetchValidatorTransactions(1000);
      }
    } catch (err) {
      console.error('[reports]', err);
      this.error = err.message || 'Не удалось загрузить данные отчёта';
    } finally {
      this.loading = false;
      if (soft && this.activeReport === 'kitchen') {
        this.patchKitchenBody();
      } else if (soft && this.activeReport && this.activeReport !== 'kitchen') {
        this.patchReportBody();
      } else {
        this.renderShell();
      }
    }
  }

  patchKitchenDayControls() {
    const root = this.container.querySelector('.reports-filters--kitchen');
    if (!root) return;

    const todayActive = this.kitchenDayTab === 'today';
    const tomorrowActive = this.kitchenDayTab === 'tomorrow';

    const todayBtn = root.querySelector('[data-kitchen-day="today"]');
    const tomorrowBtn = root.querySelector('[data-kitchen-day="tomorrow"]');
    todayBtn?.classList.toggle('period-tab--active', todayActive);
    tomorrowBtn?.classList.toggle('period-tab--active', tomorrowActive);
    todayBtn?.setAttribute('aria-selected', String(todayActive));
    tomorrowBtn?.setAttribute('aria-selected', String(tomorrowActive));

    const dateInput = root.querySelector('#kitchen-plan-date');
    if (dateInput && dateInput.value !== this.kitchenPlanDate) {
      dateInput.value = this.kitchenPlanDate;
    }
  }

  patchKitchenPlanTitle() {
    const title = this.container.querySelector('.reports-kitchen-plan-title');
    if (title) title.textContent = this.kitchenPlanTitle();
  }

  patchPeriodControls() {
    const root = this.container.querySelector('.reports-filters');
    if (!root) return;

    const showCustom = this.periodPreset === 'custom';
    root.querySelectorAll('[data-period]').forEach(btn => {
      const active = btn.dataset.period === this.periodPreset;
      btn.classList.toggle('period-tab--active', active);
    });

    const customRow = root.querySelector('.reports-custom-dates-row');
    if (customRow) customRow.classList.toggle('reports-custom-dates-row--hidden', !showCustom);

    const range = root.querySelector('#reports-period-range .reports-period-badge-text');
    if (range) range.textContent = this.reportPeriodLabel();
  }

  patchReportBody() {
    const host = this.container.querySelector('#reports-body-host');
    if (!host) {
      this.renderShell();
      return;
    }

    const errBlock = this.container.querySelector('.reports-detail > .admin-error');
    if (this.error) {
      if (errBlock) errBlock.textContent = this.error;
      else {
        host.insertAdjacentHTML('beforebegin', `<div class="admin-error card">${esc(this.error)}</div>`);
      }
    } else {
      errBlock?.remove();
    }

    host.innerHTML = this.renderActiveTable();
    host.classList.remove('reports-body-host--loading');
    this.patchPeriodControls();
    this.syncExpandedRows();
  }

  patchKitchenBody() {
    const host = this.container.querySelector('#reports-kitchen-body-host');
    if (!host) {
      this.renderShell();
      return;
    }
    host.innerHTML = this.renderKitchenContent();
    host.classList.remove('reports-kitchen-body-host--loading');
  }

  filteredOrders() {
    return filterReportOrders(this.orders, {
      shiftIds: this.shiftFilters,
      employeeIds: this.employeeFilters,
      locationIds: this.locationFilters,
      itemsById: this.itemsById,
      rulesById: this.rulesById,
    });
  }

  reportMeta() {
    return REPORT_CATALOG.find(r => r.id === this.activeReport) || null;
  }

  getReportPeriodRange() {
    if (this.activeReport === 'kitchen') {
      return { start: this.kitchenPlanDate, end: this.kitchenPlanDate };
    }
    if (this.periodPreset === 'custom') {
      const from = this.customFrom || toDateInputValue();
      const to = this.customTo || from;
      return { start: from, end: to >= from ? to : from };
    }
    const period = resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
    return {
      start: toDateInputValue(period.start),
      end: toDateInputValue(period.end),
    };
  }

  reportPeriodLabel() {
    const range = this.getReportPeriodRange();
    const from = fmtReportDateShort(range.start);
    const to = fmtReportDateShort(range.end);
    if (range.start === range.end) return from;
    return `${from} — ${to}`;
  }

  renderReportPeriodRange() {
    return `
      <div class="reports-period-badge" id="reports-period-range" role="status" aria-live="polite">
        <span class="reports-period-badge-icon" aria-hidden="true">${REPORT_ICONS.calendar}</span>
        <span class="reports-period-badge-text">${esc(this.reportPeriodLabel())}</span>
      </div>
    `;
  }

  hasActiveFilters() {
    return this.locationFilters.length > 0
      || this.shiftFilters.length > 0
      || this.employeeFilters.length > 0;
  }

  resetFilters() {
    this.locationFilters = [];
    this.shiftFilters = [];
    this.employeeFilters = [];
    this.expandedRows.clear();
    this.renderShell();
  }

  toggleExpand(key) {
    if (this.expandedRows.has(key)) this.expandedRows.delete(key);
    else this.expandedRows.add(key);
    this.syncExpandedRows();
  }

  syncExpandedRows() {
    this.container.querySelectorAll('[data-expand-key]').forEach(row => {
      const key = row.dataset.expandKey;
      const open = this.expandedRows.has(key);
      row.classList.toggle('reports-row--open', open);
      const detail = row.nextElementSibling;
      if (detail?.classList.contains('reports-detail-row')) {
        detail.hidden = !open;
      }
      const chevron = row.querySelector('.reports-row-chevron');
      if (chevron) chevron.classList.toggle('reports-row-chevron--open', open);
    });
  }

  closeFilterDropdowns() {
    this.locationDropdownOpen = false;
    this.shiftDropdownOpen = false;
    this.employeeDropdownOpen = false;
    this.syncAllDropdowns();
  }

  syncAllDropdowns() {
    this.syncDropdown('location', this.locationDropdownOpen, () => this.locationFilterSummary());
    this.syncDropdown('shift', this.shiftDropdownOpen, () => this.shiftFilterSummary());
    this.syncDropdown('employee', this.employeeDropdownOpen, () => this.employeeFilterSummary());
  }

  syncDropdown(idPrefix, open, summaryFn) {
    const dropdown = this.container.querySelector(`#reports-${idPrefix}-dropdown`);
    const menu = this.container.querySelector(`#reports-${idPrefix}-menu`);
    const trigger = this.container.querySelector(`#reports-${idPrefix}-trigger`);
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('reports-filter-dropdown--open', open);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    const label = trigger.querySelector('.reports-filter-trigger-label');
    if (label) label.textContent = summaryFn();

    if (open) {
      const rect = trigger.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${Math.max(rect.width, 220)}px`;
    }
  }

  locationFilterSummary() {
    if (!this.locationFilters.length) return 'Все локации';
    if (this.locationFilters.length === 1) {
      const loc = collectLocationOptions(this.orders, this.itemsById, this.rulesById)
        .find(l => l.id === this.locationFilters[0]);
      return loc?.name || '1 локация';
    }
    return `${this.locationFilters.length} локации`;
  }

  shiftFilterSummary() {
    if (!this.shiftFilters.length) return 'Все смены';
    if (this.shiftFilters.length === 1) return this.shiftFilters[0];
    return `${this.shiftFilters.length} смены`;
  }

  employeeFilterSummary() {
    if (!this.employeeFilters.length) return 'Все сотрудники';
    if (this.employeeFilters.length === 1) {
      return this.usersById.get(this.employeeFilters[0])?.name || '1 сотрудник';
    }
    return `${this.employeeFilters.length} сотрудника`;
  }

  handleDropdownOutside(e) {
    if (!this.container.querySelector('.reports-page')) return;
    if (e.target.closest('.reports-filter-dropdown')) return;
    this.closeFilterDropdowns();
  }

  _onWindowResize() {
    if (!this.locationDropdownOpen && !this.shiftDropdownOpen && !this.employeeDropdownOpen) return;
    this.syncAllDropdowns();
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.reports-page')) return;

    const card = e.target.closest('[data-report-id]');
    if (card) {
      this.activeReport = /** @type {ReportId} */ (card.dataset.reportId);
      this.expandedRows.clear();
      this.locationFilters = [];
      this.shiftFilters = [];
      this.employeeFilters = [];
      if (this.activeReport === 'kitchen') this.initKitchenDefaults();
      this.loadData();
      return;
    }

    if (e.target.closest('[data-action="back-to-list"]')) {
      this.activeReport = null;
      this.expandedRows.clear();
      this.closeFilterDropdowns();
      this.renderShell();
      return;
    }

    if (e.target.closest('[data-action="refresh-report"]')) {
      this.loadData({ soft: true });
      return;
    }

    if (e.target.closest('[data-action="export-report"]')) {
      this.exportCurrentReport();
      return;
    }

    if (e.target.closest('[data-action="reset-filters"]')) {
      this.resetFilters();
      return;
    }

    for (const prefix of ['location', 'shift', 'employee']) {
      if (e.target.closest(`#reports-${prefix}-trigger`)) {
        e.stopPropagation();
        this[`${prefix}DropdownOpen`] = !this[`${prefix}DropdownOpen`];
        for (const p of ['location', 'shift', 'employee']) {
          if (p !== prefix) this[`${p}DropdownOpen`] = false;
        }
        this.syncAllDropdowns();
        return;
      }
      if (e.target.closest(`[data-${prefix}-action="clear"]`)) {
        e.preventDefault();
        this[`${prefix}Filters`] = [];
        this.renderShell();
        return;
      }
      if (e.target.closest(`#reports-${prefix}-menu`)) return;
    }

    const periodTab = e.target.closest('[data-period]');
    if (periodTab && this.activeReport !== 'kitchen') {
      e.preventDefault();
      this.periodPreset = periodTab.dataset.period;
      this.closeFilterDropdowns();
      this.patchPeriodControls();
      if (this.periodPreset !== 'custom') this.loadData({ soft: true });
      else this.renderShell();
      return;
    }

    const kitchenDayBtn = e.target.closest('[data-kitchen-day]');
    if (kitchenDayBtn) {
      const day = kitchenDayBtn.dataset.kitchenDay;
      if (day === 'today') this.kitchenPlanDate = toDateInputValue();
      else if (day === 'tomorrow') this.kitchenPlanDate = tomorrowDateInputValue();
      this.kitchenDayTab = day;
      this.closeFilterDropdowns();
      this.patchKitchenDayControls();
      this.patchKitchenPlanTitle();
      this.loadData({ soft: true });
      return;
    }

    if (e.target.closest('[data-kitchen-sort="qty"]')) {
      this.kitchenQtySort = this.kitchenQtySort === 'desc' ? 'asc' : 'desc';
      if (this.activeReport === 'kitchen') this.patchKitchenBody();
      else this.renderShell();
      return;
    }

    if (e.target.closest('#reports-apply-dates')) {
      this.customFrom = this.container.querySelector('#reports-from')?.value || this.customFrom;
      this.customTo = this.container.querySelector('#reports-to')?.value || this.customTo;
      this.closeFilterDropdowns();
      this.loadData({ soft: true });
      return;
    }

    const expandRow = e.target.closest('[data-expand-key]');
    if (expandRow) {
      this.toggleExpand(expandRow.dataset.expandKey);
    }
  }

  _onContainerInput(e) {
    if (!this.container.querySelector('.reports-page')) return;

    if (e.target.id === 'kitchen-plan-date') {
      this.kitchenPlanDate = e.target.value || this.kitchenPlanDate;
      this.syncKitchenDayTabFromDate();
      this.closeFilterDropdowns();
      this.patchKitchenDayControls();
      this.patchKitchenPlanTitle();
      this.loadData({ soft: true });
    }
  }

  _onContainerChange(e) {
    if (!this.container.querySelector('.reports-page')) return;

    const locCb = e.target.closest('[data-location-filter]');
    if (locCb) {
      const id = locCb.dataset.locationFilter;
      this.locationFilters = locCb.checked
        ? [...new Set([...this.locationFilters, id])]
        : this.locationFilters.filter(x => x !== id);
      this.renderShell();
      return;
    }

    const shiftCb = e.target.closest('[data-shift-filter]');
    if (shiftCb) {
      const id = shiftCb.dataset.shiftFilter;
      this.shiftFilters = shiftCb.checked
        ? [...new Set([...this.shiftFilters, id])]
        : this.shiftFilters.filter(x => x !== id);
      this.renderShell();
      return;
    }

    const empCb = e.target.closest('[data-employee-filter]');
    if (empCb) {
      const id = empCb.dataset.employeeFilter;
      this.employeeFilters = empCb.checked
        ? [...new Set([...this.employeeFilters, id])]
        : this.employeeFilters.filter(x => x !== id);
      this.renderShell();
    }
  }

  exportCurrentReport() {
    const meta = this.reportMeta();
    if (!meta) return;

    let rows = [];
    let filename = `report-${meta.id}`;

    if (meta.id === 'nutrition') {
      const data = buildNutritionSummary(
        this.filteredOrders(), this.usersById, this.groupsById, this.itemsById, this.rulesById,
      );
      rows = [
        ['ФИО', 'Табельный номер', 'Смена', 'Организация', 'Заказов', 'Сумма'],
        ...data.map(r => [r.name, r.personnelNumber, r.shift, r.organization, r.orderCount, r.totalSum]),
      ];
    } else if (meta.id === 'dishes') {
      const data = buildDishesReport(this.filteredOrders(), this.usersById, this.itemsById);
      rows = [
        ['Товар', 'Категория', 'Кол-во', 'Сумма'],
        ...data.map(r => [r.name, r.category, r.totalQty, r.totalSum]),
      ];
    } else if (meta.id === 'orders') {
      const data = buildOrdersPaymentsReport(this.filteredOrders(), this.usersById);
      rows = [
        ['№ заказа', 'Дата', 'Сотрудник', 'Оплата', 'Сумма'],
        ...data.map(r => [r.orderNumber, fmtOrderDateTime(r.createdAt), r.userName, paymentStatusLabel(r.paymentStatus), r.total]),
      ];
    } else if (meta.id === 'kitchen') {
      const data = buildKitchenReport(
        this.filteredOrders(),
        this.itemsById,
        this.itemsByName,
        { sortDir: this.kitchenQtySort },
      );
      rows = [
        ['Дата плана', this.kitchenPlanDate],
        ['Блюдо', 'Цех/Категория', 'Количество'],
        ...data.map(r => [r.name, r.workshop, r.totalQty]),
      ];
      filename = `kitchen-plan-${this.kitchenPlanDate}`;
    } else if (meta.id === 'validations') {
      const period = this._reportPeriodRange || resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
      const data = buildValidationLogsReport(this.validationLogs, period);
      rows = [
        ['Время', 'Сотрудник', 'Карта', 'Точка', 'Правило', 'Статус', 'Причина / Списание'],
        ...data.map(r => [
          fmtOrderDateTime(r.createdAt),
          r.userName,
          r.cardNumber,
          r.channelPoint,
          r.ruleName,
          r.status === 'success' ? 'Успешно' : 'Отказ',
          r.status === 'success' ? r.deductionSummary : r.denyReason,
        ]),
      ];
    } else if (meta.id === 'client-transactions') {
      const period = this._reportPeriodRange || resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
      const data = buildClientTransactionsReport(
        this.validatorTransactions,
        this.filteredOrders(),
        this.usersById,
        period,
      );
      rows = [
        ['Дата', 'Сотрудник', 'Тип', 'Сумма', 'Баланс после', 'Детали'],
        ...data.map(r => [
          fmtOrderDateTime(r.createdAt),
          r.userName,
          r.typeLabel,
          r.amount,
          r.balanceAfter ?? '—',
          r.detail,
        ]),
      ];
    }

    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${toDateInputValue()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderShell() {
    const meta = this.reportMeta();
    const bodyHtml = `
      <div class="reports-page">
        ${this.activeReport ? this.renderReportDetail(meta) : this.renderCatalog()}
      </div>
    `;

    this.container.innerHTML = renderAdminShell({
      active: 'reports',
      title: 'Отчёты',
      subtitle: meta
        ? meta.title
        : 'Аналитика питания, заказов и производственные сводки',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    this.bindEvents();
    this.syncExpandedRows();
  }

  bindEvents() {
    if (!this._eventsBound) {
      this._eventsBound = true;
      document.addEventListener('click', this.handleDropdownOutside);
      window.addEventListener('resize', this._onWindowResize);
    }
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('change', this._onContainerChange);
    this.container.removeEventListener('input', this._onContainerInput);
    this.container.addEventListener('click', this._onContainerClick);
    this.container.addEventListener('change', this._onContainerChange);
    this.container.addEventListener('input', this._onContainerInput);
  }

  renderCatalog() {
    return `
      <div class="reports-catalog">
        <p class="reports-catalog-lead">Выберите отчёт для просмотра и выгрузки данных за выбранный период.</p>
        <div class="reports-grid">
          ${REPORT_CATALOG.map(r => `
            <button type="button" class="reports-card btn-press reports-card--${r.tone}" data-report-id="${r.id}">
              <span class="reports-card-icon" aria-hidden="true">${REPORT_ICONS[r.icon]}</span>
              <span class="reports-card-body">
                <span class="reports-card-title">${esc(r.title)}</span>
                <span class="reports-card-desc">${esc(r.description)}</span>
              </span>
              <span class="reports-card-arrow" aria-hidden="true">→</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderReportDetail(meta) {
    if (this.activeReport === 'kitchen') {
      return `
        <div class="reports-detail reports-detail--kitchen">
          <div class="reports-detail-head">
            <button type="button" class="reports-back btn-press" data-action="back-to-list">
              ${REPORT_ICONS['arrow-left']}
              <span>Назад к списку отчётов</span>
            </button>
          </div>

          <div id="reports-kitchen-filters-host">${this.renderKitchenFilters()}</div>

          ${this.error ? `<div class="admin-error card">${esc(this.error)}</div>` : ''}
          <div id="reports-kitchen-body-host" class="reports-kitchen-body-host">
            ${this.loading ? this.renderKitchenContentSkeleton() : this.renderKitchenContent()}
          </div>
        </div>
      `;
    }

    return `
      <div class="reports-detail">
        <div class="reports-detail-head">
          <button type="button" class="reports-back btn-press" data-action="back-to-list">
            ${REPORT_ICONS['arrow-left']}
            <span>Назад к списку отчётов</span>
          </button>
        </div>

        ${this.renderFilters()}

        ${this.error ? `<div class="admin-error card">${esc(this.error)}</div>` : ''}
        <div id="reports-body-host" class="reports-body-host">
          ${this.loading
      ? '<div class="admin-loading">Загрузка данных…</div>'
      : this.renderActiveTable()}
        </div>
      </div>
    `;
  }

  renderFilters() {
    if (this.activeReport === 'kitchen') return this.renderKitchenFilters();

    const periodTabs = [
      { id: 'day', label: 'День' },
      { id: 'week', label: 'Неделя' },
      { id: 'month', label: 'Месяц' },
      { id: 'custom', label: 'Период' },
    ];

    const locations = collectLocationOptions(this.orders, this.itemsById, this.rulesById);
    const shifts = collectShiftOptions(this.orders);
    const employees = collectEmployeeOptions(this.orders, this.usersById);

    return `
      <section class="reports-filters card">
        <div class="reports-filters-row">
          <div class="reports-filters-selects">
            <div class="reports-filter-field">
              <span class="reports-filter-label">Локации</span>
              ${this.renderMultiDropdown('location', locations.map(l => ({ id: l.id, label: l.name })), 'locationFilters', 'location-filter')}
            </div>
            <div class="reports-filter-field">
              <span class="reports-filter-label">Смены</span>
              ${this.renderMultiDropdown('shift', shifts.map(s => ({ id: s, label: s })), 'shiftFilters', 'shift-filter')}
            </div>
            <div class="reports-filter-field">
              <span class="reports-filter-label">Сотрудники</span>
              ${this.renderMultiDropdown('employee', employees.map(e => ({ id: e.id, label: e.name })), 'employeeFilters', 'employee-filter')}
            </div>
            ${renderFiltersResetBtn(this.hasActiveFilters())}
          </div>

          <div class="reports-filters-period">
            <span class="reports-filter-label">Период</span>
            <div class="period-tabs">
              ${periodTabs.map(t => `
                <button type="button" class="period-tab btn-press ${this.periodPreset === t.id ? 'period-tab--active' : ''}" data-period="${t.id}">${t.label}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="reports-custom-dates-row ${this.periodPreset === 'custom' ? '' : 'reports-custom-dates-row--hidden'}">
          <div class="reports-custom-dates">
            <label class="period-date"><span>С</span><input type="date" id="reports-from" value="${this.customFrom}" /></label>
            <label class="period-date"><span>По</span><input type="date" id="reports-to" value="${this.customTo}" /></label>
            <button type="button" class="btn btn-outline btn-press period-apply-btn" id="reports-apply-dates">Применить</button>
          </div>
        </div>

        <div class="reports-filters-actions">
          <div class="reports-filters-actions-left">
            <button type="button" class="btn btn-primary btn-press reports-btn-refresh" data-action="refresh-report">
              ${REPORT_ICONS.refresh}
              <span>Обновить</span>
            </button>
            <button type="button" class="btn btn-press reports-btn-export" data-action="export-report">
              ${REPORT_ICONS.download}
              <span>Экспорт в Excel</span>
            </button>
          </div>
          ${this.renderReportPeriodRange()}
        </div>
      </section>
    `;
  }

  renderKitchenFilters() {
    const locations = collectLocationOptions(this.orders, this.itemsById, this.rulesById);
    const shifts = collectShiftOptions(this.orders);
    const employees = collectEmployeeOptions(this.orders, this.usersById);
    const todayActive = this.kitchenDayTab === 'today';
    const tomorrowActive = this.kitchenDayTab === 'tomorrow';

    return `
      <section class="reports-filters card reports-filters--kitchen">
        <div class="reports-filters-row">
          <div class="reports-filters-selects">
            <div class="reports-filter-field">
              <span class="reports-filter-label">Локации</span>
              ${this.renderMultiDropdown('location', locations.map(l => ({ id: l.id, label: l.name })), 'locationFilters', 'location-filter')}
            </div>
            <div class="reports-filter-field">
              <span class="reports-filter-label">Смены</span>
              ${this.renderMultiDropdown('shift', shifts.map(s => ({ id: s, label: s })), 'shiftFilters', 'shift-filter')}
            </div>
            <div class="reports-filter-field">
              <span class="reports-filter-label">Сотрудники</span>
              ${this.renderMultiDropdown('employee', employees.map(e => ({ id: e.id, label: e.name })), 'employeeFilters', 'employee-filter')}
            </div>
            <div class="reports-filters-reset-slot">
              ${renderFiltersResetBtn(this.hasActiveFilters())}
            </div>
          </div>

          <div class="reports-kitchen-date-block">
            <div class="reports-kitchen-date-row">
              <div class="period-tabs reports-kitchen-day-tabs" role="tablist" aria-label="Быстрый выбор дня">
                <button
                  type="button"
                  class="period-tab btn-press ${todayActive ? 'period-tab--active' : ''}"
                  data-kitchen-day="today"
                  role="tab"
                  aria-selected="${todayActive}"
                >Сегодня</button>
                <button
                  type="button"
                  class="period-tab btn-press ${tomorrowActive ? 'period-tab--active' : ''}"
                  data-kitchen-day="tomorrow"
                  role="tab"
                  aria-selected="${tomorrowActive}"
                >Завтра</button>
              </div>
              <div class="reports-filter-field reports-kitchen-date-field-wrap">
                <span class="reports-filter-label">День производства</span>
                <input
                  type="date"
                  class="reports-filter-trigger"
                  id="kitchen-plan-date"
                  value="${this.kitchenPlanDate}"
                  aria-label="Дата плана производства"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="reports-filters-actions">
          <button type="button" class="btn btn-primary btn-press reports-btn-refresh" data-action="refresh-report">
            ${REPORT_ICONS.refresh}
            <span>Обновить</span>
          </button>
          <button type="button" class="btn btn-press reports-btn-export" data-action="export-report">
            ${REPORT_ICONS.download}
            <span>Экспорт в Excel</span>
          </button>
        </div>
      </section>
    `;
  }

  renderMultiDropdown(idPrefix, options, filterKey, dataAttr) {
    const selected = this[filterKey];
    return `
      <div class="reports-filter-dropdown" id="reports-${idPrefix}-dropdown">
        <button type="button" class="reports-filter-trigger btn-press" id="reports-${idPrefix}-trigger" aria-expanded="false">
          <span class="reports-filter-trigger-label">${esc(this[`${idPrefix}FilterSummary`]())}</span>
          <span class="reports-filter-chevron">${REPORT_ICONS.chevron}</span>
        </button>
        <div class="reports-filter-menu" id="reports-${idPrefix}-menu" hidden>
          <div class="reports-filter-menu-head">
            <button type="button" class="reports-filter-clear btn-press" data-${idPrefix}-action="clear">Сбросить</button>
          </div>
          <div class="reports-filter-menu-list kiosk-scroll">
            ${options.length ? options.map(opt => `
              <label class="reports-filter-option">
                <input type="checkbox" data-${dataAttr}="${escAttr(opt.id)}" ${selected.includes(opt.id) ? 'checked' : ''} />
                <span>${esc(opt.label)}</span>
              </label>
            `).join('') : `<p class="reports-filter-empty">Нет данных</p>`}
          </div>
        </div>
      </div>
    `;
  }

  renderActiveTable() {
    switch (this.activeReport) {
      case 'nutrition': return this.renderNutritionTable();
      case 'dishes': return this.renderDishesTable();
      case 'orders': return this.renderOrdersTable();
      case 'kitchen': return this.renderKitchenTable();
      case 'validations': return this.renderValidationsTable();
      case 'client-transactions': return this.renderClientTransactionsTable();
      default: return '';
    }
  }

  renderNutritionTable() {
    const rows = buildNutritionSummary(
      this.filteredOrders(), this.usersById, this.groupsById, this.itemsById, this.rulesById,
    );

    if (!rows.length) {
      return '<div class="reports-empty card"><p>Нет данных за выбранный период и фильтры</p></div>';
    }

    const body = rows.map(row => {
      const key = `user:${row.userId}`;
      const open = this.expandedRows.has(key);
      const detailRows = row.orders.flatMap(order => (order.items || []).map(line => `
        <tr>
          <td class="reports-nested-td-id reports-td-nowrap">№ ${esc(order.orderNumber || order.orderId?.slice(0, 8))}</td>
          <td class="reports-td-nowrap">${fmtOrderDateTime(order.createdAt)}</td>
          <td>${esc(order.location)}</td>
          <td>${esc(order.menu)}</td>
          <td>${esc(line.name)}</td>
          <td class="reports-td-num">${fmtMoney((Number(line.price) || 0) * (Number(line.quantity) || 0))}</td>
          <td class="reports-td-muted">${esc(order.note || '—')}</td>
        </tr>
      `)).join('');

      return `
        <tr class="reports-row reports-row--expandable ${open ? 'reports-row--open' : ''}" data-expand-key="${escAttr(key)}" tabindex="0">
          <td class="reports-td-chevron"><span class="reports-chevron-cell">${REPORT_ICONS.chevron}</span></td>
          <td>${esc(row.name)}</td>
          <td class="reports-td-mono reports-td-nowrap">${esc(row.personnelNumber)}</td>
          <td class="reports-td-nowrap">${esc(row.shift)}</td>
          <td>${esc(row.organization)}</td>
          <td class="reports-td-num">${fmtCount(row.orderCount)}</td>
          <td class="reports-td-num">${fmtMoney(row.totalSum)}</td>
        </tr>
        <tr class="reports-detail-row" ${open ? '' : 'hidden'}>
          <td colspan="7">
            <div class="reports-nested-wrap">
              <table class="reports-nested-table">
                ${renderNestedColgroup(NESTED_NUTRITION_COL_WIDTHS)}
                <thead>
                  <tr>
                    <th class="reports-nested-th-id">ID заказа</th>
                    <th>Дата/время</th>
                    <th>Локация</th>
                    <th>Меню</th>
                    <th>Блюдо</th>
                    <th class="reports-th-num">Сумма</th>
                    <th>Примечание</th>
                  </tr>
                </thead>
                <tbody>${detailRows || '<tr><td colspan="7" class="reports-td-muted">Нет позиций</td></tr>'}</tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-wrap card">
        <table class="reports-table reports-table--expandable">
          ${renderColgroup('nutrition')}
          <thead>
            <tr>
              <th class="reports-th-chevron" scope="col" aria-label="Раскрыть"></th>
              <th scope="col">ФИО</th>
              <th scope="col">Табельный №</th>
              <th scope="col">Смена</th>
              <th scope="col">Организация</th>
              <th class="reports-th-num" scope="col">Заказов</th>
              <th class="reports-th-num" scope="col">Сумма</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  renderDishesTable() {
    const rows = buildDishesReport(this.filteredOrders(), this.usersById, this.itemsById);

    if (!rows.length) {
      return '<div class="reports-empty card"><p>Нет данных за выбранный период и фильтры</p></div>';
    }

    const body = rows.map(row => {
      const key = `dish:${row.dishKey}`;
      const open = this.expandedRows.has(key);
      const detailRows = row.details.map(d => `
        <tr>
          <td>${esc(d.userName)}</td>
          <td class="reports-td-nowrap">${fmtOrderDateTime(d.createdAt)}</td>
          <td class="reports-td-nowrap">${fmtPickupSlot(d.dateSlot, d.timeSlot)}</td>
          <td class="reports-td-num">${fmtCount(d.quantity)}</td>
          <td class="reports-td-muted reports-td-nowrap">№ ${esc(d.orderNumber)}</td>
        </tr>
      `).join('');

      return `
        <tr class="reports-row reports-row--expandable ${open ? 'reports-row--open' : ''}" data-expand-key="${escAttr(key)}" tabindex="0">
          <td class="reports-td-chevron"><span class="reports-chevron-cell">${REPORT_ICONS.chevron}</span></td>
          <td>${esc(row.name)}</td>
          <td>${esc(row.category)}</td>
          <td class="reports-td-num">${fmtCount(row.totalQty)}</td>
          <td class="reports-td-num">${fmtMoney(row.totalSum)}</td>
        </tr>
        <tr class="reports-detail-row" ${open ? '' : 'hidden'}>
          <td colspan="5">
            <div class="reports-nested-wrap">
              <table class="reports-nested-table">
                <thead>
                  <tr>
                    <th>Сотрудник / гость</th>
                    <th>Дата/время</th>
                    <th>Слот выдачи</th>
                    <th class="reports-th-num">Кол-во</th>
                    <th>Заказ</th>
                  </tr>
                </thead>
                <tbody>${detailRows}</tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-wrap card">
        <table class="reports-table reports-table--expandable">
          ${renderColgroup('dishes')}
          <thead>
            <tr>
              <th class="reports-th-chevron" scope="col" aria-label="Раскрыть"></th>
              <th scope="col">Товар</th>
              <th scope="col">Категория</th>
              <th class="reports-th-num" scope="col">Заказано, шт.</th>
              <th class="reports-th-num" scope="col">Сумма</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  renderOrdersTable() {
    const rows = buildOrdersPaymentsReport(this.filteredOrders(), this.usersById);

    if (!rows.length) {
      return '<div class="reports-empty card"><p>Нет данных за выбранный период и фильтры</p></div>';
    }

    const body = rows.map(row => {
      const key = `order:${row.orderId}`;
      const open = this.expandedRows.has(key);
      const payClass = row.paymentStatus === 'paid' ? 'reports-pay--paid' : 'reports-pay--unpaid';
      const itemRows = row.items.map(line => `
        <tr>
          <td>${esc(line.name)}</td>
          <td class="reports-td-num">${fmtCount(line.quantity)}</td>
          <td class="reports-td-num">${fmtMoney(line.price)}</td>
          <td class="reports-td-num">${fmtMoney((Number(line.price) || 0) * (Number(line.quantity) || 0))}</td>
        </tr>
      `).join('');

      return `
        <tr class="reports-row reports-row--expandable ${open ? 'reports-row--open' : ''}" data-expand-key="${escAttr(key)}" tabindex="0">
          <td class="reports-td-chevron"><span class="reports-chevron-cell">${REPORT_ICONS.chevron}</span></td>
          <td class="reports-td-mono reports-td-nowrap">№ ${esc(row.orderNumber)}</td>
          <td class="reports-td-nowrap">${fmtOrderDateTime(row.createdAt)}</td>
          <td>${esc(row.userName)}</td>
          <td class="reports-td-nowrap"><span class="reports-pay ${payClass}">${paymentStatusLabel(row.paymentStatus)}</span></td>
          <td class="reports-td-num">${fmtMoney(row.total)}</td>
        </tr>
        <tr class="reports-detail-row" ${open ? '' : 'hidden'}>
          <td colspan="6">
            <div class="reports-nested-wrap">
              <table class="reports-nested-table">
                <thead>
                  <tr>
                    <th>Позиция</th>
                    <th class="reports-th-num">Кол-во</th>
                    <th class="reports-th-num">Цена</th>
                    <th class="reports-th-num">Сумма</th>
                  </tr>
                </thead>
                <tbody>${itemRows || '<tr><td colspan="4" class="reports-td-muted">Пустой заказ</td></tr>'}</tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-wrap card">
        <table class="reports-table reports-table--expandable">
          ${renderColgroup('orders')}
          <thead>
            <tr>
              <th class="reports-th-chevron" scope="col" aria-label="Раскрыть"></th>
              <th scope="col">ID заказа</th>
              <th scope="col">Дата оформления</th>
              <th scope="col">Сотрудник / гость</th>
              <th scope="col">Статус оплаты</th>
              <th class="reports-th-num" scope="col">Итого</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  renderValidationsTable() {
    const period = this._reportPeriodRange || resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
    const rows = buildValidationLogsReport(this.validationLogs, period);

    if (!rows.length) {
      return '<div class="reports-empty card"><p>Нет проходов за выбранный период</p></div>';
    }

    const body = rows.map(row => {
      const statusClass = row.status === 'success' ? 'vld-log-status--success' : 'vld-log-status--denied';
      const statusLabel = row.status === 'success' ? 'Успешно' : 'Отказ';
      return `
        <tr>
          <td class="reports-td-nowrap">${fmtOrderDateTime(row.createdAt)}</td>
          <td>${esc(row.userName)}</td>
          <td class="reports-td-mono">${esc(row.cardNumber)}</td>
          <td>${esc(row.channelPoint)}</td>
          <td>${esc(row.ruleName)}</td>
          <td><span class="vld-log-status ${statusClass}">${statusLabel}</span></td>
          <td>${esc(row.status === 'success' ? row.deductionSummary : row.denyReason)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reports-table-wrap card">
        <table class="reports-table">
          ${renderColgroup('validations')}
          <thead>
            <tr>
              <th scope="col">Время</th>
              <th scope="col">Сотрудник</th>
              <th scope="col">Номер карты</th>
              <th scope="col">Канал/Точка</th>
              <th scope="col">Правило</th>
              <th scope="col">Статус</th>
              <th scope="col">Причина отказа / Списание</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  renderClientTransactionsTable() {
    const period = this._reportPeriodRange || resolvePeriod(this.periodPreset, this.customFrom, this.customTo);
    const rows = buildClientTransactionsReport(
      this.validatorTransactions,
      this.filteredOrders(),
      this.usersById,
      period,
    );

    if (!rows.length) {
      return '<div class="reports-empty card"><p>Нет транзакций за выбранный период</p></div>';
    }

    const body = rows.map(row => `
      <tr>
        <td class="reports-td-nowrap">${fmtOrderDateTime(row.createdAt)}</td>
        <td>${esc(row.userName)}</td>
        <td>${esc(row.typeLabel)}</td>
        <td class="reports-td-num">${fmtMoney(Math.abs(row.amount))}</td>
        <td class="reports-td-num">${row.balanceAfter != null ? fmtMoney(row.balanceAfter) : '—'}</td>
        <td>${esc(row.detail)}</td>
      </tr>
    `).join('');

    return `
      <div class="reports-table-wrap card">
        <table class="reports-table">
          ${renderColgroup('client-transactions')}
          <thead>
            <tr>
              <th scope="col">Дата</th>
              <th scope="col">Сотрудник</th>
              <th scope="col">Тип операции</th>
              <th class="reports-th-num" scope="col">Сумма</th>
              <th class="reports-th-num" scope="col">Баланс после</th>
              <th scope="col">Детали</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  renderKitchenContentSkeleton() {
    return this.renderKitchenContent({ skeleton: true });
  }

  renderKitchenContent({ skeleton = false } = {}) {
    const rows = skeleton ? [] : buildKitchenReport(
      this.filteredOrders(),
      this.itemsById,
      this.itemsByName,
      { sortDir: this.kitchenQtySort },
    );

    const sortIcon = this.kitchenQtySort === 'desc'
      ? REPORT_ICONS['sort-desc']
      : REPORT_ICONS['sort-asc'];
    const sortLabel = this.kitchenQtySort === 'desc'
      ? 'Сортировка: по убыванию количества'
      : 'Сортировка: по возрастанию количества';

    const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);
    const hasRows = rows.length > 0;

    const body = hasRows
      ? rows.map(row => `
        <tr class="reports-row">
          <td>${esc(row.name)}</td>
          <td>${esc(row.workshop)}</td>
          <td class="reports-td-num reports-td-qty">${fmtCount(row.totalQty)}</td>
        </tr>
      `).join('')
      : '';

    return `
      <div class="reports-table-wrap card reports-table-wrap--kitchen">
        <div class="reports-kitchen-plan-head">
          <h2 class="reports-kitchen-plan-title">${esc(this.kitchenPlanTitle())}</h2>
          <div class="reports-kitchen-summary">
            <span>Всего позиций к приготовлению:</span>
            <strong>${fmtCount(totalQty)} ед.</strong>
          </div>
        </div>
        ${skeleton ? `
          <div class="reports-kitchen-body-placeholder" aria-hidden="true"></div>
        ` : hasRows ? `
          <table class="reports-table">
            ${renderColgroup('kitchen')}
            <thead>
              <tr>
                <th>Наименование блюда / продукта</th>
                <th>Цех / категория</th>
                <th class="reports-th-num">
                  <button type="button" class="reports-th-sort btn-press" data-kitchen-sort="qty" aria-label="${escAttr(sortLabel)}" title="${escAttr(sortLabel)}">
                    <span>Количество (ед.)</span>
                    <span class="reports-th-sort-icon">${sortIcon}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        ` : `
          <div class="reports-kitchen-empty">
            <p>Нет заказов на выбранный день — план пуст</p>
          </div>
        `}
      </div>
    `;
  }

  renderKitchenTable() {
    return this.renderKitchenContent();
  }

  destroy() {
    this._eventsBound = false;
    document.removeEventListener('click', this.handleDropdownOutside);
    window.removeEventListener('resize', this._onWindowResize);
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('change', this._onContainerChange);
    this.container.removeEventListener('input', this._onContainerInput);
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
