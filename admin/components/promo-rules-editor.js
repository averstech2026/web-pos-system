import {
  CLIENT_GROUP_OPTIONS,
  createDefaultPromoRule,
  formatPromoRuleSummary,
  isPromoHidden,
  normalizePromoRuleDoc,
  PROMO_ACTION_OPTIONS,
  PROMO_TRIGGER_OPTIONS,
  sanitizePromoRuleFields,
  validatePromoRuleDoc,
} from '../../shared/promo-rules.js';
import { formatAvailabilityRuleShort } from '../../shared/availability-rules.js';
import { bindProductPickerFields, renderProductPickerField } from './product-picker-field.js';
import { deletePromoRule, savePromoRule } from '../services/promo-rules-data.js';
import { promoThumbHtml } from '../utils/product-image.js';
import {
  channelFlagsFromMode,
  ITEM_CHANNEL_MODES,
  resolveChannelMode,
} from '../services/products-data.js';
import { showToast } from '../utils/toast.js';
import { runWithUnsavedGuard, bindAvrDetailCancel, renderAvrDetailStickyHead } from '../utils/avr-unsaved-changes.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';
import {
  renderListMetaWithSchedule,
  scheduleStatusForPromo,
} from '../utils/schedule-status.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/promo-rules.js').PromoRuleDoc[]} p.promos
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} p.categoryGroups
 * @param {Array<{ id: string, name: string, price?: number, category?: string }>} p.items
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createPromoRulesEditor(host, {
  promos: initialPromos,
  availabilityRules = [],
  categoryGroups = [],
  items = [],
  onSaved,
}) {
  /** @type {import('../../shared/promo-rules.js').PromoRuleDoc[]} */
  let promos = initialPromos.map(p => normalizePromoRuleDoc(p, p.id));
  /** @type {string|null} */
  let selectedId = promos[0]?.id || null;
  /** @type {boolean} */
  let isNew = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(
      promos.map(p => normalizePromoRuleDoc(p, p.id)).sort((a, b) => a.id.localeCompare(b.id)),
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
    promos = JSON.parse(baselineJson);
    isNew = false;
    if (selectedId && !promos.some(p => p.id === selectedId)) {
      selectedId = promos[0]?.id || null;
    }
  }

  commitBaseline();

  const activeRules = availabilityRules.filter(r => r.status !== 'archived');

  function selectedPromo() {
    return promos.find(p => p.id === selectedId) || null;
  }

  function panelChange() {
    syncPanelToState();
    updateListRow(selectedId);
  }

  function readClientGroups(panel) {
    return [...panel.querySelectorAll('[data-client-group]:checked')]
      .map(el => el.dataset.clientGroup)
      .filter(Boolean);
  }

  function readChannelModeFromPanel(panel) {
    const active = panel.querySelector('[data-promo-channel-mode].period-tab--active');
    return active?.dataset.promoChannelMode || 'everywhere';
  }

  function syncPanelToState() {
    const panel = host.querySelector('#prm-detail-panel');
    if (!selectedId || !panel) return;

    const triggerType = panel.querySelector('[data-field="trigger-type"]')?.value || 'happy_hour';
    const actionType = panel.querySelector('[data-field="action-type"]')?.value || 'discount_percent';

    /** @type {import('../../shared/promo-rules.js').PromoConditions} */
    const conditions = {};

    if (triggerType === 'cart_amount') {
      conditions.minSum = Number(panel.querySelector('[data-field="min-sum"]')?.value) || 0;
    }

    if (triggerType === 'item_quantity') {
      const targetType = panel.querySelector('[data-field="qty-target-type"]')?.value || 'item';
      conditions.requiredQty = Number(panel.querySelector('[data-field="required-qty"]')?.value) || 1;
      if (targetType === 'item') {
        conditions.requiredItemId = panel.querySelector('[data-field="required-item"]')?.value || '';
      } else {
        conditions.requiredGroupId = panel.querySelector('[data-field="required-group"]')?.value || '';
      }
    }

    /** @type {import('../../shared/promo-rules.js').PromoAction} */
    let action;

    if (actionType === 'gift_item') {
      action = {
        type: 'gift_item',
        giftItemId: panel.querySelector('[data-field="gift-item"]')?.value || '',
      };
    } else if (actionType === 'discount_fixed') {
      action = {
        type: 'discount_fixed',
        value: Number(panel.querySelector('[data-field="fixed-discount-value"]')?.value) || 0,
      };
    } else if (actionType === 'bonus_points') {
      const mode = panel.querySelector('[data-field="bonus-mode"]')?.value === 'percent' ? 'percent' : 'points';
      action = {
        type: 'bonus_points',
        mode,
        value: Number(panel.querySelector('[data-field="bonus-value"]')?.value) || 0,
      };
    } else {
      const discountTarget = panel.querySelector('[data-field="discount-target"]')?.value || 'cart';
      action = {
        type: 'discount_percent',
        value: Number(panel.querySelector('[data-field="discount-value"]')?.value) || 0,
        target: discountTarget === 'group' ? 'group' : 'cart',
        targetGroupId: discountTarget === 'group'
          ? (panel.querySelector('[data-field="discount-group"]')?.value || null)
          : null,
      };
    }

    const { visibleInWeb, visibleInKiosk } = channelFlagsFromMode(readChannelModeFromPanel(panel));
    const current = promos.find(p => p.id === selectedId);

    const draft = normalizePromoRuleDoc({
      id: selectedId,
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      visibleInWeb,
      visibleInKiosk,
      webOrder: current?.webOrder,
      kioskOrder: current?.kioskOrder,
      availabilityRuleId: panel.querySelector('[data-field="availability-rule"]')?.value || null,
      triggerType,
      conditions,
      action,
      targetClientGroups: triggerType === 'client_segment' ? readClientGroups(panel) : [],
    }, selectedId);

    promos = promos.map(p => (p.id === selectedId ? sanitizePromoRuleFields(draft) : p));
  }

  function revealClass(visible) {
    return `prm-reveal ${visible ? 'prm-reveal--visible' : ''}`;
  }

  function renderScheduleOptions(selected) {
    return `
      <option value="">Всегда (без расписания)</option>
      ${activeRules.map(r => `
        <option value="${escAttr(r.id)}" ${r.id === selected ? 'selected' : ''}>
          ${esc(r.name)} — ${esc(formatAvailabilityRuleShort(r))}
        </option>
      `).join('')}
    `;
  }

  function renderGroupOptions(selectedId, placeholder = 'Выберите группу') {
    return `
      <option value="">${esc(placeholder)}</option>
      ${categoryGroups.map(g => `
        <option value="${escAttr(g.id)}" ${g.id === selectedId ? 'selected' : ''}>
          ${esc(g.name)}
        </option>
      `).join('')}
    `;
  }

  function renderClientGroupChips(selected = []) {
    const set = new Set(selected);
    return `
      <div class="prm-chip-group" role="group" aria-label="Категории клиентов">
        ${CLIENT_GROUP_OPTIONS.map(opt => `
          <label class="prm-chip btn-press ${set.has(opt.id) ? 'prm-chip--active' : ''}">
            <input type="checkbox" data-client-group="${escAttr(opt.id)}" ${set.has(opt.id) ? 'checked' : ''} hidden />
            <span>${esc(opt.label)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderVisibilitySection(promo) {
    const mode = resolveChannelMode(promo.visibleInWeb, promo.visibleInKiosk);
    return renderChannelAvailabilityGrid({
      id: 'prm-visibility-section',
      mode,
      modes: ITEM_CHANNEL_MODES,
      modeDataAttr: 'data-promo-channel-mode',
      ariaLabel: 'Доступность акции',
      showOrderFields: false,
    });
  }

  function syncPromoChannelTabs() {
    const promo = selectedPromo();
    const panel = host.querySelector('#prm-detail-panel');
    if (!promo || !panel) return;
    const mode = resolveChannelMode(promo.visibleInWeb, promo.visibleInKiosk);
    panel.querySelectorAll('[data-promo-channel-mode]').forEach(btn => {
      const active = btn.dataset.promoChannelMode === mode;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function channelBadgeHtml(channel, promo) {
    const isWeb = channel === 'web';
    const active = isWeb
      ? promo.visibleInWeb !== false
      : promo.visibleInKiosk === true;
    const letter = isWeb ? 'W' : 'K';
    const channelLabel = isWeb ? 'Веб' : 'Киоск';
    const classes = [
      'cgr-channel-badge',
      isWeb ? 'cgr-channel-badge--web' : 'cgr-channel-badge--kiosk',
      active ? 'cgr-channel-badge--active' : 'cgr-channel-badge--inactive',
    ].join(' ');
    const ariaLabel = active ? `${channelLabel}, активен` : `${channelLabel}, неактивен`;

    return `<span class="${classes}" aria-label="${escAttr(ariaLabel)}">${letter}</span>`;
  }

  function channelIndicatorsHtml(promo) {
    return `${channelBadgeHtml('web', promo)}${channelBadgeHtml('kiosk', promo)}`;
  }

  function promoScheduleStatus(promo) {
    const rule = promo.availabilityRuleId
      ? activeRules.find(r => r.id === promo.availabilityRuleId)
      : null;
    return scheduleStatusForPromo(promo, rule);
  }

  function isPromoDeprioritized(promo) {
    return isPromoHidden(promo) || promoScheduleStatus(promo).isExpired === true;
  }

  function listRowMetaHtml(promo) {
    return renderListMetaWithSchedule(
      formatPromoRuleSummary(promo, categoryGroups, items),
      promoScheduleStatus(promo),
    );
  }

  function partitionPromosForList() {
    const sorted = [...promos].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const active = sorted.filter(p => !isPromoDeprioritized(p));
    const inactive = sorted.filter(p => isPromoDeprioritized(p));
    return { active, inactive };
  }

  function renderHiddenPromosDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Скрытые акции (${count}) —</span>
      </li>
    `;
  }

  function renderListItemsHtml() {
    const { active, inactive } = partitionPromosForList();
    return [
      ...active.map(p => renderListRow(p)),
      renderHiddenPromosDivider(inactive.length),
      ...inactive.map(p => renderListRow(p)),
    ].join('');
  }

  function refreshListOrder() {
    const list = host.querySelector('#prm-list');
    if (!list) return;
    list.innerHTML = renderListItemsHtml();
  }

  function renderConditionBlock(promo) {
    const trigger = promo.triggerType;
    const qtyTarget = promo.conditions.requiredGroupId && !promo.conditions.requiredItemId
      ? 'group'
      : 'item';

    return `
      <section class="prm-block card">
        <div class="prm-block-head">
          <span class="prm-block-badge">ЕСЛИ</span>
          <h3 class="prm-block-title">Условие</h3>
        </div>
        <div class="prm-block-body admin-form-stack">
          <label class="form-group">
            <span class="avr-field-label">Тип условия</span>
            <select data-field="trigger-type" class="avr-select">
              ${PROMO_TRIGGER_OPTIONS.map(o => `
                <option value="${o.id}" ${trigger === o.id ? 'selected' : ''}>${esc(o.label)}</option>
              `).join('')}
            </select>
          </label>

          <div class="prm-conditional-fields" data-condition-fields>
            <div class="${revealClass(trigger === 'cart_amount')}">
              <div class="prm-reveal-inner">
                <label class="form-group">
                  <span class="avr-field-label">Минимальная сумма чека, ₽</span>
                  <input type="number" class="avr-name-input" data-field="min-sum" min="1" step="1"
                    value="${escAttr(String(promo.conditions.minSum || ''))}" placeholder="1000" />
                </label>
              </div>
            </div>

            <div class="${revealClass(trigger === 'item_quantity')}">
              <div class="prm-reveal-inner admin-form-stack">
                <label class="form-group">
                  <span class="avr-field-label">Товар или группа</span>
                  <select data-field="qty-target-type" class="avr-select">
                    <option value="item" ${qtyTarget === 'item' ? 'selected' : ''}>Конкретный товар</option>
                    <option value="group" ${qtyTarget === 'group' ? 'selected' : ''}>Группа товаров</option>
                  </select>
                </label>
                <div class="${revealClass(qtyTarget === 'item')}" data-qty-item-field>
                  <div class="prm-reveal-inner">
                    ${renderProductPickerField({
                      fieldName: 'required-item',
                      label: 'Товар',
                      modalTitle: 'Выбрать товар',
                      items,
                      selectedId: promo.conditions.requiredItemId || '',
                    })}
                  </div>
                </div>
                <div class="${revealClass(qtyTarget === 'group')}" data-qty-group-field>
                  <div class="prm-reveal-inner">
                    <label class="form-group">
                      <span class="avr-field-label">Группа</span>
                      <select data-field="required-group" class="avr-select">
                        ${renderGroupOptions(promo.conditions.requiredGroupId || '')}
                      </select>
                    </label>
                  </div>
                </div>
                <label class="form-group">
                  <span class="avr-field-label">Количество, шт.</span>
                  <input type="number" class="avr-name-input" data-field="required-qty" min="1" step="1"
                    value="${escAttr(String(promo.conditions.requiredQty || 3))}" />
                </label>
              </div>
            </div>

            <div class="${revealClass(trigger === 'happy_hour')}">
              <div class="prm-reveal-inner">
                <p class="prm-hint">Условие выполняется автоматически, когда активно выбранное расписание в блоке «Основное».</p>
              </div>
            </div>

            <div class="${revealClass(trigger === 'client_segment')}">
              <div class="prm-reveal-inner admin-form-stack">
                <div class="form-group">
                  <span class="avr-field-label">Выберите категорию клиентов</span>
                  ${renderClientGroupChips(promo.targetClientGroups || [])}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderActionBlock(promo) {
    const actionType = promo.action.type;
    const discountTarget = promo.action.type === 'discount_percent' && promo.action.target === 'group'
      ? 'group'
      : 'cart';
    const bonusMode = promo.action.type === 'bonus_points' && promo.action.mode === 'percent'
      ? 'percent'
      : 'points';

    return `
      <section class="prm-block card">
        <div class="prm-block-head">
          <span class="prm-block-badge prm-block-badge--action">ТО</span>
          <h3 class="prm-block-title">Поощрение</h3>
        </div>
        <div class="prm-block-body admin-form-stack">
          <label class="form-group">
            <span class="avr-field-label">Тип выгоды</span>
            <select data-field="action-type" class="avr-select">
              ${PROMO_ACTION_OPTIONS.map(o => `
                <option value="${o.id}" ${actionType === o.id ? 'selected' : ''}>${esc(o.label)}</option>
              `).join('')}
            </select>
          </label>

          <div class="prm-conditional-fields" data-action-fields>
            <div class="${revealClass(actionType === 'discount_percent')}">
              <div class="prm-reveal-inner admin-form-stack">
                <label class="form-group">
                  <span class="avr-field-label">Процент скидки</span>
                  <input type="number" class="avr-name-input" data-field="discount-value" min="1" max="100" step="1"
                    value="${escAttr(String(promo.action.type === 'discount_percent' ? promo.action.value : 10))}" />
                </label>
                <label class="form-group">
                  <span class="avr-field-label">Применить к</span>
                  <select data-field="discount-target" class="avr-select">
                    <option value="cart" ${discountTarget === 'cart' ? 'selected' : ''}>Весь чек</option>
                    <option value="group" ${discountTarget === 'group' ? 'selected' : ''}>Определенная группа товаров</option>
                  </select>
                </label>
                <div class="${revealClass(discountTarget === 'group')}" data-discount-group-field>
                  <div class="prm-reveal-inner">
                    <label class="form-group">
                      <span class="avr-field-label">Группа для скидки</span>
                      <select data-field="discount-group" class="avr-select">
                        ${renderGroupOptions(
                          promo.action.type === 'discount_percent' ? (promo.action.targetGroupId || '') : '',
                          'Выберите группу',
                        )}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="${revealClass(actionType === 'discount_fixed')}">
              <div class="prm-reveal-inner">
                <label class="form-group">
                  <span class="avr-field-label">Сумма скидки на чек, ₽</span>
                  <input type="number" class="avr-name-input" data-field="fixed-discount-value" min="1" step="1"
                    value="${escAttr(String(promo.action.type === 'discount_fixed' ? promo.action.value : ''))}"
                    placeholder="100" />
                </label>
              </div>
            </div>

            <div class="${revealClass(actionType === 'gift_item')}">
              <div class="prm-reveal-inner">
                ${renderProductPickerField({
                  fieldName: 'gift-item',
                  label: 'Товар-подарок',
                  modalTitle: 'Выбрать товар-подарок',
                  items,
                  selectedId: promo.action.type === 'gift_item' ? promo.action.giftItemId : '',
                })}
              </div>
            </div>

            <div class="${revealClass(actionType === 'bonus_points')}">
              <div class="prm-reveal-inner admin-form-stack">
                <label class="form-group">
                  <span class="avr-field-label">Тип начисления</span>
                  <select data-field="bonus-mode" class="avr-select">
                    <option value="points" ${bonusMode === 'points' ? 'selected' : ''}>Фиксированное количество баллов</option>
                    <option value="percent" ${bonusMode === 'percent' ? 'selected' : ''}>% кэшбэка баллами на счёт клиента</option>
                  </select>
                </label>
                <label class="form-group">
                  <span class="avr-field-label" data-bonus-value-label>
                    ${bonusMode === 'percent' ? 'Процент кэшбэка' : 'Количество баллов'}
                  </span>
                  <input type="number" class="avr-name-input" data-field="bonus-value" min="1"
                    max="${bonusMode === 'percent' ? '100' : '99999'}" step="1"
                    value="${escAttr(String(promo.action.type === 'bonus_points' ? promo.action.value : ''))}"
                    placeholder="${bonusMode === 'percent' ? '5' : '50'}" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderDetailPanel(promo) {
    return `
      <div class="avr-detail-panel" id="prm-detail-panel">
        ${renderAvrDetailStickyHead({
          title: isNew ? 'Новая акция' : 'Редактирование акции',
          cancelId: 'prm-detail-cancel',
          saveId: 'prm-save-btn',
          saveLabel: 'Сохранить акцию',
        })}
        <div class="avr-detail-body">
          <section class="prm-block card">
            <div class="prm-block-head">
              <span class="prm-block-badge prm-block-badge--basic">1</span>
              <h3 class="prm-block-title">Основное</h3>
            </div>
            <div class="prm-block-body admin-form-stack">
              <div class="admin-field-block">
                <label class="admin-field-label" for="prm-name">Название акции</label>
                <input id="prm-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(promo.name)}" maxlength="120" />
              </div>

              ${renderVisibilitySection(promo)}

              <div class="admin-field-block">
                <label class="admin-field-label" for="prm-schedule">Период действия (Расписание)</label>
                <select id="prm-schedule" data-field="availability-rule" class="admin-field-input">
                  ${renderScheduleOptions(promo.availabilityRuleId)}
                </select>
              </div>
            </div>
          </section>

          ${renderConditionBlock(promo)}
          ${renderActionBlock(promo)}

          <p class="ifm-error" id="prm-error" hidden></p>
        </div>

        ${!isNew ? `
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger avr-detail-danger">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="prm-delete-confirm" />
                <span>Я подтверждаю удаление этой акции</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="prm-detail-delete" disabled>
                Удалить акцию
              </button>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    isNew = false;
    render();
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">🎁</span>
        <p class="avr-detail-empty-title">Выберите акцию</p>
        <p class="avr-detail-empty-hint">Создайте новую акцию или выберите существующую из списка слева.</p>
      </div>
    `;
  }

  function renderListRow(promo) {
    const active = promo.id === selectedId;
    const deprioritized = isPromoDeprioritized(promo);
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''} ${deprioritized ? 'cgr-row--hidden' : ''}" data-id="${escAttr(promo.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${promoThumbHtml()}</span>
            <span class="avr-row-info">
              <span class="avr-row-name">${esc(promo.name)}</span>
              <span class="avr-row-meta">${listRowMetaHtml(promo)}</span>
            </span>
          </span>
          <span class="cgr-row-indicators">${channelIndicatorsHtml(promo)}</span>
        </button>
      </li>
    `;
  }

  function render() {
    const promo = selectedPromo();
    host.innerHTML = `
      <div class="avr-layout prm-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Акции (${promos.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="prm-create-btn">+ Новая акция</button>
          </div>
          <ul class="avr-list" id="prm-list">${renderListItemsHtml()}</ul>
          ${!promos.length ? '<p class="avr-list-empty">Нет акций. Создайте первую.</p>' : ''}
        </div>
        <aside class="avr-detail" aria-label="Редактор акции">
          ${promo ? renderDetailPanel(promo) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function setReveal(el, visible) {
    if (!el) return;
    el.classList.toggle('prm-reveal--visible', visible);
  }

  function refreshConditionBlock() {
    syncPanelToState();
    const promo = selectedPromo();
    const container = host.querySelector('[data-condition-fields]')?.closest('.prm-block');
    if (!promo || !container) return;
    const replacement = document.createElement('div');
    replacement.innerHTML = renderConditionBlock(sanitizePromoRuleFields(promo));
    container.replaceWith(replacement.firstElementChild);
    bindPanelEvents();
  }

  function refreshActionBlock() {
    syncPanelToState();
    const promo = selectedPromo();
    const blocks = host.querySelectorAll('.prm-block');
    const container = blocks[blocks.length - 1];
    if (!promo || !container) return;
    const replacement = document.createElement('div');
    replacement.innerHTML = renderActionBlock(sanitizePromoRuleFields(promo));
    container.replaceWith(replacement.firstElementChild);
    bindPanelEvents();
  }

  function updateDiscountGroupVisibility(panel) {
    const target = panel.querySelector('[data-field="discount-target"]')?.value || 'cart';
    setReveal(panel.querySelector('[data-discount-group-field]'), target === 'group');
    if (target !== 'group') {
      const groupSelect = panel.querySelector('[data-field="discount-group"]');
      if (groupSelect) groupSelect.value = '';
    }
    syncPanelToState();
  }

  function updateQtyTargetVisibility(panel) {
    const target = panel.querySelector('[data-field="qty-target-type"]')?.value || 'item';
    setReveal(panel.querySelector('[data-qty-item-field]'), target === 'item');
    setReveal(panel.querySelector('[data-qty-group-field]'), target === 'group');
    syncPanelToState();
  }

  function updateBonusLabel(panel) {
    const mode = panel.querySelector('[data-field="bonus-mode"]')?.value;
    const label = panel.querySelector('[data-bonus-value-label]');
    const input = panel.querySelector('[data-field="bonus-value"]');
    if (label) {
      label.textContent = mode === 'percent'
        ? 'Процент кэшбэка'
        : 'Количество баллов';
    }
    if (input) {
      input.max = mode === 'percent' ? '100' : '99999';
      input.placeholder = mode === 'percent' ? '5' : '50';
    }
  }

  function updateListRow(id, { resort = false } = {}) {
    if (resort) {
      refreshListOrder();
      return;
    }

    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const promo = promos.find(p => p.id === id);
    if (!row || !promo) return;

    const nameEl = row.querySelector('.avr-row-name');
    if (nameEl) nameEl.textContent = promo.name;

    row.querySelector('.avr-row-meta')?.replaceChildren();
    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.innerHTML = listRowMetaHtml(promo);

    const indicators = row.querySelector('.cgr-row-indicators');
    if (indicators) indicators.innerHTML = channelIndicatorsHtml(promo);

    row.classList.toggle('cgr-row--hidden', isPromoDeprioritized(promo));
  }

  function bindPanelEvents() {
    const panel = host.querySelector('#prm-detail-panel');
    if (!panel) return;

    bindProductPickerFields(panel, items, panelChange);

    panel.querySelectorAll('[data-promo-channel-mode]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        if (!selectedId) return;
        const { visibleInWeb, visibleInKiosk } = channelFlagsFromMode(btn.dataset.promoChannelMode);
        promos = promos.map(p => (
          p.id === selectedId ? { ...p, visibleInWeb, visibleInKiosk } : p
        ));
        syncPromoChannelTabs();
        updateListRow(selectedId, { resort: true });
      });
    });

    panel.querySelector('[data-field="trigger-type"]')?.addEventListener('change', () => {
      syncPanelToState();
      const promo = selectedPromo();
      if (promo) {
        promos = promos.map(p => (p.id === selectedId ? sanitizePromoRuleFields(promo) : p));
      }
      refreshConditionBlock();
      updateListRow(selectedId);
    });

    panel.querySelector('[data-field="qty-target-type"]')?.addEventListener('change', () => {
      updateQtyTargetVisibility(panel);
      updateListRow(selectedId);
    });

    panel.querySelector('[data-field="action-type"]')?.addEventListener('change', () => {
      syncPanelToState();
      const promo = selectedPromo();
      if (promo) {
        promos = promos.map(p => (p.id === selectedId ? sanitizePromoRuleFields(promo) : p));
      }
      refreshActionBlock();
      updateListRow(selectedId);
    });

    panel.querySelector('[data-field="discount-target"]')?.addEventListener('change', () => {
      updateDiscountGroupVisibility(panel);
      updateListRow(selectedId);
    });

    panel.querySelector('[data-field="bonus-mode"]')?.addEventListener('change', () => {
      updateBonusLabel(panel);
      panelChange();
    });

    panel.querySelectorAll('[data-client-group]').forEach(input => {
      input.addEventListener('change', e => {
        const chip = e.target.closest('.prm-chip');
        chip?.classList.toggle('prm-chip--active', e.target.checked);
        panelChange();
      });
    });

    panel.querySelector('[data-field="availability-rule"]')?.addEventListener('change', () => {
      syncPanelToState();
      updateListRow(selectedId, { resort: true });
    });

    panel.querySelectorAll('input:not([type="hidden"]), select').forEach(el => {
      if (el.matches(
        '[data-field="trigger-type"], [data-field="action-type"], [data-field="qty-target-type"], '
        + '[data-field="discount-target"], [data-field="bonus-mode"], [data-client-group], '
        + '[data-field="availability-rule"]',
      )) {
        return;
      }
      el.addEventListener('input', panelChange);
      el.addEventListener('change', panelChange);
    });
  }

  function bindEvents() {
    bindPanelEvents();

    host.querySelector('#prm-create-btn')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save,
        proceed: () => {
          const draft = createDefaultPromoRule(`draft-${Date.now()}`);
          promos.push(draft);
          selectedId = draft.id;
          isNew = true;
          render();
          requestAnimationFrame(() => {
            host.querySelector('[data-field="name"]')?.focus();
            host.querySelector('[data-field="name"]')?.select();
          });
        },
      });
    });

    host.querySelector('#prm-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const id = btn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save,
        proceed: () => {
          selectedId = id;
          isNew = false;
          render();
        },
      });
    });

    host.querySelector('#prm-save-btn')?.addEventListener('click', () => save());
    bindAvrDetailCancel(host, 'prm-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: () => save(),
      onClose: closeDetailPanel,
    });
    host.querySelector('#prm-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#prm-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#prm-detail-delete')?.addEventListener('click', () => deleteRule());
  }

  async function save() {
    syncPanelToState();
    const errEl = host.querySelector('#prm-error');
    if (errEl) errEl.hidden = true;

    const btn = host.querySelector('#prm-save-btn');
    if (btn) btn.disabled = true;

    try {
      const promo = selectedPromo();
      if (!promo) throw new Error('Выберите акцию');

      validatePromoRuleDoc(promo);
      const savedId = isNew ? '' : promo.id;
      const saved = await savePromoRule(promo, savedId);

      if (isNew) {
        promos = promos.filter(p => p.id !== selectedId);
      }
      promos = [...promos.filter(p => p.id !== saved.id), saved];
      selectedId = saved.id;
      isNew = false;
      commitBaseline();

      render();
      showToast('Акция сохранена');
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[promo-rules]', err);
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось сохранить акцию';
        errEl.hidden = false;
      }
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteRule() {
    const confirmEl = host.querySelector('#prm-delete-confirm');
    if (isNew || !selectedId || !confirmEl?.checked) return;

    const idToDelete = selectedId;
    const btn = host.querySelector('#prm-detail-delete');
    if (btn) btn.disabled = true;

    try {
      await deletePromoRule(idToDelete);
      promos = promos.filter(p => p.id !== idToDelete);
      selectedId = promos[0]?.id || null;
      isNew = false;
      commitBaseline();
      render();
      showToast('Акция удалена');
      await onSaved?.();
    } catch (err) {
      console.error('[promo-rules] delete', err);
      if (btn) {
        btn.disabled = !confirmEl.checked;
        btn.classList.toggle('cgr-detail-delete--active', confirmEl.checked);
      }
      const errEl = host.querySelector('#prm-error');
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось удалить акцию';
        errEl.hidden = false;
      }
    }
  }

  function destroy() {
    host.innerHTML = '';
  }

  render();
  return { destroy, isDirty };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
