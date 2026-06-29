import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import {
  openBulkAllergensModal,
  openBulkAvailabilityModal,
  openBulkGroupModal,
} from '../components/bulk-operations-modals.js';
import { openItemFormModal } from '../components/item-form-modal.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import {
  bulkSetAllergens,
  bulkSetAvailability,
  bulkSetCategory,
  collectCategories,
  archiveItem,
  fetchAllItems,
  filterItems,
  setItemAvailability,
} from '../services/products-data.js';
import { fmtCount, fmtMoney } from '../utils/format.js';
import { productThumbHtml } from '../utils/product-image.js';
import { showToast } from '../utils/toast.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';
import { formatAvailabilityRuleShort, buildGroupsByName, matchesScheduleFilter } from '../../shared/availability-rules.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { renderFiltersResetBtn, syncFiltersResetBtn } from '../utils/filter-panel.js';

const AVAILABILITY_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'available', label: 'В продаже' },
  { id: 'hidden', label: 'Скрытые' },
];

export class ProductsPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.items = [];
    this.categories = [];
    this.categoryGroups = [];
    this.allergens = [];
    this.availabilityRules = [];
    this.rulesMap = new Map();
    this.selectedIds = new Set();
    this.bulkSaving = false;
    this.categoryFilters = [];
    this.categoryDropdownOpen = false;
    this.allergenFilters = [];
    this.allergenDropdownOpen = false;
    this.search = '';
    this.availabilityFilter = 'all';
    this.scheduleFilter = 'all';
    this.groupsByName = new Map();
    this.loading = true;
    this.error = null;
    this.savingId = null;
    this.handleFilterDropdownOutside = this.handleFilterDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerInput = this._onContainerInput.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this.init();
  }

  async init() {
    document.addEventListener('click', this.handleFilterDropdownOutside);
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();

    try {
      const [items, availabilityRules] = await Promise.all([
        fetchAllItems(),
        fetchActiveAvailabilityRules(),
      ]);
      const settings = await fetchMenuSettings(items.map(i => i.category));
      this.items = items;
      this.categories = collectCategories(settings.categories, items);
      this.categoryGroups = settings.categoryGroups;
      this.allergens = settings.allergens;
      this.availabilityRules = availabilityRules;
      this.rulesMap = new Map(availabilityRules.map(r => [r.id, r]));
      this.groupsByName = buildGroupsByName(this.categoryGroups);
      this.error = null;
    } catch (err) {
      console.error('[products]', err);
      this.error = err.message || 'Не удалось загрузить товары';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  filteredItems() {
    let result = this.items.filter(i => i.isArchived !== true);

    result = filterItems(result, {
      categories: this.categoryFilters,
      allergens: this.allergenFilters,
      search: this.search,
      availability: this.availabilityFilter,
    });

    if (this.scheduleFilter !== 'all') {
      result = result.filter(item => matchesScheduleFilter(item, this.groupsByName, this.scheduleFilter));
    }

    return result;
  }

  hasActiveFilters() {
    return Boolean(
      this.search.trim()
      || this.categoryFilters.length
      || this.allergenFilters.length
      || this.scheduleFilter !== 'all'
      || this.availabilityFilter !== 'all',
    );
  }

  resetFilters() {
    this.search = '';
    this.categoryFilters = [];
    this.allergenFilters = [];
    this.scheduleFilter = 'all';
    this.availabilityFilter = 'all';
    this.closeFilterDropdowns();
    const searchInput = this.container.querySelector('#products-search');
    if (searchInput) searchInput.value = '';
    const scheduleSelect = this.container.querySelector('#products-schedule-filter');
    if (scheduleSelect) scheduleSelect.value = 'all';
    this.renderShell();
  }

  filterCategories() {
    if (this.scheduleFilter === 'all') return this.categories;

    const set = new Set(this.filteredItems().map(i => i.category).filter(Boolean));
    if (this.scheduleFilter !== 'none') {
      for (const g of this.categoryGroups) {
        if (g.availabilityRuleId === this.scheduleFilter) set.add(g.name);
      }
    }
    return this.categories.filter(c => set.has(c));
  }

  itemsCountText() {
    const n = this.filteredItems().length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'товар'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'товара'
        : 'товаров';
    return `${fmtCount(n)} ${word}`;
  }

  categoryFilterSummary() {
    const selected = this.categoryFilters;
    if (!selected.length) return 'Все категории';
    if (selected.length === 1) return selected[0];
    if (selected.length === 2) return selected.join(', ');
    const n = selected.length;
    return `${n} категории`;
  }

  allergenLabels(ids = []) {
    if (!ids?.length) return '';
    return ids
      .map(id => this.allergens.find(a => a.id === id)?.name || id)
      .join(', ');
  }

  allergenFilterSummary() {
    const selected = this.allergenFilters;
    if (!selected.length) return 'Все';
    if (selected.length === 1) {
      return this.allergens.find(a => a.id === selected[0])?.name || selected[0];
    }
    if (selected.length === 2) {
      return selected.map(id => this.allergens.find(a => a.id === id)?.name || id).join(', ');
    }
    const n = selected.length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'аллерген'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'аллергена'
        : 'аллергенов';
    return `${n} ${word}`;
  }

  handleFilterDropdownOutside(e) {
    if (document.getElementById('item-form-modal')?.contains(e.target)) return;
    if (document.getElementById('bulk-ops-modal')?.contains(e.target)) return;

    const categoryDropdown = this.container.querySelector('#products-category-dropdown');
    if (categoryDropdown?.contains(e.target)) return;
    const allergenDropdown = this.container.querySelector('#products-allergen-dropdown');
    if (allergenDropdown?.contains(e.target)) return;

    if (!this.categoryDropdownOpen && !this.allergenDropdownOpen) return;
    this.closeFilterDropdowns();
  }

  syncCategoryDropdown() {
    const dropdown = this.container.querySelector('#products-category-dropdown');
    const menu = this.container.querySelector('#products-category-menu');
    const trigger = this.container.querySelector('#products-category-trigger');
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', this.categoryDropdownOpen);
    menu.hidden = !this.categoryDropdownOpen;
    trigger.setAttribute('aria-expanded', String(this.categoryDropdownOpen));

    const label = trigger.querySelector('.orders-status-trigger-label');
    if (label) label.textContent = this.categoryFilterSummary();

    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.minWidth = '';

    if (this.categoryDropdownOpen) {
      const rect = trigger.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${Math.max(rect.width, 200)}px`;
      menu.style.zIndex = '400';
    }
  }

  syncAllergenDropdown() {
    const dropdown = this.container.querySelector('#products-allergen-dropdown');
    const menu = this.container.querySelector('#products-allergen-menu');
    const trigger = this.container.querySelector('#products-allergen-trigger');
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', this.allergenDropdownOpen);
    menu.hidden = !this.allergenDropdownOpen;
    trigger.setAttribute('aria-expanded', String(this.allergenDropdownOpen));

    const label = trigger.querySelector('.orders-status-trigger-label');
    if (label) label.textContent = this.allergenFilterSummary();

    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.minWidth = '';

    if (this.allergenDropdownOpen) {
      const rect = trigger.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${Math.max(rect.width, 200)}px`;
      menu.style.zIndex = '400';
    }
  }

  closeFilterDropdowns() {
    this.categoryDropdownOpen = false;
    this.allergenDropdownOpen = false;
    this.syncCategoryDropdown();
    this.syncAllergenDropdown();
  }

  openItemModal(opts) {
    this.closeFilterDropdowns();
    openItemFormModal({
      availabilityRules: this.availabilityRules,
      ...opts,
    });
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка товаров…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : this.renderContent();

    this.container.innerHTML = renderAdminShell({
      active: 'products',
      title: 'Товары',
      subtitle: 'Справочник блюд',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) {
      this.bindEvents();
      this.syncCategoryDropdown();
      this.syncAllergenDropdown();
      this.syncBulkUi();
    }
  }

  renderContent() {
    return `
      <div class="products-page">
        ${this.renderFilters()}
        ${this.renderTable()}
        ${this.renderBulkBar()}
      </div>
    `;
  }

  visibleItemIds() {
    return this.filteredItems().map(i => i.id);
  }

  isAllVisibleSelected() {
    const ids = this.visibleItemIds();
    return ids.length > 0 && ids.every(id => this.selectedIds.has(id));
  }

  isSomeVisibleSelected() {
    const ids = this.visibleItemIds();
    return ids.some(id => this.selectedIds.has(id)) && !this.isAllVisibleSelected();
  }

  selectedItems() {
    return this.items.filter(i => this.selectedIds.has(i.id));
  }

  clearSelection() {
    this.selectedIds.clear();
    this.syncBulkUi();
  }

  renderBulkBar() {
    const count = this.selectedIds.size;
    const visible = count > 0;

    return `
      <div class="products-bulk-bar ${visible ? 'products-bulk-bar--visible' : ''}" role="toolbar" aria-label="Массовые действия" aria-hidden="${visible ? 'false' : 'true'}">
        <span class="products-bulk-count">Выбрано товаров: ${fmtCount(count)}</span>
        <div class="products-bulk-actions">
          <button type="button" class="btn btn-outline btn-press products-bulk-btn" data-bulk-action="group" ${this.bulkSaving ? 'disabled' : ''}>Изменить группу</button>
          <button type="button" class="btn btn-outline btn-press products-bulk-btn" data-bulk-action="allergens" ${this.bulkSaving ? 'disabled' : ''}>Указать аллергены</button>
          <button type="button" class="btn btn-outline btn-press products-bulk-btn" data-bulk-action="availability" ${this.bulkSaving ? 'disabled' : ''}>Статус продажи</button>
        </div>
        <button type="button" class="products-bulk-dismiss btn-press" data-bulk-action="clear" aria-label="Снять выделение" ${this.bulkSaving ? 'disabled' : ''}>✕</button>
      </div>
    `;
  }

  renderCategoryDropdown() {
    return `
      <div class="orders-status-dropdown ${this.categoryDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="products-category-dropdown">
        <button
          type="button"
          class="orders-status-trigger btn-press"
          id="products-category-trigger"
          aria-expanded="${this.categoryDropdownOpen}"
          aria-haspopup="listbox"
        >
          <span class="orders-status-trigger-label">${this.categoryFilterSummary()}</span>
          <span class="orders-status-trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div class="orders-status-menu" id="products-category-menu" role="listbox" ${this.categoryDropdownOpen ? '' : 'hidden'}>
          ${this.filterCategories().map(c => `
            <label class="orders-status-option">
              <input type="checkbox" data-category-filter="${escAttr(c)}" ${this.categoryFilters.includes(c) ? 'checked' : ''} />
              <span>${esc(c)}</span>
            </label>
          `).join('')}
          <div class="orders-status-menu-foot">
            <button type="button" class="orders-status-reset btn-press" data-category-action="clear">Сбросить</button>
          </div>
        </div>
      </div>
    `;
  }

  renderAllergenDropdown() {
    return `
      <div class="orders-status-dropdown ${this.allergenDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="products-allergen-dropdown">
        <button
          type="button"
          class="orders-status-trigger btn-press"
          id="products-allergen-trigger"
          aria-expanded="${this.allergenDropdownOpen}"
          aria-haspopup="listbox"
        >
          <span class="orders-status-trigger-label">${this.allergenFilterSummary()}</span>
          <span class="orders-status-trigger-caret" aria-hidden="true">▾</span>
        </button>
        <div class="orders-status-menu" id="products-allergen-menu" role="listbox" ${this.allergenDropdownOpen ? '' : 'hidden'}>
          ${this.allergens.map(a => `
            <label class="orders-status-option">
              <input type="checkbox" data-allergen-filter="${escAttr(a.id)}" ${this.allergenFilters.includes(a.id) ? 'checked' : ''} />
              <span>${esc(a.name)}</span>
            </label>
          `).join('')}
          <div class="orders-status-menu-foot">
            <button type="button" class="orders-status-reset btn-press" data-allergen-action="clear">Сбросить</button>
          </div>
        </div>
      </div>
    `;
  }

  renderFilters() {
    return `
      <section class="products-filters card">
        <div class="products-filters-primary">
          <div class="products-filter-inline products-filter-search">
            <span class="products-filter-label">Поиск</span>
            <input
              type="search"
              class="products-search-input"
              id="products-search"
              placeholder="Название или описание…"
              value="${escAttr(this.search)}"
            />
          </div>

          <div class="products-filter-inline">
            <span class="products-filter-label">Категория</span>
            ${this.renderCategoryDropdown()}
          </div>

          <div class="products-filter-inline">
            <span class="products-filter-label">Аллергены</span>
            ${this.renderAllergenDropdown()}
          </div>

          <div class="products-filter-inline products-filter-schedule">
            <span class="products-filter-label">Расписание</span>
            <select class="products-schedule-select" id="products-schedule-filter" aria-label="Фильтр по расписанию">
              <option value="all" ${this.scheduleFilter === 'all' ? 'selected' : ''}>Все</option>
              <option value="none" ${this.scheduleFilter === 'none' ? 'selected' : ''}>Доступно всегда (Без ограничений)</option>
              ${this.availabilityRules.map(r => `
                <option value="${escAttr(r.id)}" ${this.scheduleFilter === r.id ? 'selected' : ''}>${esc(r.name)}</option>
              `).join('')}
            </select>
          </div>

          ${renderFiltersResetBtn(this.hasActiveFilters())}
        </div>

        <div class="products-filters-toolbar">
          <div class="admin-filters-toolbar-left">
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="products-create-btn">
              + Добавить
            </button>

            <div class="products-filter-inline">
              <span class="products-filter-label">Доступность</span>
              <div class="products-chip-group">
                ${AVAILABILITY_OPTIONS.map(o => `
                  <button type="button" class="products-chip btn-press ${this.availabilityFilter === o.id ? 'products-chip--active' : ''}" data-availability="${o.id}">${o.label}</button>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="admin-filters-toolbar-right">
            <span class="admin-filters-count">Найдено <span class="products-count">${this.itemsCountText()}</span></span>
          </div>
        </div>
      </section>
    `;
  }

  renderTable() {
    const items = this.filteredItems();

    if (!items.length) {
      return `
        <div class="products-empty card">
          <p>Товары не найдены</p>
          <p class="products-empty-hint">Измените фильтры или добавьте новое блюдо в справочник.</p>
        </div>
      `;
    }

    return `
      <div class="products-table-wrap card">
        <table class="products-table">
          <thead>
            <tr>
              <th class="products-th-check">
                <input
                  type="checkbox"
                  class="products-check"
                  id="products-select-all"
                  aria-label="Выбрать все"
                  ${this.isAllVisibleSelected() ? 'checked' : ''}
                />
              </th>
              <th class="products-th-photo"></th>
              <th>Название</th>
              <th>Категория</th>
              <th class="products-th-num">Цена</th>
              <th class="products-th-num">Ккал</th>
              <th>Доступность</th>
              <th class="products-th-actions">Действия</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => this.renderRow(item)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderRow(item) {
    const nutrition = resolveItemNutrition(item);
    const available = item.isAvailable !== false;
    const isSaving = this.savingId === item.id;
    const allergenText = this.allergenLabels(item.allergens);
    const rule = item.availabilityRuleId ? this.rulesMap.get(item.availabilityRuleId) : null;
    const scheduleText = rule ? formatAvailabilityRuleShort(rule) : '';

    return `
      <tr class="orders-row products-row ${this.selectedIds.has(item.id) ? 'products-row--selected' : ''}" data-item-id="${item.id}" tabindex="0">
        <td class="products-td-check" data-stop-row="1">
          <input
            type="checkbox"
            class="products-check products-row-check"
            data-item-select="${item.id}"
            aria-label="Выбрать ${escAttr(item.name || 'товар')}"
            ${this.selectedIds.has(item.id) ? 'checked' : ''}
          />
        </td>
        <td class="products-td-photo">${productThumbHtml(item)}</td>
        <td class="products-td-name">
          <span class="orders-client">${esc(item.name || '—')}</span>
          ${item.description ? `<span class="products-desc">${esc(item.description)}</span>` : ''}
          ${scheduleText ? `<span class="products-avail-schedule">🕐 ${esc(scheduleText)}</span>` : ''}
          ${allergenText ? `<span class="products-allergens">⚠ ${esc(allergenText)}</span>` : ''}
        </td>
        <td><span class="products-category">${esc(item.category || '—')}</span></td>
        <td class="products-td-num">${fmtMoney(item.price)}</td>
        <td class="products-td-num">${nutrition?.kcal ?? '—'}</td>
        <td class="products-td-avail" data-stop-row="1">
          <button
            type="button"
            class="products-avail-toggle btn-press ${available ? 'products-avail-toggle--on' : ''}"
            data-action="toggle-avail"
            data-item-id="${item.id}"
            aria-pressed="${available}"
            ${isSaving ? 'disabled' : ''}
          >
            <span class="products-avail-knob" aria-hidden="true"></span>
            <span class="products-avail-label">${available ? 'В продаже' : 'Скрыт'}</span>
          </button>
        </td>
        <td class="products-td-actions" data-stop-row="1">
          <div class="products-actions-inner">
            <button type="button" class="products-action btn-press" data-action="edit" data-item-id="${item.id}">Изменить</button>
            <button type="button" class="products-action products-action--danger btn-press" data-action="archive" data-item-id="${item.id}">В архив</button>
          </div>
        </td>
      </tr>
    `;
  }

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    this.container.addEventListener('click', this._onContainerClick);
    this.container.addEventListener('input', this._onContainerInput);
    this.container.addEventListener('change', this._onContainerChange);
  }

  _onContainerInput(e) {
    if (!this.container.querySelector('.products-page')) return;
    if (e.target.id !== 'products-search') return;
    this.search = e.target.value;
    this.refreshTable();
  }

  _onContainerChange(e) {
    if (!this.container.querySelector('.products-page')) return;

    if (e.target.id === 'products-select-all') {
      const ids = this.visibleItemIds();
      if (e.target.checked) {
        ids.forEach(id => this.selectedIds.add(id));
      } else {
        ids.forEach(id => this.selectedIds.delete(id));
      }
      this.syncBulkUi();
      return;
    }

    const rowCheck = e.target.closest('.products-row-check');
    if (rowCheck) {
      const id = rowCheck.dataset.itemSelect;
      if (rowCheck.checked) this.selectedIds.add(id);
      else this.selectedIds.delete(id);
      this.syncBulkUi();
      return;
    }

    if (e.target.id === 'products-schedule-filter') {
      this.scheduleFilter = e.target.value || 'all';
      this.categoryFilters = this.categoryFilters.filter(c => this.filterCategories().includes(c));
      this.closeFilterDropdowns();
      this.renderShell();
      return;
    }

    const catCheckbox = e.target.closest('#products-category-menu input[type="checkbox"][data-category-filter]');
    if (catCheckbox) {
      const cat = catCheckbox.dataset.categoryFilter;
      if (catCheckbox.checked) {
        if (!this.categoryFilters.includes(cat)) this.categoryFilters.push(cat);
      } else {
        this.categoryFilters = this.categoryFilters.filter(c => c !== cat);
      }
      this.categoryDropdownOpen = true;
      this.refreshTable();
      return;
    }

    const allergenCheckbox = e.target.closest('#products-allergen-menu input[type="checkbox"][data-allergen-filter]');
    if (!allergenCheckbox) return;

    const allergenId = allergenCheckbox.dataset.allergenFilter;
    if (allergenCheckbox.checked) {
      if (!this.allergenFilters.includes(allergenId)) this.allergenFilters.push(allergenId);
    } else {
      this.allergenFilters = this.allergenFilters.filter(id => id !== allergenId);
    }

    this.allergenDropdownOpen = true;
    this.refreshTable();
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.products-page')) return;

    if (e.target.closest('[data-action="reset-filters"]')) {
      this.resetFilters();
      return;
    }

    if (e.target.closest('#products-create-btn')) {
      this.openItemModal({
        categories: this.categories,
        allergens: this.allergens,
        onSaved: () => this.loadData(),
      });
      return;
    }

    const catTrigger = e.target.closest('#products-category-trigger');
    if (catTrigger) {
      e.stopPropagation();
      this.allergenDropdownOpen = false;
      this.categoryDropdownOpen = !this.categoryDropdownOpen;
      this.syncCategoryDropdown();
      this.syncAllergenDropdown();
      return;
    }

    const allergenTrigger = e.target.closest('#products-allergen-trigger');
    if (allergenTrigger) {
      e.stopPropagation();
      this.categoryDropdownOpen = false;
      this.allergenDropdownOpen = !this.allergenDropdownOpen;
      this.syncCategoryDropdown();
      this.syncAllergenDropdown();
      return;
    }

    const catAction = e.target.closest('[data-category-action]');
    if (catAction) {
      e.preventDefault();
      if (catAction.dataset.categoryAction === 'clear') {
        this.categoryFilters = [];
      }
      this.categoryDropdownOpen = true;
      this.refreshTable();
      return;
    }

    const allergenAction = e.target.closest('[data-allergen-action]');
    if (allergenAction) {
      e.preventDefault();
      if (allergenAction.dataset.allergenAction === 'clear') {
        this.allergenFilters = [];
      }
      this.allergenDropdownOpen = true;
      this.refreshTable();
      return;
    }

    if (e.target.closest('#products-category-menu')) return;
    if (e.target.closest('#products-allergen-menu')) return;

    if (e.target.closest('#products-schedule-filter')) return;

    const bulkAction = e.target.closest('[data-bulk-action]');
    if (bulkAction) {
      this.handleBulkAction(bulkAction.dataset.bulkAction);
      return;
    }

    const availBtn = e.target.closest('[data-availability]');
    if (availBtn) {
      this.availabilityFilter = availBtn.dataset.availability;
      this.closeFilterDropdowns();
      this.renderShell();
      return;
    }

    const row = e.target.closest('.products-table [data-item-id]');
    if (row) {
      if (e.target.closest('[data-stop-row]')) return;
      const item = this.items.find(i => i.id === row.dataset.itemId);
      if (item) {
        this.openItemModal({
          item,
          categories: this.categories,
          allergens: this.allergens,
          onSaved: () => this.loadData(),
        });
      }
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const itemId = actionBtn.dataset.itemId;
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    if (actionBtn.dataset.action === 'edit') {
      this.openItemModal({
        item,
        categories: this.categories,
        allergens: this.allergens,
        onSaved: () => this.loadData(),
      });
      return;
    }

    if (actionBtn.dataset.action === 'archive') {
      if (!confirm(`Переместить «${item.name}» в архив? Товар исчезнет из меню, но останется в истории заказов.`)) return;
      this.archiveItem(itemId);
      return;
    }

    if (actionBtn.dataset.action === 'toggle-avail') {
      this.toggleAvailability(item);
    }
  }

  refreshTable() {
    const page = this.container.querySelector('.products-page');
    if (!page) return;

    const countEl = page.querySelector('.products-count');
    if (countEl) countEl.textContent = this.itemsCountText();

    const tableHost = page.querySelector('.products-table-wrap, .products-empty');
    if (tableHost) {
      tableHost.outerHTML = this.renderTable();
    }

    this.syncBulkUi();
    this.syncCategoryDropdown();
    this.syncAllergenDropdown();
    syncFiltersResetBtn(page, this.hasActiveFilters());
  }

  syncBulkUi() {
    const page = this.container.querySelector('.products-page');
    if (!page) return;

    const bar = page.querySelector('.products-bulk-bar');
    if (bar) {
      const count = this.selectedIds.size;
      const visible = count > 0;
      bar.classList.toggle('products-bulk-bar--visible', visible);
      bar.setAttribute('aria-hidden', visible ? 'false' : 'true');
      const countEl = bar.querySelector('.products-bulk-count');
      if (countEl) countEl.textContent = `Выбрано товаров: ${fmtCount(count)}`;
      bar.querySelectorAll('.products-bulk-btn, .products-bulk-dismiss').forEach(btn => {
        btn.disabled = this.bulkSaving;
      });
    }

    const selectAll = page.querySelector('#products-select-all');
    if (selectAll) {
      selectAll.checked = this.isAllVisibleSelected();
      selectAll.indeterminate = this.isSomeVisibleSelected();
    }

    page.querySelectorAll('.products-row').forEach(row => {
      const id = row.dataset.itemId;
      const checked = this.selectedIds.has(id);
      row.classList.toggle('products-row--selected', checked);
      const cb = row.querySelector('.products-row-check');
      if (cb) cb.checked = checked;
    });
  }

  handleBulkAction(action) {
    if (this.bulkSaving || !this.selectedIds.size) return;

    const selected = this.selectedItems();

    if (action === 'clear') {
      this.clearSelection();
      return;
    }

    if (action === 'group') {
      this.closeFilterDropdowns();
      openBulkGroupModal({
        categoryGroups: this.categoryGroups,
        onApply: async groupId => {
          const group = this.categoryGroups.find(g => g.id === groupId);
          if (!group) throw new Error('Группа не найдена');
          await this.runBulkUpdate(async () => {
            const n = await bulkSetCategory([...this.selectedIds], group.name);
            for (const item of selected) item.category = group.name;
            return n;
          });
        },
      });
      return;
    }

    if (action === 'allergens') {
      this.closeFilterDropdowns();
      openBulkAllergensModal({
        allergens: this.allergens,
        onApply: async (allergenIds, mode) => {
          await this.runBulkUpdate(async () => {
            const n = await bulkSetAllergens(selected, allergenIds, mode);
            for (const item of selected) {
              item.allergens = mode === 'union'
                ? [...new Set([...(item.allergens || []), ...allergenIds])]
                : [...allergenIds];
            }
            return n;
          });
        },
      });
      return;
    }

    if (action === 'availability') {
      this.closeFilterDropdowns();
      openBulkAvailabilityModal({
        onApply: async isAvailable => {
          await this.runBulkUpdate(async () => {
            const n = await bulkSetAvailability([...this.selectedIds], isAvailable);
            for (const item of selected) item.isAvailable = isAvailable;
            return n;
          });
        },
      });
    }
  }

  async runBulkUpdate(fn) {
    this.bulkSaving = true;
    this.syncBulkUi();

    try {
      const count = await fn();
      showToast(`Успешно обновлено товаров: ${fmtCount(count)}`);
      this.clearSelection();
      this.refreshTable();
    } catch (err) {
      console.error('[products] bulk', err);
      alert(err.message || 'Не удалось выполнить массовое обновление');
    } finally {
      this.bulkSaving = false;
      this.syncBulkUi();
    }
  }

  async toggleAvailability(item) {
    const next = item.isAvailable === false;
    this.savingId = item.id;
    this.refreshTable();

    try {
      await setItemAvailability(item.id, next);
      item.isAvailable = next;
    } catch (err) {
      console.error('[products] toggle', err);
      alert(err.message || 'Не удалось изменить доступность');
    } finally {
      this.savingId = null;
      this.refreshTable();
    }
  }

  async archiveItem(id) {
    try {
      await archiveItem(id);
      this.items = this.items.filter(i => i.id !== id);
      this.selectedIds.delete(id);
      this.refreshTable();
      showToast('Товар перемещён в архив');
    } catch (err) {
      console.error('[products] archive', err);
      alert(err.message || 'Не удалось переместить товар в архив');
    }
  }

  destroy() {
    document.removeEventListener('click', this.handleFilterDropdownOutside);
    this._eventsBound = false;
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('input', this._onContainerInput);
    this.container.removeEventListener('change', this._onContainerChange);
    document.getElementById('item-form-modal')?.remove();
    document.getElementById('bulk-ops-modal')?.remove();
  }
}

/** @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
