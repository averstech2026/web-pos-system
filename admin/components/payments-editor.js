import {
  savePaymentMethod,
  deletePaymentMethod,
  paymentMethodMeta,
} from '../services/payments-data.js';
import { RECEIPT_TYPE, PAYMENT_CURRENCY } from '../../shared/schema.js';
import { showToast } from '../utils/toast.js';
import { renderAvrCancelButton, runWithUnsavedGuard } from '../utils/avr-unsaved-changes.js';

const CURRENCY_OPTIONS = [
  { value: PAYMENT_CURRENCY.RUB, label: 'Рубль (₽)' },
];

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
    const receiptType = panel.querySelector('[data-field="receipt-type"]:checked')?.value
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

  function renderCategoryRestrictions(method) {
    if (!categoryGroups.length) {
      return '<p class="ufm-muted">Справочник категорий товаров пуст.</p>';
    }
    return `
      <fieldset class="ifm-fieldset">
        <legend>Разрешённые категории товаров</legend>
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
      </fieldset>
    `;
  }

  function renderUserGroupRestrictions(method) {
    if (!userGroups.length) {
      return '<p class="ufm-muted">Группы клиентов не найдены.</p>';
    }
    return `
      <fieldset class="ifm-fieldset">
        <legend>Доступно для групп клиентов</legend>
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
      </fieldset>
    `;
  }

  function renderReceiptTypeTabs(method) {
    const fiscalActive = method.receiptType !== RECEIPT_TYPE.NON_FISCAL;
    return `
      <div class="pay-method-field">
        <span class="cgr-detail-label">Тип чека</span>
        <div class="pay-method-tabs" role="radiogroup" aria-label="Тип чека">
          <label class="pay-method-tab ${fiscalActive ? 'pay-method-tab--active' : ''}">
            <input
              type="radio"
              name="pay-receipt-type"
              value="${RECEIPT_TYPE.FISCAL}"
              data-field="receipt-type"
              ${fiscalActive ? 'checked' : ''}
            />
            <span>Фискальный платеж</span>
          </label>
          <label class="pay-method-tab ${!fiscalActive ? 'pay-method-tab--active' : ''}">
            <input
              type="radio"
              name="pay-receipt-type"
              value="${RECEIPT_TYPE.NON_FISCAL}"
              data-field="receipt-type"
              ${!fiscalActive ? 'checked' : ''}
            />
            <span>Не фискальный платеж</span>
          </label>
        </div>
      </div>
    `;
  }

  function renderDetail(method) {
    return `
      <div class="avr-detail-panel" id="pay-detail-panel">
        <div class="avr-detail-scroll">
          <section class="cgr-detail-card">
            <label class="cgr-detail-name-field cgr-detail-name-field--solo">
              <span class="cgr-detail-label">Название</span>
              <input
                type="text"
                class="cgr-detail-name-input"
                data-field="name"
                value="${escAttr(method.name)}"
                maxlength="80"
                placeholder="Наличные"
              />
            </label>
            <label class="cgr-detail-name-field cgr-detail-name-field--solo">
              <span class="cgr-detail-label">Размерность</span>
              <select class="avr-select" data-field="currency">
                ${CURRENCY_OPTIONS.map(opt => `
                  <option value="${escAttr(opt.value)}" ${method.currency === opt.value ? 'selected' : ''}>
                    ${esc(opt.label)}
                  </option>
                `).join('')}
              </select>
            </label>
            ${renderReceiptTypeTabs(method)}
            ${renderCategoryRestrictions(method)}
            ${renderUserGroupRestrictions(method)}
            <p class="alr-detail-id">ID: <code>${esc(method.id)}</code></p>
          </section>
          <p class="ifm-error" id="pay-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row">
            <div class="cgr-detail-danger">
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
            <div class="footer-action-bar">
              ${renderAvrCancelButton('pay-cancel')}
              <button
                type="button"
                class="action-btn action-btn-primary btn-press"
                id="pay-save"
                ${saving ? 'disabled' : ''}
              >
                ${saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
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

  function updateReceiptTabs() {
    const panel = host.querySelector('#pay-detail-panel');
    if (!panel) return;
    panel.querySelectorAll('.pay-method-tab').forEach(tab => {
      const input = tab.querySelector('input[type="radio"]');
      tab.classList.toggle('pay-method-tab--active', input?.checked ?? false);
    });
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
    host.querySelector('#pay-detail-panel')?.addEventListener('change', e => {
      if (e.target.matches('[data-category], [data-user-group], [data-field="currency"]')) {
        syncPanel();
      }
      if (e.target.matches('[data-field="receipt-type"]')) {
        syncPanel();
        updateReceiptTabs();
      }
    });

    host.querySelector('#pay-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#pay-delete');
      if (btn) btn.disabled = !e.target.checked;
    });

    host.querySelector('#pay-save')?.addEventListener('click', persistCurrent);
    host.querySelector('#pay-cancel')?.addEventListener('click', () => {
      if (!isDirty()) return;
      discardChanges();
      render();
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
