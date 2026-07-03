import {
  COMPOSITE_SET_MODES,
  formatLunchPrice,
  normalizeCompositeLunch,
  parseLunchPrice,
  resolveCompositeSetMode,
  resolveInheritedLunchAllergens,
} from '../../shared/composite-meals.js';
import { formatAvailabilityRuleShort } from '../../shared/availability-rules.js';
import {
  resolveSalesChannelMode,
  SALES_POINT_MODES,
  salesChannelFlagsFromMode,
} from '../../shared/sales-channel-modes.js';
import { deleteLunch, saveLunch } from '../services/lunches-data.js';
import {
  bindProductCatalogMultiSelect,
  renderProductCatalogMultiSelect,
} from './product-catalog-select.js';
import { showToast } from '../utils/toast.js';
import { productThumbHtml } from '../utils/product-image.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';
import { readModifierGroupIds, renderModifierGroupsField } from './modifier-groups-field.js';
import {
  renderListMetaWithSchedule,
  scheduleStatusForGroup,
} from '../utils/schedule-status.js';

const REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/composite-meals.js').CompositeLunchItem[]} p.lunches
 * @param {Array<{ id: string, name?: string, category?: string }>} p.catalogItems
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {Array<{ id: string, name: string }>} p.paymentMethods
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} [p.modifierGroups]
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} [p.categoryGroups]
 * @param {Array<{ id: string, name: string }>} [p.allergens]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createLunchesEditor(host, {
  lunches: initialLunches,
  catalogItems,
  availabilityRules,
  paymentMethods,
  modifierGroups = [],
  categoryGroups = [],
  allergens = [],
  onSaved,
}) {
  const groupNames = categoryGroups.map(g => g.name).filter(Boolean);
  /** @type {import('../../shared/composite-meals.js').CompositeLunchItem[]} */
  let lunches = initialLunches.map(l => normalizeCompositeLunch({
    ...l,
    lunchSteps: (l.lunchSteps || []).map(s => ({ ...s, itemIds: [...(s.itemIds || [])] })),
    fixedItems: (l.fixedItems || []).map(entry => ({ ...entry })),
    allowedPaymentMethods: [...(l.allowedPaymentMethods || [])],
  }, groupNames));
  const rulesMap = new Map(availabilityRules.map(r => [r.id, r]));
  /** @type {Map<string, { readSelectedIds: () => string[], destroy?: () => void }>} */
  const multiSelectControllers = new Map();
  /** @type {string|null} */
  let selectedId = lunches[0]?.id || null;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(
      lunches.map(l => normalizeCompositeLunch(l, groupNames)).sort((a, b) => a.id.localeCompare(b.id)),
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
    const { visibleInWeb, visibleInKiosk, visibleInPos, isAvailable } = salesChannelFlagsFromMode(channelMode);
    const availabilityRuleId = panel.querySelector('[data-field="schedule-id"]')?.value || null;
    const allowedPaymentMethods = [...panel.querySelectorAll('[data-payment-method]:checked')]
      .map(el => el.dataset.paymentMethod);
    const modifierGroupIds = readModifierGroupIds(panel);
    const category = panel.querySelector('[data-field="category"]')?.value.trim() || '';
    const compositionEnabled = panel.querySelector('[data-field="composition-enabled"]')?.checked !== false;
    const compositeMode = panel.querySelector('[data-composite-mode].period-tab--active')?.dataset.compositeMode
      || COMPOSITE_SET_MODES.STEPS;

    const stepBlocks = [...panel.querySelectorAll('[data-step-block]')];
    const lunchSteps = stepBlocks.map(block => {
      const stepId = block.dataset.stepId || '';
      const fieldKey = `step_${stepId}`;
      const controller = multiSelectControllers.get(fieldKey);
      const itemIds = controller?.readSelectedIds()
        || [...block.querySelectorAll('[data-cgms-tag]')].map(el => el.dataset.cgmsTag).filter(Boolean);
      const minPick = Math.max(1, parseInt(block.querySelector('[data-field="step-min"]')?.value, 10) || 1);
      const maxPick = Math.max(minPick, parseInt(block.querySelector('[data-field="step-max"]')?.value, 10) || 1);
      return {
        id: stepId,
        name: block.querySelector('[data-field="step-name"]')?.value.trim() || '',
        itemIds,
        minPick,
        maxPick,
      };
    });

    const fixedFieldKey = selectedId ? `fixed_${selectedId}` : '';
    const fixedController = fixedFieldKey ? multiSelectControllers.get(fixedFieldKey) : null;
    const fixedItemIds = fixedController?.readSelectedIds()
      || (fixedFieldKey
        ? [...panel.querySelector(`[data-pcs-field="${CSS.escape(fixedFieldKey)}"]`)?.querySelectorAll('[data-cgms-tag]') || []]
          .map(el => el.dataset.cgmsTag).filter(Boolean)
        : []);
    const fixedItems = fixedItemIds.map(itemId => ({ itemId, quantity: 1 }));

    lunches = lunches.map(l => (
      l.id === selectedId
        ? normalizeCompositeLunch({
          ...l,
          name,
          price,
          category,
          isAvailable,
          visibleInKiosk,
          visibleInWeb,
          visibleInPos,
          availabilityRuleId: availabilityRuleId || null,
          allowedPaymentMethods,
          modifierGroupIds,
          compositionEnabled,
          compositeMode: compositionEnabled ? compositeMode : COMPOSITE_SET_MODES.STEPS,
          lunchSteps: compositionEnabled && compositeMode === COMPOSITE_SET_MODES.STEPS ? lunchSteps : l.lunchSteps,
          fixedItems: compositionEnabled && compositeMode === COMPOSITE_SET_MODES.FIXED ? fixedItems : l.fixedItems,
        }, groupNames)
        : l
    ));
  }

  function lunchScheduleStatus(lunch) {
    const rule = lunch.availabilityRuleId ? rulesMap.get(lunch.availabilityRuleId) : null;
    return scheduleStatusForGroup(lunch, rule);
  }

  function isLunchHidden(lunch) {
    return resolveSalesChannelMode(lunch.visibleInWeb, lunch.visibleInKiosk, lunch.visibleInPos) === 'hidden';
  }

  function isLunchDeprioritized(lunch) {
    return isLunchHidden(lunch) || lunchScheduleStatus(lunch).isExpired === true;
  }

  function channelBadgeHtml(channel, lunch) {
    const config = {
      web: {
        active: lunch.visibleInWeb !== false,
        letter: 'W',
        label: 'Веб',
        className: 'cgr-channel-badge--web',
      },
      kiosk: {
        active: lunch.visibleInKiosk === true,
        letter: 'K',
        label: 'Киоск',
        className: 'cgr-channel-badge--kiosk',
      },
      pos: {
        active: lunch.visibleInPos === true,
        letter: 'P',
        label: 'Касса',
        className: 'cgr-channel-badge--pos',
      },
    }[channel];

    const classes = [
      'cgr-channel-badge',
      config.className,
      config.active ? 'cgr-channel-badge--active' : 'cgr-channel-badge--inactive',
    ].join(' ');

    return `<span class="${classes}" aria-label="${escAttr(config.active ? `${config.label}, активен` : `${config.label}, неактивен`)}">${config.letter}</span>`;
  }

  function channelIndicatorsHtml(lunch) {
    return `${channelBadgeHtml('web', lunch)}${channelBadgeHtml('kiosk', lunch)}${channelBadgeHtml('pos', lunch)}`;
  }

  function lunchListMainMeta(lunch) {
    const mode = resolveCompositeSetMode(lunch);
    if (mode === COMPOSITE_SET_MODES.FIXED) {
      const count = lunch.fixedItems?.length || 0;
      const mod10 = count % 10;
      const mod100 = count % 100;
      const itemsWord = mod10 === 1 && mod100 !== 11
        ? 'товар'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'товара'
          : 'товаров';
      return `${esc(lunch.category || '—')} · ${formatLunchPrice(lunch.price)} · фикс. ${count} ${itemsWord}`;
    }
    const steps = lunch.lunchSteps?.length || 0;
    const mod10 = steps % 10;
    const mod100 = steps % 100;
    const stepsWord = mod10 === 1 && mod100 !== 11
      ? 'шаг'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'шага'
        : 'шагов';
    return `${esc(lunch.category || '—')} · ${formatLunchPrice(lunch.price)} · ${steps} ${stepsWord}`;
  }

  function listRowMetaHtml(lunch) {
    return renderListMetaWithSchedule(lunchListMainMeta(lunch), lunchScheduleStatus(lunch));
  }

  function inheritedAllergenLabels(lunch) {
    const ids = resolveInheritedLunchAllergens(lunch, catalogItems);
    return ids.map(id => allergens.find(a => a.id === id)?.name || id);
  }

  function renderInheritedAllergensSection(lunch) {
    const labels = inheritedAllergenLabels(lunch);
    return `
      <div class="admin-field-block lnc-allergens-block" id="lnc-allergens-section">
        <span class="admin-field-label">Аллергены</span>
        <p class="sch-fieldset__hint lnc-allergens-hint">
          Наследуются автоматически из блюд в составе (объединение без дублей). Обновляются при сохранении.
        </p>
        ${labels.length
          ? `<div class="lnc-allergens-list">${labels.map(name => `<span class="lnc-allergen-tag">${esc(name)}</span>`).join('')}</div>`
          : '<p class="lnc-allergens-empty">Нет аллергенов — у блюд в составе аллергены не указаны.</p>'}
      </div>
    `;
  }

  function refreshInheritedAllergensSection() {
    const lunch = selectedLunch();
    const block = host.querySelector('#lnc-allergens-section');
    if (!lunch || !block) return;
    block.outerHTML = renderInheritedAllergensSection(lunch);
  }

  function renderListRow(lunch) {
    const active = lunch.id === selectedId;
    const deprioritized = isLunchDeprioritized(lunch);
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''} ${deprioritized ? 'cgr-row--hidden' : ''}" data-id="${escAttr(lunch.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${productThumbHtml(
              { name: lunch.name, imageUrl: lunch.imageUrl },
              'products-thumb',
              { fallback: '🍱' },
            )}</span>
            <span class="avr-row-info">
              <span class="avr-row-name">${esc(lunch.name)}</span>
              <span class="avr-row-meta">${listRowMetaHtml(lunch)}</span>
            </span>
          </span>
          <span class="cgr-row-indicators">${channelIndicatorsHtml(lunch)}</span>
        </button>
      </li>
    `;
  }

  function renderFixedSetSection(lunch) {
    const selectedIds = (lunch.fixedItems || []).map(entry => entry.itemId).filter(Boolean);

    return `
      <div class="lnc-composite-panel" data-composite-panel="fixed">
        ${renderProductCatalogMultiSelect({
          fieldKey: `fixed_${lunch.id}`,
          label: 'Состав набора',
          items: catalogItems,
          selectedIds,
          placeholder: 'Поиск и добавление товаров...',
        })}
      </div>
    `;
  }

  function renderStepBlock(step, index) {
    return `
      <div class="lnc-step-card" data-step-block data-step-id="${escAttr(step.id)}">
        <div class="lnc-step-card-head">
          <span class="lnc-step-index">Шаг ${index + 1}</span>
          <button
            type="button"
            class="lnc-step-remove btn-press"
            data-action="remove-step"
            data-step-id="${escAttr(step.id)}"
            title="Удалить шаг"
            aria-label="Удалить шаг"
          >${REMOVE_ICON}</button>
        </div>
        <div class="admin-field-block">
          <label class="admin-field-label" for="lnc-step-name-${escAttr(step.id)}">Название шага</label>
          <input
            id="lnc-step-name-${escAttr(step.id)}"
            type="text"
            class="admin-field-input"
            data-field="step-name"
            value="${escAttr(step.name)}"
            maxlength="80"
            placeholder="Шаг 1: Комплексный обед"
          />
        </div>
        <div class="lnc-step-limits">
          <div class="admin-field-block lnc-step-limit">
            <label class="admin-field-label" for="lnc-step-min-${escAttr(step.id)}">Мин. позиций для выбора</label>
            <input
              id="lnc-step-min-${escAttr(step.id)}"
              type="number"
              class="admin-field-input"
              data-field="step-min"
              min="1"
              step="1"
              value="${Math.max(1, Number(step.minPick) || 1)}"
            />
          </div>
          <div class="admin-field-block lnc-step-limit">
            <label class="admin-field-label" for="lnc-step-max-${escAttr(step.id)}">Макс. позиций для выбора</label>
            <input
              id="lnc-step-max-${escAttr(step.id)}"
              type="number"
              class="admin-field-input"
              data-field="step-max"
              min="1"
              step="1"
              value="${Math.max(1, Number(step.maxPick) || 1)}"
            />
          </div>
        </div>
        ${renderProductCatalogMultiSelect({
          fieldKey: `step_${step.id}`,
          label: 'Доступные товары для шага',
          items: catalogItems,
          selectedIds: step.itemIds || [],
          placeholder: 'Поиск и добавление товаров...',
        })}
      </div>
    `;
  }

  function renderStepsSection(lunch) {
    const steps = lunch.lunchSteps?.length
      ? lunch.lunchSteps
      : [{ id: `step_${Date.now()}`, name: 'Шаг 1: Комплексный обед', itemIds: [], minPick: 1, maxPick: 1 }];

    return `
      <div class="lnc-composite-panel" data-composite-panel="steps">
        <div class="lnc-steps" id="lnc-steps">
          ${steps.map((s, i) => renderStepBlock(s, i)).join('')}
        </div>
        <button type="button" class="lnc-add-step-btn btn-press" data-action="add-step">
          <span class="lnc-add-step-btn__icon" aria-hidden="true">+</span>
          <span>Добавить шаг</span>
        </button>
      </div>
    `;
  }

  function renderCompositeSection(lunch) {
    const compositionEnabled = lunch.compositionEnabled !== false;
    const mode = resolveCompositeSetMode(lunch);
    const fixedActive = mode === COMPOSITE_SET_MODES.FIXED;

    return `
      <div class="sch-fieldset lnc-composite-section" id="lnc-composite-section" data-mode="${mode}">
        <span class="sch-fieldset__legend">Составной товар / Комплекс</span>
        <label class="admin-pill-check lnc-composite-toggle">
          <input
            type="checkbox"
            class="admin-pill-check__input"
            data-field="composition-enabled"
            ${compositionEnabled ? 'checked' : ''}
          />
          <span class="admin-pill-check__box" aria-hidden="true"></span>
          <span class="admin-pill-check__label">Включить составной набор</span>
        </label>
        <div class="lnc-composite-body ${compositionEnabled ? '' : 'lnc-composite-body--hidden'}" id="lnc-composite-body">
          <div class="period-tabs lnc-composite-mode-tabs" role="tablist" aria-label="Тип состава">
            <button
              type="button"
              class="period-tab ${fixedActive ? 'period-tab--active' : ''}"
              data-composite-mode="${COMPOSITE_SET_MODES.FIXED}"
              role="tab"
              aria-selected="${fixedActive ? 'true' : 'false'}"
            >Фиксированный набор</button>
            <button
              type="button"
              class="period-tab ${!fixedActive ? 'period-tab--active' : ''}"
              data-composite-mode="${COMPOSITE_SET_MODES.STEPS}"
              role="tab"
              aria-selected="${!fixedActive ? 'true' : 'false'}"
            >Набор по шагам</button>
          </div>
          ${renderFixedSetSection(lunch)}
          ${renderStepsSection(lunch)}
        </div>
        <p class="sch-fieldset__hint lnc-composite-hint">
          ${fixedActive
            ? 'Товары добавляются в заказ автоматически одной кнопкой на кассе.'
            : 'Кассир выбирает блюда по шагам в модальном окне (как на терминале).'}
        </p>
      </div>
    `;
  }

  function renderCategorySection(lunch) {
    const selected = lunch.category || '';
    const options = [...new Set([...groupNames, selected].filter(Boolean))];
    if (!options.length) {
      return `
        <div class="admin-field-block">
          <span class="admin-field-label">Группа товаров</span>
          <p class="sch-fieldset__hint">Сначала создайте группу в разделе «Группы товаров».</p>
        </div>
      `;
    }
    return `
      <div class="admin-field-block">
        <label class="admin-field-label" for="lnc-category">Группа товаров</label>
        <select id="lnc-category" class="admin-field-input" data-field="category">
          ${options.map(name => `
            <option value="${escAttr(name)}" ${name === selected ? 'selected' : ''}>${esc(name)}</option>
          `).join('')}
        </select>
        <p class="sch-fieldset__hint">Ланч отображается в этой группе на кассе, киоске и в личном кабинете — как обычный товар.</p>
      </div>
    `;
  }

  function renderSalesPointSection(lunch) {
    const mode = resolveSalesChannelMode(lunch.visibleInWeb, lunch.visibleInKiosk, lunch.visibleInPos);
    return renderChannelAvailabilityGrid({
      id: 'lnc-sales-point-section',
      mode,
      modes: SALES_POINT_MODES,
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

            ${renderCategorySection(lunch)}

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

            ${renderCompositeSection(lunch)}
            ${renderInheritedAllergensSection(lunch)}
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
      <div class="avr-layout lnc-layout cgr-layout">
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
    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.innerHTML = listRowMetaHtml(lunch);
    row.classList.toggle('cgr-row--hidden', isLunchDeprioritized(lunch));
    const indicatorsEl = row.querySelector('.cgr-row-indicators');
    if (indicatorsEl) indicatorsEl.innerHTML = channelIndicatorsHtml(lunch);
    const thumbEl = row.querySelector('.avr-row-thumb');
    if (thumbEl) {
      thumbEl.innerHTML = productThumbHtml(
        { name: lunch.name, imageUrl: lunch.imageUrl },
        'products-thumb',
        { fallback: '🍱' },
      );
    }
  }

  function refreshCompositionUi() {
    if (!selectedId) return;
    updateListRow(selectedId);
    refreshInheritedAllergensSection();
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

      if (!lunch.category?.trim()) {
        showError(`Выберите группу товаров для ланча «${lunch.name}»`);
        return false;
      }

      if (!lunch.price || lunch.price <= 0) {
        showError(`Укажите стоимость ланча «${lunch.name}»`);
        return false;
      }

      if (!lunch.compositionEnabled && lunch.compositionEnabled !== undefined) {
        showError(`Включите составной набор для ланча «${lunch.name}»`);
        return false;
      }

      const mode = resolveCompositeSetMode(lunch);
      if (mode === COMPOSITE_SET_MODES.FIXED) {
        if (!lunch.fixedItems?.length) {
          showError(`Добавьте хотя бы один товар в фиксированный набор «${lunch.name}»`);
          return false;
        }
        for (const entry of lunch.fixedItems) {
          if (!entry.itemId) {
            showError(`Выберите товар во всех строках фиксированного набора «${lunch.name}»`);
            return false;
          }
          if (!entry.quantity || entry.quantity < 1) {
            showError(`Укажите количество для каждого товара в «${lunch.name}»`);
            return false;
          }
        }
        continue;
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
        const minPick = Math.max(1, Number(step.minPick) || 1);
        const maxPick = Math.max(minPick, Number(step.maxPick) || 1);
        if (maxPick > step.itemIds.length) {
          showError(`В шаге «${step.name}» макс. позиций не может превышать число доступных товаров`);
          return false;
        }
      }
    }

    return true;
  }

  async function persistOne(lunch) {
    const normalized = normalizeCompositeLunch(lunch, groupNames);
    if (!validateLunches([normalized])) return false;

    const btn = host.querySelector('#lnc-detail-save');
    if (btn) btn.disabled = true;

    try {
      const saved = await saveLunch(normalized, normalized.id.startsWith('draft_') ? '' : normalized.id, catalogItems);
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

  function bindCompositionControls() {
    const panel = host.querySelector('#lnc-detail-panel');
    if (!panel) return;

    multiSelectControllers.forEach(c => c.destroy?.());
    multiSelectControllers.clear();

    panel.querySelectorAll('[data-pcs-field]').forEach(fieldEl => {
      const fieldKey = fieldEl.dataset.pcsField || '';
      if (!fieldKey) return;
      const controller = bindProductCatalogMultiSelect(panel, {
        fieldKey,
        items: catalogItems,
        onChange: () => {
          syncPanelToState();
          refreshCompositionUi();
        },
      });
      multiSelectControllers.set(fieldKey, controller);
    });
  }

  function updateCompositeModeUi(mode) {
    const section = host.querySelector('#lnc-composite-section');
    if (section) section.dataset.mode = mode;
    const hint = host.querySelector('.lnc-composite-hint');
    if (hint) {
      hint.textContent = mode === COMPOSITE_SET_MODES.FIXED
        ? 'Товары добавляются в заказ автоматически одной кнопкой на кассе.'
        : 'Кассир выбирает блюда по шагам в модальном окне (как на терминале).';
    }
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
            category: groupNames[0] || '',
            isAvailable: true,
            visibleInWeb: true,
            visibleInKiosk: true,
            visibleInPos: true,
            compositeMode: COMPOSITE_SET_MODES.STEPS,
            compositionEnabled: true,
            lunchSteps: [{
              id: `step_${Date.now()}`,
              name: 'Шаг 1: Комплексный обед',
              itemIds: [],
              minPick: 1,
              maxPick: 1,
            }],
            fixedItems: [],
            allowedPaymentMethods: paymentMethods.map(m => m.id),
          }, groupNames);
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
        if (selectedId) updateListRow(selectedId);
      });
    });

    panel?.addEventListener('change', e => {
      if (e.target.matches('[data-field="schedule-id"], [data-field="category"], [data-payment-method], [data-modifier-group-id], [data-field="composition-enabled"]')) {
        if (e.target.matches('[data-field="composition-enabled"]')) {
          const body = panel.querySelector('#lnc-composite-body');
          body?.classList.toggle('lnc-composite-body--hidden', !e.target.checked);
        }
        syncPanelToState();
        if (selectedId) updateListRow(selectedId);
      }
    });

    panel?.querySelectorAll('[data-composite-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('[data-composite-mode]').forEach(b => {
          const active = b === btn;
          b.classList.toggle('period-tab--active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const mode = btn.dataset.compositeMode || COMPOSITE_SET_MODES.STEPS;
        updateCompositeModeUi(mode);
        syncPanelToState();
        if (selectedId) updateListRow(selectedId);
      });
    });

    panel?.addEventListener('input', e => {
      if (e.target.matches('[data-field="step-name"], [data-field="step-min"], [data-field="step-max"]')) {
        syncPanelToState();
        if (selectedId) updateListRow(selectedId);
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
          name: `Шаг ${(lunch.lunchSteps?.length || 0) + 1}: Комплексный обед`,
          itemIds: [],
          minPick: 1,
          maxPick: 1,
        };
        lunches = lunches.map(l => (
          l.id === selectedId ? { ...l, lunchSteps: [...(l.lunchSteps || []), step] } : l
        ));
        host.querySelector('#lnc-steps')?.insertAdjacentHTML(
          'beforeend',
          renderStepBlock(step, (lunch.lunchSteps?.length || 0)),
        );
        bindCompositionControls();
        renumberSteps();
        refreshCompositionUi();
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
        multiSelectControllers.get(`step_${stepId}`)?.destroy?.();
        multiSelectControllers.delete(`step_${stepId}`);
        renumberSteps();
        refreshCompositionUi();
      }
    });

    bindCompositionControls();

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
