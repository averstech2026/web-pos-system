import QRCode from 'qrcode';
import { auth } from '../../shared/firebase.js';
import { USER_STATUS } from '../../shared/schema.js';
import {
  adjustWalletBalance,
  createCrmUser,
  fetchCrmUsers,
  fetchUserOrders,
  fetchWalletHistory,
  generateQrCodeValue,
  generateTempPassword,
  sendUserPasswordReset,
  updateCrmUser,
} from '../services/users-data.js';
import { openWalletOperationModal } from './wallet-operation-modal.js';
import { openOrderDetailModal } from './order-detail-modal.js';
import { fmtMoney } from '../utils/format.js';
import {
  fmtOrderDateCell,
  fmtOrderDateTime,
  orderStatusBadgeClass,
  orderStatusLabel,
  orderTotal,
} from '../utils/order-format.js';
import {
  briefOrderItems,
  walletOpClass,
  walletOpLabel,
  walletOpSign,
} from '../utils/user-format.js';
import { showToast } from '../utils/toast.js';
import { fetchValidationLogs, fetchUserApproachStats } from '../services/validation-logs-data.js';
import { fetchAllValidationRules } from '../services/validation-rules-data.js';
import { DEFAULT_WORK_SHIFT_ID } from '../../shared/work-shifts.js';

const STATUS_OPTIONS = [
  { id: USER_STATUS.ACTIVE, label: 'Активен' },
  { id: USER_STATUS.BLOCKED, label: 'Заблокирован' },
  { id: USER_STATUS.FIRED, label: 'Уволен' },
];

const TABS = [
  { id: 'profile', label: 'Профиль' },
  { id: 'wallets', label: 'Кошельки' },
  { id: 'history', label: 'Операции' },
  { id: 'orders', label: 'Заказы' },
  { id: 'passes', label: 'История проходов и дотаций' },
];

/**
 * @param {object} p
 * @param {object|null} p.user null = create mode
 * @param {Array<object>} p.groups
 * @param {Array<object>} p.workShifts
 * @param {Array<object>} p.loyaltyCategories
 * @param {Array<object>} p.allergens
 * @param {() => void|Promise<void>} p.onSaved
 */
export function openUserFormModal({
  user: initialUser,
  groups,
  workShifts = [],
  loyaltyCategories,
  allergens,
  onSaved,
}) {
  document.getElementById('user-form-modal')?.remove();

  let isCreate = !initialUser?.id;
  /** @type {object} */
  let draft = isCreate
    ? {
      name: '',
      email: '',
      phone: '',
      birthDate: '',
      status: USER_STATUS.ACTIVE,
      firedAt: '',
      activeFrom: '',
      activeTo: '',
      userGroupId: '',
      shiftId: DEFAULT_WORK_SHIFT_ID,
      loyaltyCategoryId: '',
      qrCode: generateQrCodeValue(),
      allergens: [],
      allowsWebAccess: true,
      wallets: null,
    }
    : { ...initialUser, allergens: [...(initialUser.allergens || [])] };

  let activeTab = 'profile';
  let saving = false;
  let tabLoading = false;
  /** @type {Array<object>} */
  let walletHistory = [];
  /** @type {Array<object>} */
  let userOrders = [];
  /** @type {Array<object>} */
  let validationLogs = [];
  /** @type {Array<object>} */
  let approachStats = [];
  /** @type {string[]} */
  let historyWalletFilters = [];
  let historyWalletDropdownOpen = false;
  /** @type {Record<string, string>} */
  let qrDataUrls = {};

  const loyaltyById = new Map(loyaltyCategories.map(c => [c.id, c]));

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'user-form-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  function readForm() {
    const root = overlay.querySelector('#ufm-panel');
    if (!root) return;

    draft.name = root.querySelector('[data-field="name"]')?.value.trim() || '';
    draft.email = root.querySelector('[data-field="email"]')?.value.trim() || '';
    draft.phone = root.querySelector('[data-field="phone"]')?.value.trim() || '';
    draft.birthDate = root.querySelector('[data-field="birthDate"]')?.value || '';
    draft.status = root.querySelector('[data-field="status"]')?.value || USER_STATUS.ACTIVE;
    draft.firedAt = root.querySelector('[data-field="firedAt"]')?.value || '';
    draft.activeFrom = root.querySelector('[data-field="activeFrom"]')?.value || '';
    draft.activeTo = root.querySelector('[data-field="activeTo"]')?.value || '';
    draft.userGroupId = root.querySelector('[data-field="userGroupId"]')?.value || '';
    draft.shiftId = root.querySelector('[data-field="shiftId"]')?.value || DEFAULT_WORK_SHIFT_ID;
    draft.loyaltyCategoryId = root.querySelector('[data-field="loyaltyCategoryId"]')?.value || '';
    draft.qrCode = root.querySelector('[data-field="qrCode"]')?.value.trim() || '';
    draft.allowsWebAccess = root.querySelector('[data-field="allowsWebAccess"]')?.checked ?? true;
    draft.allergens = [...root.querySelectorAll('[data-allergen]:checked')].map(el => el.dataset.allergen);
  }

  async function ensureQrUrl(code) {
    if (!code) return '';
    if (qrDataUrls[code]) return qrDataUrls[code];
    try {
      qrDataUrls[code] = await QRCode.toDataURL(code, { width: 140, margin: 1 });
    } catch {
      qrDataUrls[code] = '';
    }
    return qrDataUrls[code];
  }

  async function loadTabData(tab) {
    if (isCreate || !draft.id) return;
    tabLoading = true;
    renderBody();
    try {
      if (tab === 'history') walletHistory = await fetchWalletHistory(draft.id);
      if (tab === 'orders') userOrders = await fetchUserOrders(draft.id);
      if (tab === 'passes') {
        const rules = await fetchAllValidationRules();
        const userRules = rules.filter(r =>
          r.isActive && (!r.targetUserGroupIds.length || r.targetUserGroupIds.includes(draft.userGroupId)),
        );
        [validationLogs, approachStats] = await Promise.all([
          fetchValidationLogs({ userId: draft.id, limitCount: 100 }),
          fetchUserApproachStats(draft.id, userRules, new Date(), draft, workShifts),
        ]);
      }
    } catch (err) {
      showToast(err.message || 'Не удалось загрузить данные');
    } finally {
      tabLoading = false;
      renderBody();
    }
  }

  function renderStatusFields() {
    if (draft.status === USER_STATUS.ACTIVE) {
      return `
        <label class="ufm-field">
          <span class="ufm-label">Активен с</span>
          <input type="date" class="ufm-input" data-field="activeFrom" value="${escAttr(draft.activeFrom || '')}" />
        </label>
        <label class="ufm-field">
          <span class="ufm-label">Активен по</span>
          <input type="date" class="ufm-input" data-field="activeTo" value="${escAttr(draft.activeTo || '')}" />
        </label>
      `;
    }
    if (draft.status === USER_STATUS.FIRED) {
      return `
        <label class="ufm-field">
          <span class="ufm-label">Дата увольнения</span>
          <input type="date" class="ufm-input" data-field="firedAt" value="${escAttr(draft.firedAt || '')}" />
        </label>
      `;
    }
    return '';
  }

  function renderProfileTab() {
    const qrUrl = qrDataUrls[draft.qrCode] || '';
    return `
      <div class="ufm-stack" id="ufm-panel">
        <section class="ufm-section">
          <h3 class="ufm-section-title">Контактные данные</h3>
          <div class="ufm-grid-2">
            <label class="ufm-field">
              <span class="ufm-label">ФИО</span>
              <input type="text" class="ufm-input" data-field="name" value="${escAttr(draft.name)}" placeholder="Иванов Иван Иванович" />
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Email</span>
              <input type="email" class="ufm-input" data-field="email" value="${escAttr(draft.email)}" placeholder="user@example.com" />
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Телефон</span>
              <input type="tel" class="ufm-input" data-field="phone" value="${escAttr(draft.phone)}" placeholder="+7 …" />
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Дата рождения</span>
              <input type="date" class="ufm-input" data-field="birthDate" value="${escAttr(draft.birthDate || '')}" />
            </label>
          </div>
        </section>

        <section class="ufm-section">
          <h3 class="ufm-section-title">Статус</h3>
          <div class="ufm-grid-2">
            <label class="ufm-field">
              <span class="ufm-label">Статус клиента</span>
              <select class="ufm-input" data-field="status">
                ${STATUS_OPTIONS.map(s => `
                  <option value="${s.id}" ${draft.status === s.id ? 'selected' : ''}>${s.label}</option>
                `).join('')}
              </select>
            </label>
            ${renderStatusFields()}
          </div>
        </section>

        <section class="ufm-section">
          <h3 class="ufm-section-title">Настройки CRM</h3>
          <div class="ufm-grid-2">
            <label class="ufm-field">
              <span class="ufm-label">Группа / Организация</span>
              <select class="ufm-input" data-field="userGroupId">
                <option value="">— Не указана —</option>
                ${groups.map(g => `
                  <option value="${escAttr(g.id)}" ${draft.userGroupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>
                `).join('')}
              </select>
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Категория лояльности</span>
              <select class="ufm-input" data-field="loyaltyCategoryId">
                <option value="">— Не указана —</option>
                ${loyaltyCategories.map(c => `
                  <option value="${escAttr(c.id)}" ${draft.loyaltyCategoryId === c.id ? 'selected' : ''}>
                    ${esc(c.name)}${c.discountPercent ? ` (−${c.discountPercent}%)` : ''}
                  </option>
                `).join('')}
              </select>
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Рабочая смена</span>
              <select class="ufm-input" data-field="shiftId">
                ${workShifts.length
                  ? workShifts.map(s => `
                    <option value="${escAttr(s.id)}" ${(draft.shiftId || DEFAULT_WORK_SHIFT_ID) === s.id ? 'selected' : ''}>${esc(s.name)}</option>
                  `).join('')
                  : `<option value="${escAttr(DEFAULT_WORK_SHIFT_ID)}">Стандарт 5/2</option>`}
              </select>
            </label>
          </div>
        </section>

        <section class="ufm-section">
          <h3 class="ufm-section-title">Доступы</h3>
          <label class="avr-active-toggle ufm-web-toggle">
            <input type="checkbox" data-field="allowsWebAccess" ${draft.allowsWebAccess ? 'checked' : ''} />
            <span class="avr-switch"></span>
            <span class="avr-active-label">Разрешить доступ в Личный кабинет</span>
          </label>
          <div class="ufm-access-btns">
            <button type="button" class="ufm-text-btn btn-press" id="ufm-temp-password">Сгенерировать временный пароль</button>
            <button type="button" class="ufm-text-btn btn-press" id="ufm-reset-email">Сбросить пароль</button>
          </div>
        </section>

        <section class="ufm-section">
          <h3 class="ufm-section-title">Идентификация</h3>
          <div class="ufm-id-row">
            <div class="ufm-id-fields">
              <label class="ufm-field">
                <span class="ufm-label">Номер карты питания</span>
                <div class="ufm-input-row">
                  <input type="text" class="ufm-input" data-field="qrCode" value="${escAttr(draft.qrCode)}" placeholder="MEAL-…" />
                  <button type="button" class="btn btn-outline btn-press ufm-gen-btn" id="ufm-gen-qr">Сгенерировать</button>
                </div>
              </label>
            </div>
            <div class="ufm-qr-box" aria-label="QR-код">
              ${qrUrl
                ? `<img src="${qrUrl}" alt="QR-код" class="ufm-qr-img" />`
                : '<span class="ufm-qr-placeholder">QR</span>'}
            </div>
          </div>
        </section>

        <section class="ufm-section">
          <h3 class="ufm-section-title">Аллергены</h3>
          <div class="ufm-allergen-grid">
            ${allergens.length
              ? allergens.map(a => `
                <label class="ufm-allergen-chip">
                  <input type="checkbox" data-allergen="${escAttr(a.id)}" ${draft.allergens?.includes(a.id) ? 'checked' : ''} />
                  <span>${esc(a.name)}</span>
                </label>
              `).join('')
              : '<p class="ufm-muted">Справочник аллергенов пуст</p>'}
          </div>
        </section>

        <p class="ifm-error" id="ufm-error" hidden></p>
      </div>
    `;
  }

  function renderWalletsTab() {
    if (isCreate) {
      return '<p class="ufm-muted ufm-empty">Сохраните профиль, чтобы управлять кошельками</p>';
    }
    const wallets = draft.wallets || {};
    return `
      <div class="ufm-stack">
        <div class="ufm-wallet-grid">
          ${Object.entries(wallets).map(([id, w]) => `
            <article class="ufm-wallet-card card">
              <h4 class="ufm-wallet-name">${esc(w.name)}</h4>
              <p class="ufm-wallet-balance">${fmtMoney(w.balance)}</p>
              ${w.allowedCategories?.length
                ? `<p class="ufm-wallet-meta">Разрешено категорий: ${w.allowedCategories.length}</p>`
                : '<p class="ufm-wallet-meta ufm-muted">Все категории</p>'}
              <div class="ufm-wallet-actions">
                <button type="button" class="btn btn-outline btn-press ufm-wallet-btn" data-wallet-op="${escAttr(id)}" data-op-type="deposit">Пополнить</button>
                <button type="button" class="btn btn-outline btn-press ufm-wallet-btn" data-op-type="withdraw" data-wallet-op="${escAttr(id)}">Списать</button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function historyWalletOptions() {
    const map = new Map();
    Object.entries(draft.wallets || {}).forEach(([id, w]) => {
      map.set(id, w.name || id);
    });
    walletHistory.forEach(h => {
      if (h.walletId && !map.has(h.walletId)) {
        map.set(h.walletId, h.walletName || h.walletId);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }

  function filteredWalletHistory() {
    if (!historyWalletFilters.length) return walletHistory;
    const set = new Set(historyWalletFilters);
    return walletHistory.filter(h => set.has(h.walletId));
  }

  function historyWalletFilterSummary() {
    if (!historyWalletFilters.length) return 'Все кошельки';
    const options = historyWalletOptions();
    if (historyWalletFilters.length === 1) {
      const opt = options.find(o => o.id === historyWalletFilters[0]);
      return opt?.name || '1 кошелёк';
    }
    return `${historyWalletFilters.length} кошелька`;
  }

  function syncHistoryWalletDropdown() {
    const dropdown = overlay.querySelector('#ufm-history-wallet-dropdown');
    const menu = overlay.querySelector('#ufm-history-wallet-menu');
    const trigger = overlay.querySelector('#ufm-history-wallet-trigger');
    if (!dropdown || !menu || !trigger) return;

    dropdown.classList.toggle('orders-status-dropdown--open', historyWalletDropdownOpen);
    menu.hidden = !historyWalletDropdownOpen;
    trigger.setAttribute('aria-expanded', String(historyWalletDropdownOpen));

    const label = trigger.querySelector('.orders-status-trigger-label');
    if (label) label.textContent = historyWalletFilterSummary();

    if (historyWalletDropdownOpen) {
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

  function refreshHistoryTable() {
    const tbody = overlay.querySelector('#ufm-history-tbody');
    const emptyEl = overlay.querySelector('#ufm-history-empty');
    const tableWrap = overlay.querySelector('#ufm-history-table-wrap');
    if (!tbody) return;

    const rows = filteredWalletHistory();
    if (emptyEl) emptyEl.hidden = rows.length > 0;
    if (tableWrap) tableWrap.hidden = rows.length === 0;
    tbody.innerHTML = rows.map(h => renderHistoryRow(h)).join('');
    syncHistoryWalletDropdown();
  }

  function renderHistoryRow(h) {
    return `
      <tr>
        <td class="ufm-td-date">${fmtOrderDateCell(h.createdAt)}</td>
        <td>${esc(h.walletName || h.walletId)}</td>
        <td><span class="crm-op ${walletOpClass(h.type)}">${walletOpLabel(h.type)}</span></td>
        <td class="ufm-th-num">${walletOpSign(h.type)}${fmtMoney(h.amount)}</td>
        <td>${esc(h.comment || '—')}</td>
        <td>${esc(h.performedBy || '—')}</td>
      </tr>
    `;
  }

  function renderHistoryWalletDropdown() {
    const options = historyWalletOptions();
    return `
      <div class="orders-filter-inline ufm-history-filter">
        <span class="orders-filter-label">Кошелёк</span>
        <div class="orders-status-dropdown ${historyWalletDropdownOpen ? 'orders-status-dropdown--open' : ''}" id="ufm-history-wallet-dropdown">
          <button type="button" class="orders-status-trigger btn-press" id="ufm-history-wallet-trigger" aria-expanded="${historyWalletDropdownOpen}">
            <span class="orders-status-trigger-label">${esc(historyWalletFilterSummary())}</span>
            <span class="orders-status-trigger-caret">▾</span>
          </button>
          <div class="orders-status-menu" id="ufm-history-wallet-menu" ${historyWalletDropdownOpen ? '' : 'hidden'}>
            ${options.map(w => `
              <label class="orders-status-option">
                <input type="checkbox" data-history-wallet-filter="${escAttr(w.id)}" ${historyWalletFilters.includes(w.id) ? 'checked' : ''} />
                <span>${esc(w.name)}</span>
              </label>
            `).join('')}
            <div class="orders-status-menu-foot">
              <button type="button" class="orders-status-reset btn-press" data-history-wallet-action="clear">Сбросить</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderHistoryTab() {
    if (isCreate) return '<p class="ufm-muted ufm-empty">Нет операций</p>';
    if (tabLoading) return '<div class="admin-loading">Загрузка операций…</div>';
    if (!walletHistory.length) return '<p class="ufm-muted ufm-empty">Операций по кошелькам пока нет</p>';

    const rows = filteredWalletHistory();
    return `
      <div class="ufm-history-panel">
        <div class="ufm-history-toolbar">
          ${renderHistoryWalletDropdown()}
        </div>
        <p class="ufm-muted ufm-empty" id="ufm-history-empty" ${rows.length ? 'hidden' : ''}>Нет операций по выбранным кошелькам</p>
        <div class="ufm-table-wrap" id="ufm-history-table-wrap" ${rows.length ? '' : 'hidden'}>
          <table class="ufm-table">
            <thead>
              <tr>
                <th class="ufm-th-date">Дата</th>
                <th>Кошелёк</th>
                <th>Действие</th>
                <th class="ufm-th-num">Сумма</th>
                <th>Комментарий</th>
                <th>Оператор</th>
              </tr>
            </thead>
            <tbody id="ufm-history-tbody">
              ${rows.map(h => renderHistoryRow(h)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderPassesTab() {
    if (isCreate) return '<p class="ufm-muted ufm-empty">Нет проходов</p>';
    if (tabLoading) return '<div class="admin-loading">Загрузка проходов…</div>';

    const statsHtml = approachStats.length
      ? `<div class="ufm-passes-stats">
          ${approachStats.map(s => `
            <div class="ufm-passes-stat">
              <div class="ufm-passes-stat__label">${esc(s.ruleName)}</div>
              <div class="ufm-passes-stat__value">${s.remaining} / ${s.limit}</div>
              <div class="ufm-muted">осталось сегодня</div>
            </div>
          `).join('')}
        </div>`
      : '<p class="ufm-muted">Нет активных лимитов для группы клиента</p>';

    if (!validationLogs.length) {
      return `${statsHtml}<p class="ufm-muted ufm-empty">Проходов по пропуску пока нет</p>`;
    }

    return `
      ${statsHtml}
      <div class="ufm-table-wrap">
        <table class="ufm-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Точка</th>
              <th>Правило</th>
              <th>Статус</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            ${validationLogs.map(log => {
              const ok = log.status === 'success';
              return `
                <tr>
                  <td>${fmtOrderDateTime(log.createdAt)}</td>
                  <td>${esc(log.channelPoint || '—')}</td>
                  <td>${esc(log.ruleName || '—')}</td>
                  <td><span class="vld-log-status ${ok ? 'vld-log-status--success' : 'vld-log-status--denied'}">${ok ? 'Успешно' : 'Отказ'}</span></td>
                  <td>${esc(ok ? (log.deductionSummary || '—') : (log.denyReason || '—'))}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderOrdersTab() {
    if (isCreate) return '<p class="ufm-muted ufm-empty">Нет заказов</p>';
    if (tabLoading) return '<div class="admin-loading">Загрузка заказов…</div>';
    if (!userOrders.length) return '<p class="ufm-muted ufm-empty">Заказов у клиента пока нет</p>';

    return `
      <div class="ufm-table-wrap">
        <table class="ufm-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Состав</th>
              <th class="ufm-th-num">Сумма</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${userOrders.map(o => `
              <tr>
                <td><strong>${esc(o.orderNumber || '—')}</strong></td>
                <td>${fmtOrderDateTime(o.createdAt)}</td>
                <td class="ufm-order-items">${esc(briefOrderItems(o.items))}</td>
                <td class="ufm-th-num">${fmtMoney(orderTotal(o.items))}</td>
                <td><span class="badge ${orderStatusBadgeClass(o.status)}">${orderStatusLabel(o.status)}</span></td>
                <td>
                  <button type="button" class="btn btn-outline btn-press ufm-order-btn" data-order-id="${escAttr(o.id)}">Подробнее</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBody() {
    const body = overlay.querySelector('#ufm-body');
    if (!body) return;

    const content = activeTab === 'profile'
      ? renderProfileTab()
      : activeTab === 'wallets'
        ? renderWalletsTab()
        : activeTab === 'history'
          ? renderHistoryTab()
          : activeTab === 'passes'
            ? renderPassesTab()
            : renderOrdersTab();

    body.innerHTML = content;

    if (activeTab === 'history') syncHistoryWalletDropdown();

    if (activeTab === 'profile' && draft.qrCode) {
      ensureQrUrl(draft.qrCode).then(() => {
        const box = overlay.querySelector('.ufm-qr-box');
        const url = qrDataUrls[draft.qrCode];
        if (box && url) {
          box.innerHTML = `<img src="${url}" alt="QR-код" class="ufm-qr-img" />`;
        }
      });
    }
  }

  function renderShell() {
    overlay.innerHTML = `
      <div class="admin-modal card crm-user-modal">
        <div class="admin-modal-head">
          <div>
            <h2 class="admin-modal-title">${isCreate ? 'Новый пользователь' : esc(draft.name || 'Клиент')}</h2>
            ${!isCreate && draft.email ? `<p class="ufm-subtitle">${esc(draft.email)}</p>` : ''}
          </div>
          <button type="button" class="admin-modal-close btn-press" id="ufm-close">✕</button>
        </div>

        <nav class="crm-tabs ufm-tabs" role="tablist">
          ${TABS.map(t => `
            <button type="button" class="crm-tab btn-press ${activeTab === t.id ? 'crm-tab--active' : ''}" data-tab="${t.id}" role="tab" aria-selected="${activeTab === t.id}" ${isCreate && t.id !== 'profile' ? 'disabled' : ''}>${t.label}</button>
          `).join('')}
        </nav>

        <div class="admin-modal-body ufm-body-wrap" id="ufm-body"></div>

        <div class="admin-modal-foot ufm-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="ufm-close-2">Закрыть</button>
          ${activeTab === 'profile' ? `
            <button type="button" class="action-btn action-btn-primary btn-press" id="ufm-save" ${saving ? 'disabled' : ''}>
              ${saving ? 'Сохранение…' : isCreate ? 'Создать' : 'Сохранить'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
    renderBody();
    updateFooterSaveBtn();
  }

  function showError(msg) {
    const el = overlay.querySelector('#ufm-error');
    if (!el) {
      showToast(msg);
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  async function save() {
    readForm();
    if (!draft.name.trim()) {
      showError('Укажите ФИО');
      return;
    }
    if (!draft.email.trim()) {
      showError('Укажите email');
      return;
    }
    if (draft.status === USER_STATUS.FIRED && !draft.firedAt) {
      showError('Укажите дату увольнения');
      return;
    }

    saving = true;
    overlay.querySelector('#ufm-save').disabled = true;
    overlay.querySelector('#ufm-save').textContent = 'Сохранение…';

    const payload = {
      name: draft.name.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim() || null,
      birthDate: draft.birthDate || null,
      status: draft.status,
      firedAt: draft.status === USER_STATUS.FIRED ? (draft.firedAt || null) : null,
      activeFrom: draft.status === USER_STATUS.ACTIVE ? (draft.activeFrom || null) : null,
      activeTo: draft.status === USER_STATUS.ACTIVE ? (draft.activeTo || null) : null,
      userGroupId: draft.userGroupId || null,
      shiftId: draft.shiftId || DEFAULT_WORK_SHIFT_ID,
      loyaltyCategoryId: draft.loyaltyCategoryId || null,
      qrCode: draft.qrCode,
      allergens: draft.allergens,
      allowsWebAccess: draft.allowsWebAccess,
    };

    try {
      if (isCreate) {
        const created = await createCrmUser(payload);
        draft = { ...created, allergens: [...(created.allergens || [])] };
        isCreate = false;
        showToast('Пользователь создан');
      } else {
        await updateCrmUser(draft.id, payload);
        showToast('Изменения сохранены');
      }
      await onSaved?.();
      renderShell();
    } catch (err) {
      showError(err.message || 'Не удалось сохранить');
    } finally {
      saving = false;
      const btn = overlay.querySelector('#ufm-save');
      if (btn) {
        btn.disabled = false;
        btn.textContent = isCreate && !draft.id ? 'Создать' : 'Сохранить';
      }
    }
  }

  function showTempPasswordModal(password) {
    const pwOverlay = document.createElement('div');
    pwOverlay.className = 'admin-modal-overlay';
    pwOverlay.style.zIndex = '1001';
    pwOverlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Временный пароль</h2>
          <button type="button" class="admin-modal-close btn-press" data-close>✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="ufm-muted">Передайте пароль клиенту. Для применения используйте Firebase Console или «Сбросить пароль».</p>
          <div class="crm-temp-password-box">
            <code>${esc(password)}</code>
            <button type="button" class="btn btn-outline btn-press" id="ufm-copy-pw">Копировать</button>
          </div>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="action-btn action-btn-primary btn-press" data-close>Готово</button>
        </div>
      </div>
    `;
    document.body.appendChild(pwOverlay);
    pwOverlay.addEventListener('click', (e) => {
      if (e.target === pwOverlay || e.target.closest('[data-close]')) pwOverlay.remove();
    });
    pwOverlay.querySelector('#ufm-copy-pw')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(password);
      showToast('Пароль скопирован');
    });
  }

  function handleOverlayClick(e) {
    if (e.target === overlay) {
      close();
      return;
    }

    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && overlay.contains(tabBtn)) {
      if (tabBtn.disabled) return;
      readForm();
      const tab = tabBtn.dataset.tab;
      if (tab === activeTab) return;
      if (activeTab === 'history') historyWalletDropdownOpen = false;
      activeTab = tab;
      overlay.querySelectorAll('[data-tab]').forEach(b => {
        b.classList.toggle('crm-tab--active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      });
      if (tab === 'history' || tab === 'orders' || tab === 'passes') loadTabData(tab);
      else renderBody();
      updateFooterSaveBtn();
      return;
    }

    if (e.target.closest('#ufm-save')) {
      save();
      return;
    }

    if (e.target.closest('#ufm-close') || e.target.closest('#ufm-close-2')) {
      close();
      return;
    }

    handleBodyClick(e);
  }

  function updateFooterSaveBtn() {
    const foot = overlay.querySelector('.ufm-foot');
    if (!foot) return;
    const saveBtn = foot.querySelector('#ufm-save');
    if (activeTab === 'profile' && !saveBtn) {
      foot.insertAdjacentHTML('beforeend', `
        <button type="button" class="action-btn action-btn-primary btn-press" id="ufm-save">Сохранить</button>
      `);
      overlay.querySelector('#ufm-save')?.addEventListener('click', save);
    } else if (activeTab !== 'profile' && saveBtn) {
      saveBtn.remove();
    }
  }

  function handleBodyClick(e) {
    const body = overlay.querySelector('#ufm-body');
    if (!body?.contains(e.target)) return;

    if (e.target.closest('#ufm-history-wallet-trigger')) {
      e.stopPropagation();
      historyWalletDropdownOpen = !historyWalletDropdownOpen;
      syncHistoryWalletDropdown();
      return;
    }

    if (e.target.closest('[data-history-wallet-action="clear"]')) {
      historyWalletFilters = [];
      refreshHistoryTable();
      return;
    }

    if (e.target.closest('#ufm-gen-qr')) {
      draft.qrCode = generateQrCodeValue();
      const input = overlay.querySelector('[data-field="qrCode"]');
      if (input) input.value = draft.qrCode;
      ensureQrUrl(draft.qrCode).then(renderBody);
      return;
    }

    if (e.target.closest('#ufm-temp-password')) {
      showTempPasswordModal(generateTempPassword());
      return;
    }

    if (e.target.closest('#ufm-reset-email')) {
      readForm();
      if (!draft.email) {
        showToast('Укажите email');
        return;
      }
      sendUserPasswordReset(draft.email)
        .then(() => showToast('Письмо для сброса пароля отправлено'))
        .catch(err => showToast(err.message || 'Не удалось отправить письмо'));
      return;
    }

    const walletBtn = e.target.closest('[data-wallet-op]');
    if (walletBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!draft.id) {
        showToast('Сначала сохраните профиль');
        return;
      }
      const walletId = walletBtn.dataset.walletOp;
      const type = walletBtn.dataset.opType;
      const wallet = draft.wallets?.[walletId];
      if (!wallet) return;

      openWalletOperationModal({
        userName: draft.name,
        walletId,
        walletName: wallet.name,
        currentBalance: wallet.balance,
        presetType: type,
        onSubmit: async ({ type: opType, amount, comment }) => {
          await adjustWalletBalance({
            userId: draft.id,
            walletId,
            type: opType,
            amount,
            comment,
            performedBy: auth.currentUser?.email || 'Админ',
          });
          await onSaved?.();
          const updated = (await fetchCrmUsers()).find(u => u.id === draft.id);
          if (updated) draft = { ...updated, allergens: [...(updated.allergens || [])] };
          if (activeTab === 'history') await loadTabData('history');
          else renderBody();
        },
      });
      return;
    }

    const orderBtn = e.target.closest('.ufm-order-btn[data-order-id]');
    if (orderBtn) {
      e.preventDefault();
      e.stopPropagation();
      const order = userOrders.find(o => o.id === orderBtn.dataset.orderId);
      if (!order) return;
      openOrderDetailModal({
        order,
        user: { name: draft.name, email: draft.email },
      });
    }
  }

  function handleBodyChange(e) {
    const body = overlay.querySelector('#ufm-body');
    if (!body?.contains(e.target)) return;

    const walletCb = e.target.closest('[data-history-wallet-filter]');
    if (walletCb) {
      const id = walletCb.dataset.historyWalletFilter;
      if (walletCb.checked) {
        if (!historyWalletFilters.includes(id)) historyWalletFilters.push(id);
      } else {
        historyWalletFilters = historyWalletFilters.filter(x => x !== id);
      }
      refreshHistoryTable();
      return;
    }

    if (e.target.matches('[data-field="status"]')) {
      draft.status = e.target.value;
      if (draft.status === USER_STATUS.FIRED && !draft.firedAt) {
        draft.firedAt = new Date().toISOString().slice(0, 10);
      }
      renderBody();
    }
  }

  function handleDropdownOutside(e) {
    if (!historyWalletDropdownOpen) return;
    if (overlay.querySelector('#ufm-history-wallet-dropdown')?.contains(e.target)) return;
    if (overlay.querySelector('#ufm-history-wallet-menu')?.contains(e.target)) return;
    historyWalletDropdownOpen = false;
    syncHistoryWalletDropdown();
  }

  function close() {
    overlay.removeEventListener('click', handleOverlayClick);
    overlay.removeEventListener('change', handleBodyChange);
    document.removeEventListener('click', handleDropdownOutside);
    document.getElementById('order-detail-modal')?.remove();
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', handleOverlayClick);
  overlay.addEventListener('change', handleBodyChange);
  document.addEventListener('click', handleDropdownOutside);
  document.addEventListener('keydown', onKey);

  renderShell();
  document.body.appendChild(overlay);

  return { close };
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
