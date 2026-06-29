import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { openBulkWalletOperationModal } from '../components/bulk-wallet-operation-modal.js';
import { openUserFormModal } from '../components/user-form-modal.js';
import { ensureDefaultCrmRefs, fetchLoyaltyCategories, fetchUserGroups } from '../services/crm-ref-data.js';
import { bulkUpdateCrmUsers, fetchCrmUsers, filterCrmUsers } from '../services/users-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { ensureDefaultWallets, fetchWallets } from '../services/wallets-data.js';
import { fmtCount, fmtMoney } from '../utils/format.js';
import {
  loyaltyBadgeClass,
  loyaltyLabel,
  userStatusBadgeClass,
  userStatusLabel,
} from '../utils/user-format.js';
import { USER_STATUS } from '../../shared/schema.js';
import { showToast } from '../utils/toast.js';
import { renderFiltersResetBtn, syncFiltersResetBtn } from '../utils/filter-panel.js';

const STATUS_OPTIONS = [
  { id: USER_STATUS.ACTIVE, label: 'Активен' },
  { id: USER_STATUS.BLOCKED, label: 'Заблокирован' },
  { id: USER_STATUS.FIRED, label: 'Уволен' },
];

export class UsersPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.users = [];
    this.groups = [];
    this.loyaltyCategories = [];
    this.wallets = [];
    this.allergens = [];
    this.search = '';
    this.groupFilters = [];
    this.statusFilters = [];
    this.loyaltyFilters = [];
    this.groupDropdownOpen = false;
    this.statusDropdownOpen = false;
    this.loyaltyDropdownOpen = false;
    this.bulkGroupOpen = false;
    this.bulkLoyaltyOpen = false;
    this.selectedIds = new Set();
    this.bulkSaving = false;
    this.loading = true;
    this.error = null;
    this._modal = null;
    this.handleDropdownOutside = this.handleDropdownOutside.bind(this);
    this._onContainerClick = this._onContainerClick.bind(this);
    this._onContainerInput = this._onContainerInput.bind(this);
    this._onContainerChange = this._onContainerChange.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
    this.init();
  }

  async init() {
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();
    try {
      await ensureDefaultCrmRefs();
      await ensureDefaultWallets();
      const [users, groups, loyaltyCategories, menuSettings, wallets] = await Promise.all([
        fetchCrmUsers(),
        fetchUserGroups(),
        fetchLoyaltyCategories(),
        fetchMenuSettings([]),
        fetchWallets(),
      ]);
      this.users = users;
      this.groups = groups;
      this.loyaltyCategories = loyaltyCategories;
      this.wallets = wallets;
      this.allergens = menuSettings.allergens || [];
      this.groupsById = new Map(groups.map(g => [g.id, g]));
      this.loyaltyById = new Map(loyaltyCategories.map(c => [c.id, c]));
      this.error = null;
    } catch (err) {
      console.error('[users]', err);
      this.error = err.message || 'Не удалось загрузить клиентов';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  filteredUsers() {
    return filterCrmUsers(this.users, {
      search: this.search,
      groupIds: this.groupFilters,
      statuses: this.statusFilters,
      loyaltyCategoryIds: this.loyaltyFilters,
    });
  }

  hasActiveFilters() {
    return Boolean(
      this.search.trim()
      || this.groupFilters.length
      || this.statusFilters.length
      || this.loyaltyFilters.length,
    );
  }

  resetFilters() {
    this.search = '';
    this.groupFilters = [];
    this.statusFilters = [];
    this.loyaltyFilters = [];
    this.groupDropdownOpen = false;
    this.statusDropdownOpen = false;
    this.loyaltyDropdownOpen = false;
    const searchInput = this.container.querySelector('#users-search');
    if (searchInput) searchInput.value = '';
    this.refreshTable();
  }

  groupName(id) {
    if (!id) return '—';
    return this.groupsById?.get(id)?.name || id;
  }

  usersCountText() {
    const n = this.filteredUsers().length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11 ? 'клиент' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'клиента' : 'клиентов';
    return `${n} ${word}`;
  }

  groupFilterSummary() {
    if (!this.groupFilters.length) return 'Все группы';
    if (this.groupFilters.length === 1) return this.groupName(this.groupFilters[0]);
    return `${this.groupFilters.length} группы`;
  }

  statusFilterSummary() {
    if (!this.statusFilters.length) return 'Все статусы';
    if (this.statusFilters.length === 1) return userStatusLabel(this.statusFilters[0]);
    return `${this.statusFilters.length} статуса`;
  }

  loyaltyFilterSummary() {
    if (!this.loyaltyFilters.length) return 'Все категории';
    if (this.loyaltyFilters.length === 1) {
      if (this.loyaltyFilters[0] === '__none__') return 'Без категории';
      return loyaltyLabel(this.loyaltyFilters[0], this.loyaltyById);
    }
    return `${this.loyaltyFilters.length} категории`;
  }

  syncDropdown(idPrefix) {
    const openMap = {
      group: this.groupDropdownOpen,
      status: this.statusDropdownOpen,
      loyalty: this.loyaltyDropdownOpen,
    };
    const summaryMap = {
      group: () => this.groupFilterSummary(),
      status: () => this.statusFilterSummary(),
      loyalty: () => this.loyaltyFilterSummary(),
    };
    const open = openMap[idPrefix];
    const dropdown = this.container.querySelector(`#users-${idPrefix}-dropdown`);
    const menu = this.container.querySelector(`#users-${idPrefix}-menu`);
    const trigger = this.container.querySelector(`#users-${idPrefix}-trigger`);
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
    this.syncDropdown('group');
    this.syncDropdown('status');
    this.syncDropdown('loyalty');
  }

  refreshTable() {
    const page = this.container.querySelector('.users-page');
    if (!page) return;

    const countEl = page.querySelector('.users-count');
    if (countEl) countEl.textContent = this.usersCountText();

    const listHost = page.querySelector('[data-users-list]');
    if (listHost) listHost.innerHTML = this.renderTable();

    this.syncBulkUi();
    this.syncAllDropdowns();
    syncFiltersResetBtn(page, this.hasActiveFilters());
  }

  clearSelection() {
    this.selectedIds.clear();
    this.bulkGroupOpen = false;
    this.bulkLoyaltyOpen = false;
    this.syncBulkUi();
  }

  selectedUsers() {
    return this.users.filter(u => this.selectedIds.has(u.id));
  }

  isAllVisibleSelected() {
    const visible = this.filteredUsers();
    return visible.length > 0 && visible.every(u => this.selectedIds.has(u.id));
  }

  isSomeVisibleSelected() {
    const visible = this.filteredUsers();
    return visible.some(u => this.selectedIds.has(u.id)) && !this.isAllVisibleSelected();
  }

  renderBulkBar() {
    const count = this.selectedIds.size;
    const visible = count > 0;
    return `
      <div class="products-bulk-bar users-bulk-bar ${visible ? 'products-bulk-bar--visible' : ''}" role="toolbar" aria-label="Массовые действия" aria-hidden="${visible ? 'false' : 'true'}">
        <span class="products-bulk-count">Выбрано клиентов: ${fmtCount(count)}</span>
        <div class="products-bulk-actions">
          <div class="users-bulk-dropdown ${this.bulkGroupOpen ? 'orders-status-dropdown--open' : ''}" id="users-bulk-group-dropdown">
            <button type="button" class="btn btn-outline btn-press products-bulk-btn" id="users-bulk-group-trigger" ${this.bulkSaving ? 'disabled' : ''}>Изменить группу ▾</button>
            <div class="orders-status-menu users-bulk-menu" id="users-bulk-group-menu" ${this.bulkGroupOpen ? '' : 'hidden'}>
              ${this.groups.map(g => `
                <button type="button" class="users-bulk-option btn-press" data-bulk-group="${escAttr(g.id)}">${esc(g.name)}</button>
              `).join('')}
            </div>
          </div>
          <div class="users-bulk-dropdown ${this.bulkLoyaltyOpen ? 'orders-status-dropdown--open' : ''}" id="users-bulk-loyalty-dropdown">
            <button type="button" class="btn btn-outline btn-press products-bulk-btn" id="users-bulk-loyalty-trigger" ${this.bulkSaving ? 'disabled' : ''}>Изменить категорию ▾</button>
            <div class="orders-status-menu users-bulk-menu" id="users-bulk-loyalty-menu" ${this.bulkLoyaltyOpen ? '' : 'hidden'}>
              <button type="button" class="users-bulk-option btn-press" data-bulk-loyalty="">— Снять категорию —</button>
              ${this.loyaltyCategories.map(c => `
                <button type="button" class="users-bulk-option btn-press" data-bulk-loyalty="${escAttr(c.id)}">${esc(c.name)}</button>
              `).join('')}
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-press products-bulk-btn" id="users-bulk-wallet" ${this.bulkSaving ? 'disabled' : ''}>Управление средствами</button>
        </div>
        <button type="button" class="products-bulk-dismiss btn-press" data-bulk-action="clear" aria-label="Сбросить выбор" ${this.bulkSaving ? 'disabled' : ''}>✕</button>
      </div>
    `;
  }

  syncBulkUi() {
    const page = this.container.querySelector('.users-page');
    if (!page) return;

    const bar = page.querySelector('.users-bulk-bar');
    if (bar) {
      const count = this.selectedIds.size;
      const visible = count > 0;
      bar.classList.toggle('products-bulk-bar--visible', visible);
      bar.setAttribute('aria-hidden', visible ? 'false' : 'true');
      const countEl = bar.querySelector('.products-bulk-count');
      if (countEl) countEl.textContent = `Выбрано клиентов: ${fmtCount(count)}`;
      bar.querySelectorAll('.products-bulk-btn, .products-bulk-dismiss').forEach(btn => {
        btn.disabled = this.bulkSaving;
      });
    }

    const selectAll = page.querySelector('#users-select-all');
    if (selectAll) {
      selectAll.checked = this.isAllVisibleSelected();
      selectAll.indeterminate = this.isSomeVisibleSelected();
    }

    page.querySelectorAll('.users-row').forEach(row => {
      const id = row.dataset.userId;
      const checked = this.selectedIds.has(id);
      row.classList.toggle('users-row--selected', checked);
      const cb = row.querySelector('.users-row-check');
      if (cb) cb.checked = checked;
    });
  }

  syncBulkDropdown(which) {
    const map = {
      group: ['users-bulk-group-dropdown', 'users-bulk-group-menu', 'users-bulk-group-trigger', this.bulkGroupOpen],
      loyalty: ['users-bulk-loyalty-dropdown', 'users-bulk-loyalty-menu', 'users-bulk-loyalty-trigger', this.bulkLoyaltyOpen],
    };
    const [dropdownId, menuId, triggerId, open] = map[which];
    const dropdown = this.container.querySelector(`#${dropdownId}`);
    const menu = this.container.querySelector(`#${menuId}`);
    const trigger = this.container.querySelector(`#${triggerId}`);
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', open);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));

    if (open) {
      const rect = trigger.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${Math.max(rect.width, 200)}px`;
    } else {
      menu.style.position = '';
      menu.style.top = '';
      menu.style.left = '';
      menu.style.minWidth = '';
    }
  }

  async applyBulkGroup(groupId) {
    if (this.bulkSaving || !this.selectedIds.size) return;
    this.bulkSaving = true;
    this.bulkGroupOpen = false;
    this.syncBulkUi();
    try {
      const n = await bulkUpdateCrmUsers([...this.selectedIds], { userGroupId: groupId || null });
      this.users = await fetchCrmUsers();
      this.clearSelection();
      this.refreshTable();
      const name = this.groupName(groupId);
      showToast(`Группа обновлена у ${n} клиентов: ${name}`);
    } catch (err) {
      showToast(err.message || 'Не удалось обновить группу');
    } finally {
      this.bulkSaving = false;
      this.syncBulkUi();
    }
  }

  async applyBulkLoyalty(categoryId) {
    if (this.bulkSaving || !this.selectedIds.size) return;
    this.bulkSaving = true;
    this.bulkLoyaltyOpen = false;
    this.syncBulkUi();
    try {
      const n = await bulkUpdateCrmUsers([...this.selectedIds], { loyaltyCategoryId: categoryId || null });
      this.users = await fetchCrmUsers();
      this.clearSelection();
      this.refreshTable();
      const name = loyaltyLabel(categoryId, this.loyaltyById);
      showToast(`Категория обновлена у ${n} клиентов: ${name}`);
    } catch (err) {
      showToast(err.message || 'Не удалось обновить категорию');
    } finally {
      this.bulkSaving = false;
      this.syncBulkUi();
    }
  }

  openBulkWalletModal() {
    if (this.bulkSaving || !this.selectedIds.size) return;
    if (!this.wallets.length) {
      showToast('Справочник кошельков пуст');
      return;
    }
    openBulkWalletOperationModal({
      userIds: [...this.selectedIds],
      wallets: this.wallets,
      onComplete: async () => {
        this.users = await fetchCrmUsers();
        this.clearSelection();
        this.refreshTable();
      },
    });
  }

  openModal(user = null) {
    this._modal?.close?.();
    this._modal = openUserFormModal({
      user,
      groups: this.groups,
      loyaltyCategories: this.loyaltyCategories,
      allergens: this.allergens,
      onSaved: async () => {
        this.users = await fetchCrmUsers();
        this.refreshTable();
        if (this._modal && user?.id) {
          const updated = this.users.find(u => u.id === user.id);
          if (updated) Object.assign(user, updated);
        }
      },
    });
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка клиентов…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : this.renderContent();

    this.container.innerHTML = renderAdminShell({
      active: 'users',
      title: 'Клиенты и CRM',
      subtitle: 'Управление клиентами, кошельками и лояльностью',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) {
      this.bindEvents();
      this.syncAllDropdowns();
      this.syncBulkUi();
    }
  }

  renderContent() {
    return `
      <div class="users-page">
        ${this.renderBulkBar()}
        ${this.renderFilters()}
        <div data-users-list>${this.renderTable()}</div>
      </div>
    `;
  }

  renderFilters() {
    return `
      <section class="orders-filters card users-filters ${this.selectedIds.size ? 'users-filters--dimmed' : ''}">
        <div class="orders-filters-primary">
          <div class="orders-filter-inline orders-filter-search">
            <span class="orders-filter-label">Поиск</span>
            <input
              type="search"
              class="orders-search-input users-search-input"
              id="users-search"
              placeholder="ФИО, email, телефон…"
              value="${escAttr(this.search)}"
              aria-label="Поиск клиентов"
            />
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Группа</span>
            ${this.renderGroupDropdown()}
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Статус</span>
            ${this.renderStatusDropdown()}
          </div>

          <div class="orders-filter-inline">
            <span class="orders-filter-label">Категория</span>
            ${this.renderLoyaltyDropdown()}
          </div>

          ${renderFiltersResetBtn(this.hasActiveFilters())}
        </div>

        <div class="orders-filters-toolbar">
          <div class="admin-filters-toolbar-left">
            <button type="button" class="btn btn-primary btn-press orders-create-btn" id="users-create-btn">+ Новый пользователь</button>
          </div>

          <div class="admin-filters-toolbar-right">
            <span class="admin-filters-count">Найдено <span class="users-count">${this.usersCountText()}</span></span>
          </div>
        </div>
      </section>
    `;
  }

  renderGroupDropdown() {
    return `
      <div class="orders-status-dropdown ${this.groupDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="users-group-dropdown">
        <button type="button" class="orders-status-trigger btn-press" id="users-group-trigger" aria-expanded="${this.groupDropdownOpen}">
          <span class="orders-status-trigger-label">${esc(this.groupFilterSummary())}</span>
          <span class="orders-status-trigger-caret">▾</span>
        </button>
        <div class="orders-status-menu" id="users-group-menu" ${this.groupDropdownOpen ? '' : 'hidden'}>
          ${this.groups.map(g => `
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

  renderStatusDropdown() {
    return `
      <div class="orders-status-dropdown ${this.statusDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="users-status-dropdown">
        <button type="button" class="orders-status-trigger btn-press" id="users-status-trigger" aria-expanded="${this.statusDropdownOpen}">
          <span class="orders-status-trigger-label">${esc(this.statusFilterSummary())}</span>
          <span class="orders-status-trigger-caret">▾</span>
        </button>
        <div class="orders-status-menu" id="users-status-menu" ${this.statusDropdownOpen ? '' : 'hidden'}>
          ${STATUS_OPTIONS.map(s => `
            <label class="orders-status-option">
              <input type="checkbox" data-status-filter="${s.id}" ${this.statusFilters.includes(s.id) ? 'checked' : ''} />
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

  renderLoyaltyDropdown() {
    return `
      <div class="orders-status-dropdown ${this.loyaltyDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="users-loyalty-dropdown">
        <button type="button" class="orders-status-trigger btn-press" id="users-loyalty-trigger" aria-expanded="${this.loyaltyDropdownOpen}">
          <span class="orders-status-trigger-label">${esc(this.loyaltyFilterSummary())}</span>
          <span class="orders-status-trigger-caret">▾</span>
        </button>
        <div class="orders-status-menu" id="users-loyalty-menu" ${this.loyaltyDropdownOpen ? '' : 'hidden'}>
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

  renderTable() {
    const users = this.filteredUsers();
    if (!users.length) {
      return `<div class="orders-empty card"><p>Клиенты не найдены по выбранным фильтрам</p></div>`;
    }

    return `
      <div class="orders-table-wrap card">
        <table class="orders-table users-table">
          <thead>
            <tr>
              <th class="users-th-check">
                <input type="checkbox" id="users-select-all" class="users-check" aria-label="Выбрать всех" ${this.isAllVisibleSelected() ? 'checked' : ''} />
              </th>
              <th>ФИО / Email</th>
              <th>Группа</th>
              <th>Категория</th>
              <th class="users-th-balance">Баланс</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => this.renderRow(u)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderRow(user) {
    const selected = this.selectedIds.has(user.id);
    return `
      <tr class="orders-row users-row ${selected ? 'users-row--selected' : ''}" data-user-id="${escAttr(user.id)}" tabindex="0">
        <td class="users-td-check" data-stop-row="1">
          <input type="checkbox" class="users-row-check users-check" data-user-check="${escAttr(user.id)}" ${selected ? 'checked' : ''} aria-label="Выбрать ${escAttr(user.name)}" />
        </td>
        <td>
          <span class="orders-client">${esc(user.name || '—')}</span>
          ${user.email ? `<span class="orders-client-email">${esc(user.email)}</span>` : ''}
        </td>
        <td>${esc(this.groupName(user.userGroupId))}</td>
        <td><span class="crm-loyalty ${loyaltyBadgeClass(user.loyaltyCategoryId)}">${esc(loyaltyLabel(user.loyaltyCategoryId, this.loyaltyById))}</span></td>
        <td class="users-td-balance">${fmtMoney(user.balance)}</td>
        <td><span class="crm-badge ${userStatusBadgeClass(user.status)}">${userStatusLabel(user.status)}</span></td>
      </tr>
    `;
  }

  handleDropdownOutside(e) {
    if (this.container.querySelector('#users-group-dropdown')?.contains(e.target)) return;
    if (this.container.querySelector('#users-status-dropdown')?.contains(e.target)) return;
    if (this.container.querySelector('#users-loyalty-dropdown')?.contains(e.target)) return;
    if (this.container.querySelector('#users-group-menu')?.contains(e.target)) return;
    if (this.container.querySelector('#users-status-menu')?.contains(e.target)) return;
    if (this.container.querySelector('#users-loyalty-menu')?.contains(e.target)) return;
    if (this.container.querySelector('#users-bulk-group-dropdown')?.contains(e.target)) return;
    if (this.container.querySelector('#users-bulk-loyalty-dropdown')?.contains(e.target)) return;
    if (this.container.querySelector('#users-bulk-group-menu')?.contains(e.target)) return;
    if (this.container.querySelector('#users-bulk-loyalty-menu')?.contains(e.target)) return;

    let changed = false;
    if (this.groupDropdownOpen || this.statusDropdownOpen || this.loyaltyDropdownOpen) {
      this.groupDropdownOpen = false;
      this.statusDropdownOpen = false;
      this.loyaltyDropdownOpen = false;
      changed = true;
    }
    if (this.bulkGroupOpen || this.bulkLoyaltyOpen) {
      this.bulkGroupOpen = false;
      this.bulkLoyaltyOpen = false;
      this.syncBulkDropdown('group');
      this.syncBulkDropdown('loyalty');
    }
    if (changed) this.syncAllDropdowns();
  }

  _onContainerClick(e) {
    if (!this.container.querySelector('.users-page')) return;

    if (e.target.closest('[data-action="reset-filters"]')) {
      this.resetFilters();
      return;
    }

    if (e.target.closest('#users-create-btn')) {
      this.openModal(null);
      return;
    }

    if (e.target.closest('#users-bulk-group-trigger')) {
      e.stopPropagation();
      this.bulkGroupOpen = !this.bulkGroupOpen;
      this.bulkLoyaltyOpen = false;
      this.syncBulkDropdown('group');
      this.syncBulkDropdown('loyalty');
      return;
    }

    if (e.target.closest('#users-bulk-loyalty-trigger')) {
      e.stopPropagation();
      this.bulkLoyaltyOpen = !this.bulkLoyaltyOpen;
      this.bulkGroupOpen = false;
      this.syncBulkDropdown('group');
      this.syncBulkDropdown('loyalty');
      return;
    }

    if (e.target.closest('#users-bulk-wallet')) {
      this.openBulkWalletModal();
      return;
    }

    const bulkGroup = e.target.closest('[data-bulk-group]');
    if (bulkGroup) {
      e.stopPropagation();
      this.applyBulkGroup(bulkGroup.dataset.bulkGroup);
      return;
    }

    const bulkLoyalty = e.target.closest('[data-bulk-loyalty]');
    if (bulkLoyalty) {
      e.stopPropagation();
      this.applyBulkLoyalty(bulkLoyalty.dataset.bulkLoyalty || null);
      return;
    }

    if (e.target.closest('[data-bulk-action="clear"]')) {
      this.clearSelection();
      this.refreshTable();
      return;
    }

    if (e.target.closest('#users-group-trigger')) {
      e.stopPropagation();
      this.groupDropdownOpen = !this.groupDropdownOpen;
      this.statusDropdownOpen = false;
      this.loyaltyDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('#users-status-trigger')) {
      e.stopPropagation();
      this.statusDropdownOpen = !this.statusDropdownOpen;
      this.groupDropdownOpen = false;
      this.loyaltyDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('#users-loyalty-trigger')) {
      e.stopPropagation();
      this.loyaltyDropdownOpen = !this.loyaltyDropdownOpen;
      this.groupDropdownOpen = false;
      this.statusDropdownOpen = false;
      this.syncAllDropdowns();
      return;
    }

    if (e.target.closest('[data-group-action="clear"]')) {
      this.groupFilters = [];
      this.refreshTable();
      return;
    }

    if (e.target.closest('[data-status-action="clear"]')) {
      this.statusFilters = [];
      this.refreshTable();
      return;
    }

    if (e.target.closest('[data-loyalty-action="clear"]')) {
      this.loyaltyFilters = [];
      this.refreshTable();
      return;
    }

    const row = e.target.closest('[data-user-id]');
    if (row) {
      if (e.target.closest('[data-stop-row]')) return;
      const user = this.users.find(u => u.id === row.dataset.userId);
      if (user) this.openModal(user);
    }
  }

  _onContainerInput(e) {
    if (e.target.id === 'users-search') {
      this.search = e.target.value;
      this.refreshTable();
      const input = this.container.querySelector('#users-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  _onContainerChange(e) {
    if (e.target.id === 'users-select-all') {
      const visible = this.filteredUsers();
      if (e.target.checked) visible.forEach(u => this.selectedIds.add(u.id));
      else visible.forEach(u => this.selectedIds.delete(u.id));
      this.refreshTable();
      return;
    }

    const rowCheck = e.target.closest('[data-user-check]');
    if (rowCheck) {
      const id = rowCheck.dataset.userCheck;
      if (rowCheck.checked) this.selectedIds.add(id);
      else this.selectedIds.delete(id);
      this.syncBulkUi();
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
      this.refreshTable();
      return;
    }

    const statusCb = e.target.closest('[data-status-filter]');
    if (statusCb) {
      const id = statusCb.dataset.statusFilter;
      if (statusCb.checked) {
        if (!this.statusFilters.includes(id)) this.statusFilters.push(id);
      } else {
        this.statusFilters = this.statusFilters.filter(x => x !== id);
      }
      this.refreshTable();
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
      this.refreshTable();
    }
  }

  _onWindowResize() {
    if (this.groupDropdownOpen || this.statusDropdownOpen || this.loyaltyDropdownOpen) this.syncAllDropdowns();
    if (this.bulkGroupOpen) this.syncBulkDropdown('group');
    if (this.bulkLoyaltyOpen) this.syncBulkDropdown('loyalty');
  }

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    document.addEventListener('click', this.handleDropdownOutside);
    window.addEventListener('resize', this._onWindowResize);
    this.container.addEventListener('click', this._onContainerClick);
    this.container.addEventListener('input', this._onContainerInput);
    this.container.addEventListener('change', this._onContainerChange);
  }

  destroy() {
    this._eventsBound = false;
    document.removeEventListener('click', this.handleDropdownOutside);
    window.removeEventListener('resize', this._onWindowResize);
    this.container.removeEventListener('click', this._onContainerClick);
    this.container.removeEventListener('input', this._onContainerInput);
    this.container.removeEventListener('change', this._onContainerChange);
    this._modal?.close?.();
    this._modal = null;
    document.getElementById('user-form-modal')?.remove();
    document.getElementById('wallet-op-modal')?.remove();
    document.getElementById('bulk-wallet-op-modal')?.remove();
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
