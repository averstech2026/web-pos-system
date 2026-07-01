import {
  savePaymentMethod,
  deletePaymentMethod,
  paymentMethodMeta,
} from '../services/payments-data.js';
import { RECEIPT_TYPE, PAYMENT_CURRENCY } from '../../shared/schema.js';
import { showToast } from '../utils/toast.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

const CURRENCY_OPTIONS = [
  { value: PAYMENT_CURRENCY.RUB, label: 'Рубль (₽)' },
];

const RECEIPT_TYPE_OPTIONS = [
  { id: RECEIPT_TYPE.FISCAL, label: 'Фискальный платеж' },
  { id: RECEIPT_TYPE.NON_FISCAL, label: 'Не фискальный платеж' },
];

const CHIP_SELECT_ICON = `<svg class="pay-restrictions-chip-btn__icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`;

const CHIP_DESELECT_ICON = `<svg class="pay-restrictions-chip-btn__icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6M15 9l-6 6"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.paymentMethods
 * @param {Array<{ id: string, name: string }>} p.categoryGroups
 * @param {Array<{ id: string, name: string }>} p.userGroups
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createPaymentsEditor(host, {
  paymentMethods: initialMethods,
  categoryGroups,
  userGroups,
  onSaved,
}) {
  /** @type {Array<object>} */
  let methods = initialMethods.map(m => ({ ...m }));
  /** @type {string|null} */
  let selectedId = methods[0]?.id || null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(methods.map(m => ({
      ...m,
      allowedCategories: [...(m.allowedCategories || [])],
      allowedUserGroups: [...(m.allowedUserGroups || [])],
    })).sort((a, b) => a.id.localeCompare(b.id)));
  }

  function commitBaseline() {
    syncPanel();
    baselineJson = snapshot();
  }

  function isDirty() {
    syncPanel();
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    methods = JSON.parse(baselineJson);
    if (selectedId && !methods.some(m => m.id === selectedId)) {
      selectedId = methods[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedMethod() {
    return methods.find(m => m.id === selectedId) || null;
  }

  function syncPanel() {
    const panel = host.querySelector('#pay-detail-panel');
    if (!selectedId || !panel) return;

    const allowedCategories = [...panel.querySelectorAll('[data-category]:checked')]
      .map(el => el.dataset.category);
    const allowedUserGroups = [...panel.querySelectorAll('[data-user-group]:checked')]
      .map(el => el.dataset.userGroup);
    const receiptType = panel.querySelector('[data-receipt-type].period-tab--active')?.dataset.receiptType
      || RECEIPT_TYPE.FISCAL;

    methods = methods.map(m => (
      m.id === selectedId
        ? {
          ...m,
          name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
          currency: panel.querySelector('[data-field="currency"]')?.value || PAYMENT_CURRENCY.RUB,
          receiptType,
          allowedCategories,
          allowedUserGroups,
        }
        : m
    ));
    updateListRowMeta(selectedId);
  }

  function updateListRowMeta(id) {
    if (!id) return;
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id)}"]`);
    const method = methods.find(m => m.id === id);
    if (!row || !method) return;

    const nameEl = row.querySelector('.avr-row-name');
    if (nameEl) nameEl.textContent = method.name;

    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.textContent = paymentMethodMeta(method);
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `payment_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (methods.some(m => m.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function rowIcon(id) {
    if (id === 'cash') return '💵';
    if (id === 'card') return '💳';
    if (id === 'internal') return '🔄';
    return '💰';
  }

  function renderRow(method) {
    const active = method.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(method.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">${rowIcon(method.id)}</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(method.name)}</span>
            <span class="avr-row-meta">${esc(paymentMethodMeta(method))}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderRestrictionsBox(title, selectAction, deselectAction, contentHtml) {
    return `
      <div class="pay-restrictions-box">
        <span class="pay-restrictions-box__title">${esc(title)}</span>
        <div class="pay-restrictions-box__toolbar">
          <button type="button" class="pay-restrictions-chip-btn pay-restrictions-chip-btn--select btn-press" data-action="${escAttr(selectAction)}">
            ${CHIP_SELECT_ICON}
            <span>Выбрать все</span>
          </button>
          <button type="button" class="pay-restrictions-chip-btn pay-restrictions-chip-btn--deselect btn-press" data-action="${escAttr(deselectAction)}">
            ${CHIP_DESELECT_ICON}
            <span>Снять все</span>
          </button>
        </div>
        ${contentHtml}
      </div>
    `;
  }

  function setCategorySelection(ids) {
    if (!selectedId) return;
    syncPanel();
    const idSet = new Set(ids);
    methods = methods.map(m => (
      m.id === selectedId ? { ...m, allowedCategories: [...ids] } : m
    ));
    host.querySelectorAll('#pay-detail-panel [data-category]').forEach(cb => {
      cb.checked = idSet.has(cb.dataset.category);
    });
    updateListRowMeta(selectedId);
  }

  function setUserGroupSelection(ids) {
    if (!selectedId) return;
    syncPanel();
    const idSet = new Set(ids);
    methods = methods.map(m => (
      m.id === selectedId ? { ...m, allowedUserGroups: [...ids] } : m
    ));
    host.querySelectorAll('#pay-detail-panel [data-user-group]').forEach(cb => {
      cb.checked = idSet.has(cb.dataset.userGroup);
    });
    updateListRowMeta(selectedId);
  }

  function renderCategoryRestrictions(method) {
    if (!categoryGroups.length) {
      return '<p class="ufm-muted">Справочник категорий товаров пуст.</p>';
    }
    return renderRestrictionsBox(
      'Разрешённые категории товаров',
      'select-all-categories',
      'deselect-all-categories',
      `
        <div class="wallet-restrictions-grid">
          ${categoryGroups.map(cat => `
            <label class="ifm-allergen bulk-allergen-tag">
              <input
                type="checkbox"
                data-category="${escAttr(cat.id)}"
                ${method.allowedCategories?.includes(cat.id) ? 'checked' : ''}
              />
              <span>${esc(cat.name)}</span>
            </label>
          `).join('')}
        </div>
      `,
    );
  }

  function renderUserGroupRestrictions(method) {
    if (!userGroups.length) {
      return '<p class="ufm-muted">Группы клиентов не найдены.</p>';
    }
    return renderRestrictionsBox(
      'Доступно для групп клиентов',
      'select-all-user-groups',
      'deselect-all-user-groups',
      `
        <div class="wallet-restrictions-grid">
          ${userGroups.map(group => `
            <label class="ifm-allergen bulk-allergen-tag">
              <input
                type="checkbox"
                data-user-group="${escAttr(group.id)}"
                ${method.allowedUserGroups?.includes(group.id) ? 'checked' : ''}
              />
              <span>${esc(group.name)}</span>
            </label>
          `).join('')}
        </div>
      `,
    );
  }

  function renderReceiptTypeField(method) {
    const receiptType = method.receiptType === RECEIPT_TYPE.NON_FISCAL
      ? RECEIPT_TYPE.NON_FISCAL
      : RECEIPT_TYPE.FISCAL;

    return `
      <div class="admin-field-block" id="pay-receipt-type-section">
        <span class="admin-field-label">Тип чека</span>
        <div class="admin-channel-tabs-wrap">
          <div class="period-tabs admin-channel-tabs admin-channel-tabs--h10 admin-channel-tabs--avail" role="radiogroup" aria-label="Тип чека">
            ${RECEIPT_TYPE_OPTIONS.map(o => `
              <button
                type="button"
                class="period-tab btn-press ${receiptType === o.id ? 'period-tab--active' : ''}"
                data-receipt-type="${escAttr(o.id)}"
                role="radio"
                aria-checked="${receiptType === o.id}"
              >${esc(o.label)}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderDetail(method) {
    return `
      <div class="avr-detail-panel" id="pay-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование способа оплаты',
          cancelId: 'pay-cancel',
          saveId: 'pay-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="pay-name">Название</label>
              <input
                id="pay-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(method.name)}"
                maxlength="80"
                placeholder="Наличные"
              />
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="pay-currency">Размерность</label>
              <select id="pay-currency" class="admin-field-input" data-field="currency">
                ${CURRENCY_OPTIONS.map(opt => `
                  <option value="${escAttr(opt.value)}" ${method.currency === opt.value ? 'selected' : ''}>
                    ${esc(opt.label)}
                  </option>
                `).join('')}
              </select>
            </div>
            ${renderReceiptTypeField(method)}
            ${renderCategoryRestrictions(method)}
            ${renderUserGroupRestrictions(method)}
            <p class="alr-detail-id">ID: <code>${esc(method.id)}</code></p>
          </div>
          <p class="ifm-error" id="pay-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="pay-delete-confirm" />
                <span>Подтверждаю удаление способа оплаты</span>
              </label>
              <button
                type="button"
                class="action-btn action-btn-danger btn-press cgr-detail-delete"
                id="pay-delete"
                disabled
              >
                Удалить способ
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function render() {
    const method = selectedMethod();
    host.innerHTML = `
      <div class="payments-page-inner">
        <div class="avr-layout alr-layout">
          <div class="avr-master">
            <div class="avr-master-head">
              <h2 class="avr-master-title">Способы оплаты (${methods.length})</h2>
              <button type="button" class="btn btn-primary btn-press products-create-btn" id="pay-create">
                + Добавить
              </button>
            </div>
            <ul class="avr-list" id="pay-list">${methods.map(renderRow).join('')}</ul>
            ${!methods.length ? '<p class="avr-list-empty">Нет способов оплаты. Создайте первый.</p>' : ''}
          </div>
          <aside class="avr-detail">
            ${method
              ? renderDetail(method)
              : `<div class="avr-detail-empty"><p class="avr-detail-empty-title">Выберите способ оплаты</p></div>`}
          </aside>
        </div>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#pay-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const method = selectedMethod();
    if (!method?.name?.trim()) {
      showError('Укажите название способа оплаты');
      return false;
    }
    saving = true;
    render();
    try {
      await savePaymentMethod(method);
      commitBaseline();
      showToast('Способ оплаты сохранён');
      await onSaved?.();
      return true;
    } catch (err) {
      showError(err.message || 'Не удалось сохранить');
      return false;
    } finally {
      saving = false;
      render();
    }
  }

  function bind() {
    host.querySelector('#pay-create')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          const id = uniqueId('Новый способ');
          methods.push({
            id,
            name: 'Новый способ',
            currency: PAYMENT_CURRENCY.RUB,
            receiptType: RECEIPT_TYPE.FISCAL,
            allowedCategories: [],
            allowedUserGroups: [],
          });
          selectedId = id;
          render();
        },
      });
    });

    host.querySelector('#pay-list')?.addEventListener('click', e => {
      const row = e.target.closest('[data-id]');
      if (!row || !e.target.closest('[data-action="select"]')) return;
      const id = row.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    host.querySelector('#pay-detail-panel')?.addEventListener('input', () => syncPanel());
    host.querySelector('#pay-detail-panel')?.addEventListener('click', e => {
      const bulkBtn = e.target.closest('[data-action]');
      if (bulkBtn && selectedId) {
        const action = bulkBtn.dataset.action;
        if (action === 'select-all-categories') {
          e.preventDefault();
          setCategorySelection(categoryGroups.map(c => c.id));
          return;
        }
        if (action === 'deselect-all-categories') {
          e.preventDefault();
          setCategorySelection([]);
          return;
        }
        if (action === 'select-all-user-groups') {
          e.preventDefault();
          setUserGroupSelection(userGroups.map(g => g.id));
          return;
        }
        if (action === 'deselect-all-user-groups') {
          e.preventDefault();
          setUserGroupSelection([]);
          return;
        }
      }

      const receiptBtn = e.target.closest('[data-receipt-type]');
      if (!receiptBtn || !selectedId) return;
      e.preventDefault();
      const panel = host.querySelector('#pay-detail-panel');
      panel?.querySelectorAll('[data-receipt-type]').forEach(btn => {
        const active = btn === receiptBtn;
        btn.classList.toggle('period-tab--active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      syncPanel();
    });
    host.querySelector('#pay-detail-panel')?.addEventListener('change', e => {
      if (e.target.matches('[data-category], [data-user-group], [data-field="currency"]')) {
        syncPanel();
      }
    });

    host.querySelector('#pay-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#pay-delete');
      if (btn) btn.disabled = !e.target.checked;
    });

    host.querySelector('#pay-save')?.addEventListener('click', persistCurrent);
    bindAvrDetailCancel(host, 'pay-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });

    host.querySelector('#pay-delete')?.addEventListener('click', async () => {
      const method = selectedMethod();
      if (!method) return;
      saving = true;
      render();
      try {
        await deletePaymentMethod(method.id);
        methods = methods.filter(m => m.id !== method.id);
        selectedId = methods[0]?.id || null;
        commitBaseline();
        saving = false;
        showToast('Способ оплаты удалён');
        await onSaved?.();
      } catch (err) {
        saving = false;
        render();
        showError(err.message || 'Не удалось удалить');
      }
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
    isDirty,
  };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
