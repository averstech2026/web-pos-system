import {
  formatLunchPrice,
  lunchMetaLabel,
  normalizeCompositeLunch,
  parseLunchPrice,
  resolveStepItemNames,
} from '../../shared/composite-meals.js';
import { formatAvailabilityRuleShort } from '../../shared/availability-rules.js';
import { channelFlagsFromMode, resolveChannelMode } from '../services/products-data.js';
import { deleteLunch, saveLunch } from '../services/lunches-data.js';
import { openLunchStepProductsPickerModal } from './lunch-step-products-picker-modal.js';
import { showToast } from '../utils/toast.js';
import { productThumbHtml } from '../utils/product-image.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';
import { readModifierGroupIds, renderModifierGroupsField } from './modifier-groups-field.js';

const REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

const LUNCH_SALES_POINT_MODES = [
  { id: 'everywhere', label: 'Везде' },
  { id: 'kiosk', label: 'Киоск' },
  { id: 'web', label: 'Веб' },
  { id: 'hidden', label: 'Нигде' },
];

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/composite-meals.js').CompositeLunchItem[]} p.lunches
 * @param {Array<{ id: string, name?: string, category?: string }>} p.catalogItems
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {Array<{ id: string, name: string }>} p.paymentMethods
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} [p.modifierGroups]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createLunchesEditor(host, {
  lunches: initialLunches,
  catalogItems,
  availabilityRules,
  paymentMethods,
  modifierGroups = [],
  onSaved,
}) {
  /** @type {import('../../shared/composite-meals.js').CompositeLunchItem[]} */
  let lunches = initialLunches.map(l => normalizeCompositeLunch({
    ...l,
    lunchSteps: (l.lunchSteps || []).map(s => ({ ...s, itemIds: [...(s.itemIds || [])] })),
    allowedPaymentMethods: [...(l.allowedPaymentMethods || [])],
  }));
  /** @type {string|null} */
  let selectedId = lunches[0]?.id || null;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(
      lunches.map(l => normalizeCompositeLunch(l)).sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  function commitBaseline() {
    syncPanelToState();
    baselineJson = snapshot();
  }

  function isDirty() {
    syncPanelToState();
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    lunches = JSON.parse(baselineJson);
    if (selectedId && !lunches.some(l => l.id === selectedId)) {
      selectedId = lunches[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedLunch() {
    return lunches.find(l => l.id === selectedId) || null;
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `lunch_${Date.now()}`;
  }

  function uniqueStepId(lunch, name) {
    const existing = new Set((lunch.lunchSteps || []).map(s => s.id));
    let id = slugify(name);
    let n = 1;
    while (existing.has(id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function syncPanelToState() {
    const panel = host.querySelector('#lnc-detail-panel');
    if (!selectedId || !panel) return;

    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const price = parseLunchPrice(panel.querySelector('[data-field="price"]')?.value);
    const channelMode = panel.querySelector('[data-lnc-channel-mode].period-tab--active')?.dataset.lncChannelMode || 'everywhere';
    const { visibleInWeb, visibleInKiosk, isAvailable } = channelFlagsFromMode(channelMode);
    const availabilityRuleId = panel.querySelector('[data-field="schedule-id"]')?.value || null;
    const allowedPaymentMethods = [...panel.querySelectorAll('[data-payment-method]:checked')]
      .map(el => el.dataset.paymentMethod);
    const modifierGroupIds = readModifierGroupIds(panel);

    const stepBlocks = [...panel.querySelectorAll('[data-step-block]')];
    const lunchSteps = stepBlocks.map(block => ({
      id: block.dataset.stepId || '',
      name: block.querySelector('[data-field="step-name"]')?.value.trim() || '',
      itemIds: [...block.querySelectorAll('[data-step-item]')].map(el => el.dataset.stepItem),
    }));

    lunches = lunches.map(l => (
      l.id === selectedId
        ? normalizeCompositeLunch({
          ...l,
          name,
          price,
          isAvailable,
          visibleInKiosk,
          visibleInWeb,
          availabilityRuleId: availabilityRuleId || null,
          allowedPaymentMethods,
          modifierGroupIds,
          lunchSteps,
        })
        : l
    ));
  }

  function renderListRow(lunch) {
    const active = lunch.id === selectedId;
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''}" data-id="${escAttr(lunch.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="avr-row-thumb lnc-row-thumb">${productThumbHtml(
            { name: lunch.name, imageUrl: lunch.imageUrl },
            'products-thumb',
            { fallback: '🍱' },
          )}</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(lunch.name)}</span>
            <span class="avr-row-meta">${esc(lunchMetaLabel(lunch))}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderStepProducts(step) {
    if (!step.itemIds?.length) {
      return '<p class="lnc-step-empty">Нет привязанных блюд. Добавьте товары из базы.</p>';
    }
    const names = resolveStepItemNames(catalogItems, step.itemIds);
    return step.itemIds.map((id, index) => `
      <div class="cgr-product-capsule lnc-step-capsule" data-step-item="${escAttr(id)}">
        <span class="cgr-product-capsule__main lnc-step-capsule__main">
          <span class="cgr-product-capsule__name">${esc(names[index] || '—')}</span>
        </span>
        <button
          type="button"
          class="cgr-product-capsule__remove btn-press"
          data-action="remove-step-item"
          data-step-id="${escAttr(step.id)}"
          data-item-id="${escAttr(id)}"
          title="Убрать из шага"
          aria-label="Убрать товар из шага"
        >${REMOVE_ICON}</button>
      </div>
    `).join('');
  }

  function renderStepBlock(step, index) {
    return `
      <div class="lnc-step-block" data-step-block data-step-id="${escAttr(step.id)}">
        <div class="lnc-step-head">
          <label class="lnc-step-index">Шаг ${index + 1}</label>
          <input
            type="text"
            class="admin-field-input lnc-step-name-input"
            data-field="step-name"
            value="${escAttr(step.name)}"
            maxlength="80"
            placeholder="Например: Первое блюдо"
          />
          <button
            type="button"
            class="lnc-step-remove btn-press"
            data-action="remove-step"
            data-step-id="${escAttr(step.id)}"
            title="Удалить шаг"
            aria-label="Удалить шаг"
          >${REMOVE_ICON}</button>
        </div>
        <div class="lnc-step-products lnc-step-products-list" data-step-products="${escAttr(step.id)}">
          ${renderStepProducts(step)}
        </div>
        <button
          type="button"
          class="lnc-pick-products-btn btn-press"
          data-action="pick-step-products"
          data-step-id="${escAttr(step.id)}"
        >+ Добавить товары из базы</button>
      </div>
    `;
  }

  function renderCompositionSection(lunch) {
    const steps = lunch.lunchSteps?.length
      ? lunch.lunchSteps
      : [{ id: `step_${Date.now()}`, name: 'Первое блюдо', itemIds: [] }];

    return `
      <div class="sch-fieldset lnc-composition-fieldset">
        <span class="sch-fieldset__legend">Состав обеда</span>
        <div class="lnc-steps" id="lnc-steps">
          ${steps.map((s, i) => renderStepBlock(s, i)).join('')}
        </div>
        <button type="button" class="lnc-add-step-btn btn-press" data-action="add-step">+ Добавить шаг</button>
      </div>
    `;
  }

  function renderSalesPointSection(lunch) {
    const mode = resolveChannelMode(lunch.visibleInWeb, lunch.visibleInKiosk);
    return renderChannelAvailabilityGrid({
      id: 'lnc-sales-point-section',
      mode,
      modes: LUNCH_SALES_POINT_MODES,
      modeDataAttr: 'data-lnc-channel-mode',
      ariaLabel: 'Точки продаж',
      fieldLabel: 'Точки продаж',
      showOrderFields: false,
    });
  }

  function renderScheduleSection(lunch) {
    const selected = lunch.availabilityRuleId || '';
    return `
      <div class="sch-fieldset lnc-fieldset">
        <span class="sch-fieldset__legend">Расписание</span>
        <label class="admin-field-label" for="lnc-schedule-id">Шаблон расписания</label>
        <select id="lnc-schedule-id" class="admin-field-input" data-field="schedule-id">
          <option value="" ${!selected ? 'selected' : ''}>Без ограничений (круглосуточно)</option>
          ${availabilityRules.map(rule => `
            <option value="${escAttr(rule.id)}" ${rule.id === selected ? 'selected' : ''}>
              ${esc(rule.name)} — ${esc(formatAvailabilityRuleShort(rule))}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  function renderPaymentsSection(lunch) {
    const selected = new Set(lunch.allowedPaymentMethods || []);
    if (!paymentMethods.length) {
      return `
        <div class="sch-fieldset lnc-fieldset">
          <span class="sch-fieldset__legend">Разрешённые способы оплаты</span>
          <p class="sch-fieldset__hint">Справочник способов оплаты пуст.</p>
        </div>
      `;
    }
    return `
      <div class="sch-fieldset lnc-fieldset">
        <span class="sch-fieldset__legend">Разрешённые способы оплаты</span>
        <div class="lnc-sales-points">
          ${paymentMethods.map(method => `
            <label class="admin-pill-check">
              <input
                type="checkbox"
                class="admin-pill-check__input"
                data-payment-method="${escAttr(method.id)}"
                ${selected.has(method.id) ? 'checked' : ''}
              />
              <span class="admin-pill-check__box" aria-hidden="true"></span>
              <span class="admin-pill-check__label">${esc(method.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">🍱</span>
        <p class="avr-detail-empty-title">Выберите ланч</p>
        <p class="avr-detail-empty-hint">Слева — только составные комбо. Выберите позицию или создайте новую, чтобы наполнить её шагами обеда.</p>
      </div>
    `;
  }

  function renderDetailPanel(lunch) {
    return `
      <div class="avr-detail-panel" id="lnc-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Свойства ланча',
          cancelId: 'lnc-detail-cancel',
          saveId: 'lnc-detail-save',
          saveLabel: 'Сохранить изменения',
        })}
        <div class="avr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="lnc-name">Название ланча</label>
              <input
                id="lnc-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(lunch.name)}"
                maxlength="120"
                placeholder="Комплексный обед Стандарт"
              />
            </div>

            ${renderSalesPointSection(lunch)}

            ${renderModifierGroupsField({
              selectedIds: lunch.modifierGroupIds,
              modifierGroups,
              hint: 'Модификаторы для всего составного обеда (например, соус или степень прожарки).',
            })}

            <div class="admin-field-block">
              <label class="admin-field-label" for="lnc-price">Стоимость ланча</label>
              <input
                id="lnc-price"
                type="text"
                class="admin-field-input"
                data-field="price"
                value="${escAttr(formatLunchPrice(lunch.price))}"
                placeholder="350 руб"
                inputmode="decimal"
              />
            </div>

            ${renderCompositionSection(lunch)}
            ${renderScheduleSection(lunch)}
            ${renderPaymentsSection(lunch)}

            <p class="alr-detail-id">ID: <code>${esc(lunch.id)}</code> · <span class="lnc-composite-tag">Составной</span></p>
          </div>
          <p class="ifm-error" id="lnc-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="lnc-delete-confirm" />
                <span>Я понимаю, что ланч исчезнет из каталога товаров, и подтверждаю удаление</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="lnc-detail-delete" disabled>
                Удалить ланч
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function headerText() {
    return `Составные комбо (${lunches.length})`;
  }

  function render() {
    const lunch = selectedLunch();
    host.innerHTML = `
      <div class="avr-layout lnc-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">${headerText()}</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="lnc-create-btn">
              + Добавить
            </button>
          </div>
          <ul class="avr-list" id="lnc-list">${lunches.map(l => renderListRow(l)).join('')}</ul>
          ${!lunches.length ? '<p class="avr-list-empty">Нет составных комбо. Создайте первый — затем наполните его блюдами из каталога.</p>' : ''}
          <p class="ifm-error" id="lnc-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Свойства ланча">
          ${lunch ? renderDetailPanel(lunch) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateListRow(id) {
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id)}"]`);
    const lunch = lunches.find(l => l.id === id);
    if (!row || !lunch) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(lunch.name));
    row.querySelector('.avr-row-meta')?.replaceChildren(document.createTextNode(lunchMetaLabel(lunch)));
  }

  function showError(msg, listError = false) {
    const errEl = host.querySelector(listError ? '#lnc-list-error' : '#lnc-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function hideErrors() {
    host.querySelector('#lnc-error')?.setAttribute('hidden', '');
    host.querySelector('#lnc-list-error')?.setAttribute('hidden', '');
  }

  function validateLunches(next) {
    if (!next.length) {
      showError('Добавьте хотя бы один ланч', true);
      return false;
    }

    const names = new Set();
    for (const lunch of next) {
      if (!lunch.name) {
        showError('Укажите название ланча');
        return false;
      }
      const key = lunch.name.toLowerCase();
      if (names.has(key)) {
        showError('Названия ланчей должны быть уникальными');
        return false;
      }
      names.add(key);

      if (!lunch.price || lunch.price <= 0) {
        showError(`Укажите стоимость ланча «${lunch.name}»`);
        return false;
      }

      if (!lunch.lunchSteps?.length) {
        showError(`Добавьте хотя бы один шаг в ланч «${lunch.name}»`);
        return false;
      }

      for (const step of lunch.lunchSteps) {
        if (!step.name) {
          showError('Укажите название каждого шага обеда');
          return false;
        }
        if (!step.itemIds?.length) {
          showError(`Добавьте блюда в шаг «${step.name}»`);
          return false;
        }
      }
    }

    return true;
  }

  async function persistOne(lunch) {
    const normalized = normalizeCompositeLunch(lunch);
    if (!validateLunches([normalized])) return false;

    const btn = host.querySelector('#lnc-detail-save');
    if (btn) btn.disabled = true;

    try {
      const saved = await saveLunch(normalized, normalized.id.startsWith('draft_') ? '' : normalized.id);
      lunches = lunches.map(l => (l.id === lunch.id ? saved : l));
      if (selectedId === lunch.id) selectedId = saved.id;
      commitBaseline();
      showToast('Ланч сохранён и добавлен в каталог товаров');
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[lunches-editor]', err);
      showError(err.message || 'Не удалось сохранить ланч');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function persistAll(next) {
    if (!validateLunches(next)) return false;
    for (const lunch of next) {
      const ok = await persistOne(lunch);
      if (!ok) return false;
    }
    return true;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function refreshStepProducts(stepId) {
    const lunch = selectedLunch();
    const step = lunch?.lunchSteps?.find(s => s.id === stepId);
    const container = host.querySelector(`[data-step-products="${CSS.escape(stepId)}"]`);
    if (!step || !container) return;
    container.innerHTML = renderStepProducts(step);
  }

  function renumberSteps() {
    host.querySelectorAll('[data-step-block]').forEach((block, index) => {
      const label = block.querySelector('.lnc-step-index');
      if (label) label.textContent = `Шаг ${index + 1}`;
    });
  }

  function bindEvents() {
    host.querySelector('#lnc-create-btn')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: async () => {
          syncPanelToState();
          return persistOne(selectedLunch());
        },
        proceed: () => {
          hideErrors();
          const draftId = `draft_${Date.now()}`;
          const draft = normalizeCompositeLunch({
            id: draftId,
            name: 'Новый комплексный обед',
            price: 350,
            isAvailable: true,
            visibleInWeb: true,
            visibleInKiosk: true,
            lunchSteps: [{ id: `step_${Date.now()}`, name: 'Первое блюдо', itemIds: [] }],
            allowedPaymentMethods: paymentMethods.map(m => m.id),
          });
          lunches = [...lunches, draft];
          selectedId = draftId;
          render();
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        },
      });
    });

    host.querySelector('#lnc-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const row = btn.closest('.avr-row');
      const id = row?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: async () => {
          syncPanelToState();
          const lunch = selectedLunch();
          return lunch ? persistOne(lunch) : true;
        },
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    const panel = host.querySelector('#lnc-detail-panel');
    panel?.querySelector('[data-field="name"]')?.addEventListener('input', () => {
      syncPanelToState();
      if (selectedId) updateListRow(selectedId);
    });

    panel?.querySelector('[data-field="price"]')?.addEventListener('input', () => {
      syncPanelToState();
      if (selectedId) updateListRow(selectedId);
    });

    panel?.querySelectorAll('[data-lnc-channel-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('[data-lnc-channel-mode]').forEach(b => {
          const active = b === btn;
          b.classList.toggle('period-tab--active', active);
          b.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        syncPanelToState();
      });
    });

    panel?.addEventListener('change', e => {
      if (e.target.matches('[data-field="schedule-id"], [data-payment-method], [data-modifier-group-id]')) {
        syncPanelToState();
      }
    });

    panel?.addEventListener('click', e => {
      const addStepBtn = e.target.closest('[data-action="add-step"]');
      if (addStepBtn) {
        syncPanelToState();
        const lunch = selectedLunch();
        if (!lunch) return;
        const step = {
          id: uniqueStepId(lunch, `шаг_${(lunch.lunchSteps?.length || 0) + 1}`),
          name: `Шаг ${(lunch.lunchSteps?.length || 0) + 1}`,
          itemIds: [],
        };
        lunches = lunches.map(l => (
          l.id === selectedId ? { ...l, lunchSteps: [...(l.lunchSteps || []), step] } : l
        ));
        host.querySelector('#lnc-steps')?.insertAdjacentHTML(
          'beforeend',
          renderStepBlock(step, (lunch.lunchSteps?.length || 0)),
        );
        renumberSteps();
        updateListRow(selectedId);
        return;
      }

      const removeStepBtn = e.target.closest('[data-action="remove-step"]');
      if (removeStepBtn) {
        syncPanelToState();
        const stepId = removeStepBtn.dataset.stepId;
        const lunch = selectedLunch();
        if (!lunch || (lunch.lunchSteps?.length || 0) <= 1) {
          showError('В ланче должен остаться хотя бы один шаг');
          return;
        }
        lunches = lunches.map(l => (
          l.id === selectedId
            ? { ...l, lunchSteps: (l.lunchSteps || []).filter(s => s.id !== stepId) }
            : l
        ));
        host.querySelector(`[data-step-block][data-step-id="${CSS.escape(stepId)}"]`)?.remove();
        renumberSteps();
        updateListRow(selectedId);
        return;
      }

      const pickBtn = e.target.closest('[data-action="pick-step-products"]');
      if (pickBtn) {
        syncPanelToState();
        const stepId = pickBtn.dataset.stepId;
        const lunch = selectedLunch();
        const step = lunch?.lunchSteps?.find(s => s.id === stepId);
        if (!step) return;
        openLunchStepProductsPickerModal({
          stepName: step.name,
          selectedIds: step.itemIds,
          items: catalogItems,
          onApplied: itemIds => {
            lunches = lunches.map(l => (
              l.id === selectedId
                ? {
                  ...l,
                  lunchSteps: (l.lunchSteps || []).map(s => (
                    s.id === stepId ? { ...s, itemIds } : s
                  )),
                }
                : l
            ));
            refreshStepProducts(stepId);
            updateListRow(selectedId);
          },
        });
        return;
      }

      const removeItemBtn = e.target.closest('[data-action="remove-step-item"]');
      if (removeItemBtn) {
        syncPanelToState();
        const stepId = removeItemBtn.dataset.stepId;
        const itemId = removeItemBtn.dataset.itemId;
        lunches = lunches.map(l => (
          l.id === selectedId
            ? {
              ...l,
              lunchSteps: (l.lunchSteps || []).map(s => (
                s.id === stepId
                  ? { ...s, itemIds: (s.itemIds || []).filter(id => id !== itemId) }
                  : s
              )),
            }
            : l
        ));
        refreshStepProducts(stepId);
        updateListRow(selectedId);
      }
    });

    host.querySelector('#lnc-delete-confirm')?.addEventListener('change', e => {
      const deleteBtn = host.querySelector('#lnc-detail-delete');
      if (deleteBtn) deleteBtn.disabled = !e.target.checked;
    });

    host.querySelector('#lnc-detail-delete')?.addEventListener('click', async () => {
      if (!selectedId) return;
      hideErrors();
      const lunch = selectedLunch();
      if (!lunch) return;

      if (!lunch.id.startsWith('draft_')) {
        try {
          await deleteLunch(lunch.id);
        } catch (err) {
          showError(err.message || 'Не удалось удалить ланч');
          return;
        }
      }

      lunches = lunches.filter(l => l.id !== selectedId);
      selectedId = lunches[0]?.id || null;
      commitBaseline();
      showToast('Ланч удалён из каталога');
      await onSaved?.();
      render();
    });

    host.querySelector('#lnc-detail-save')?.addEventListener('click', async () => {
      hideErrors();
      syncPanelToState();
      const lunch = selectedLunch();
      if (!lunch) return;
      const ok = await persistOne(lunch);
      if (ok) render();
    });

    bindAvrDetailCancel(host, 'lnc-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: async () => {
        syncPanelToState();
        const lunch = selectedLunch();
        return lunch ? persistOne(lunch) : true;
      },
      onClose: closeDetailPanel,
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

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
