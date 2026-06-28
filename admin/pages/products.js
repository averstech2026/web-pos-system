import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { openAllergensModal } from '../components/allergens-modal.js';
import { openCategoriesModal } from '../components/categories-modal.js';
import { openItemFormModal } from '../components/item-form-modal.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import {
  collectCategories,
  deleteItem,
  fetchAllItems,
  filterItems,
  setItemAvailability,
} from '../services/products-data.js';
import { fmtCount, fmtMoney } from '../utils/format.js';
import { productThumbHtml } from '../utils/product-image.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';

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
    this.allergens = [];
    this.categoryFilters = [];
    this.categoryDropdownOpen = false;
    this.search = '';
    this.availabilityFilter = 'all';
    this.loading = true;
    this.error = null;
    this.savingId = null;
    this.handleCategoryDropdownOutside = this.handleCategoryDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerInput = this._onContainerInput.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this.init();
  }

  async init() {
    document.addEventListener('click', this.handleCategoryDropdownOutside);
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();

    try {
      const items = await fetchAllItems();
      const settings = await fetchMenuSettings(items.map(i => i.category));
      this.items = items;
      this.categories = collectCategories(settings.categories, items);
      this.allergens = settings.allergens;
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
    return filterItems(this.items, {
      categories: this.categoryFilters,
      search: this.search,
      availability: this.availabilityFilter,
    });
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

  handleCategoryDropdownOutside(e) {
    if (document.getElementById('item-form-modal')?.contains(e.target)) return;
    if (document.getElementById('categories-modal')?.contains(e.target)) return;
    if (document.getElementById('allergens-modal')?.contains(e.target)) return;

    const dropdown = this.container.querySelector('#products-category-dropdown');
    if (dropdown?.contains(e.target)) return;
    if (!this.categoryDropdownOpen) return;
    this.categoryDropdownOpen = false;
    this.syncCategoryDropdown();
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

  closeCategoryDropdown() {
    this.categoryDropdownOpen = false;
    this.syncCategoryDropdown();
  }

  openItemModal(opts) {
    this.closeCategoryDropdown();
    openItemFormModal(opts);
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
      subtitle: 'Справочник блюд, групп и аллергенов',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) {
      this.bindEvents();
      this.syncCategoryDropdown();
    }
  }

  renderContent() {
    return `
      <div class="products-page">
        ${this.renderFilters()}
        ${this.renderTable()}
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
          ${this.categories.map(c => `
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

  renderFilters() {
    return `
      <section class="products-filters card">
        <div class="products-filters-main">
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
            <span class="products-filter-label">Доступность</span>
            <div class="products-chip-group">
              ${AVAILABILITY_OPTIONS.map(o => `
                <button type="button" class="products-chip btn-press ${this.availabilityFilter === o.id ? 'products-chip--active' : ''}" data-availability="${o.id}">${o.label}</button>
              `).join('')}
            </div>
          </div>

          <div class="products-filter-inline products-filter-summary">
            <span class="products-filter-label">Найдено</span>
            <span class="products-count">${this.itemsCountText()}</span>
          </div>

          <div class="products-filters-actions">
            <button type="button" class="btn btn-outline btn-press products-meta-btn" id="products-manage-categories">Группы</button>
            <button type="button" class="btn btn-outline btn-press products-meta-btn" id="products-manage-allergens">Аллергены</button>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="products-create-btn">
              + Добавить
            </button>
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

    return `
      <tr class="products-row" data-item-id="${item.id}">
        <td class="products-td-photo">${productThumbHtml(item)}</td>
        <td class="products-td-name">
          <span class="products-name">${esc(item.name || '—')}</span>
          ${item.description ? `<span class="products-desc">${esc(item.description)}</span>` : ''}
          ${allergenText ? `<span class="products-allergens">⚠ ${esc(allergenText)}</span>` : ''}
        </td>
        <td><span class="products-category">${esc(item.category || '—')}</span></td>
        <td class="products-td-num">${fmtMoney(item.price)}</td>
        <td class="products-td-num">${nutrition?.kcal ?? '—'}</td>
        <td class="products-td-avail">
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
        <td class="products-td-actions">
          <div class="products-actions-inner">
            <button type="button" class="products-action btn-press" data-action="edit" data-item-id="${item.id}">Изменить</button>
            <button type="button" class="products-action products-action--danger btn-press" data-action="delete" data-item-id="${item.id}">Удалить</button>
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

    const checkbox = e.target.closest('#products-category-menu input[type="checkbox"][data-category-filter]');
    if (!checkbox) return;

    const cat = checkbox.dataset.categoryFilter;
    if (checkbox.checked) {
      if (!this.categoryFilters.includes(cat)) this.categoryFilters.push(cat);
    } else {
      this.categoryFilters = this.categoryFilters.filter(c => c !== cat);
    }

    this.categoryDropdownOpen = true;
    this.refreshTable();
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.products-page')) return;

    if (e.target.closest('#products-create-btn')) {
      this.openItemModal({
        categories: this.categories,
        allergens: this.allergens,
        onSaved: () => this.loadData(),
      });
      return;
    }

    if (e.target.closest('#products-manage-categories')) {
      this.closeCategoryDropdown();
      openCategoriesModal({
        categories: this.categories,
        items: this.items,
        onSaved: () => this.loadData(),
      });
      return;
    }

    if (e.target.closest('#products-manage-allergens')) {
      this.closeCategoryDropdown();
      openAllergensModal({
        allergens: this.allergens,
        onSaved: () => this.loadData(),
      });
      return;
    }

    const catTrigger = e.target.closest('#products-category-trigger');
    if (catTrigger) {
      e.stopPropagation();
      this.categoryDropdownOpen = !this.categoryDropdownOpen;
      this.syncCategoryDropdown();
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

    if (e.target.closest('#products-category-menu')) return;

    const availBtn = e.target.closest('[data-availability]');
    if (availBtn) {
      this.availabilityFilter = availBtn.dataset.availability;
      this.categoryDropdownOpen = false;
      this.renderShell();
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

    if (actionBtn.dataset.action === 'delete') {
      if (!confirm(`Удалить «${item.name}» из справочника?`)) return;
      this.deleteItem(itemId);
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

    this.syncCategoryDropdown();
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

  async deleteItem(id) {
    try {
      await deleteItem(id);
      await this.loadData();
    } catch (err) {
      console.error('[products] delete', err);
      alert(err.message || 'Не удалось удалить товар');
    }
  }

  destroy() {
    document.removeEventListener('click', this.handleCategoryDropdownOutside);
    this._eventsBound = false;
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('input', this._onContainerInput);
    this.container.removeEventListener('change', this._onContainerChange);
    document.getElementById('item-form-modal')?.remove();
    document.getElementById('categories-modal')?.remove();
    document.getElementById('allergens-modal')?.remove();
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
