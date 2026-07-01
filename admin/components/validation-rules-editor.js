import {
  ACTION_TYPE_OPTIONS,
  APPROACH_INTERVAL_OPTIONS,
  createDefaultValidationRule,
  DEFAULT_VALIDATION_DENIED_HEADLINE,
  formatValidationRuleActionShort,
  formatValidationRuleApproachShort,
  getDefaultValidationSuccessHeadline,
  normalizeValidationRuleDoc,
  resolveValidationDisplaySeconds,
  validateValidationRuleDoc,
} from '../../shared/validation-rules.js';
import {
  formatAvailabilityRuleShort,
  formatAvailabilityRuleSummary,
} from '../../shared/availability-rules.js';
import { deleteValidationRule, saveValidationRule } from '../services/validation-rules-data.js';
import { openUserGroupsPickerModal } from './user-groups-picker-modal.js';
import { openLunchStepProductsPickerModal } from './lunch-step-products-picker-modal.js';
import { showToast } from '../utils/toast.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';
import { productThumbHtml } from '../utils/product-image.js';
import { bindAvrDetailCancel, renderAvrDetailStickyHead, runWithUnsavedGuard } from '../utils/avr-unsaved-changes.js';
import { formatShiftTimeRange } from '../../shared/work-shifts.js';

const REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

const ACTION_TYPE_MODES = ACTION_TYPE_OPTIONS.map(o => ({
  id: o.id,
  label: o.label.split('(')[0].trim(),
}));

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/validation-rules.js').ValidationRuleDoc[]} p.rules
 * @param {Array<{ id: string, name: string }>} p.userGroups
 * @param {Array<{ id: string, name: string }>} p.wallets
 * @param {Array<{ id: string, name: string, category?: string }>} p.items
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} [p.availabilityRules]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createValidationRulesEditor(host, {
  rules: initialRules,
  userGroups,
  wallets,
  items,
  availabilityRules = [],
  workShifts = [],
  onSaved,
}) {
  /** @type {import('../../shared/validation-rules.js').ValidationRuleDoc[]} */
  let rules = initialRules.map(r => normalizeValidationRuleDoc(r, r.id));
  /** @type {string|null} */
  let selectedId = null;
  let isNew = false;

  /** @type {string} */
  let baselineJson = '';

  const groupsById = new Map(userGroups.map(g => [g.id, g.name]));
  const itemsById = new Map(items.map(i => [i.id, i.name]));
  const activeAvailabilityRules = availabilityRules.filter(r => r.status !== 'archived');
  const rulesMap = new Map(activeAvailabilityRules.map(r => [r.id, r]));

  function snapshot() {
    return JSON.stringify(
      rules.map(r => normalizeValidationRuleDoc(r, r.id)).sort((a, b) => a.id.localeCompare(b.id)),
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
    rules = JSON.parse(baselineJson);
    isNew = false;
    if (selectedId && !rules.some(r => r.id === selectedId)) {
      selectedId = firstListRuleId();
    }
  }

  commitBaseline();

  function selectedRule() {
    return rules.find(r => r.id === selectedId) || null;
  }

  /** @param {number} n @param {string} one @param {string} few @param {string} many */
  function pluralRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function groupsCountLabel(count) {
    return `${count} ${pluralRu(count, 'группа', 'группы', 'групп')}`;
  }

  function itemsCountLabel(count) {
    return `${count} ${pluralRu(count, 'товар', 'товара', 'товаров')}`;
  }

  function isRuleDeprioritized(rule) {
    return rule.isActive === false;
  }

  function partitionRulesForList() {
    const active = rules.filter(r => !isRuleDeprioritized(r));
    const inactive = rules.filter(r => isRuleDeprioritized(r));
    return { active, inactive };
  }

  function firstListRuleId() {
    const { active, inactive } = partitionRulesForList();
    return active[0]?.id || inactive[0]?.id || null;
  }

  function renderHiddenRulesDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Неактивные правила (${count}) —</span>
      </li>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function audienceMetaHtml(rule) {
    const ids = rule.targetUserGroupIds || [];
    if (!ids.length) {
      return '<span class="vld-row-meta-audience vld-row-meta-audience--empty">Аудитория не задана</span>';
    }

    const names = ids.map(id => groupsById.get(id) || id);
    const maxVisible = 2;
    const parts = [];
    names.slice(0, maxVisible).forEach((name, index) => {
      if (index > 0) parts.push('<span class="vld-row-meta-sep" aria-hidden="true">·</span>');
      parts.push(`<span class="vld-row-meta-group">${esc(name)}</span>`);
    });
    if (names.length > maxVisible) {
      parts.push('<span class="vld-row-meta-sep" aria-hidden="true">·</span>');
      parts.push(`<span class="vld-row-meta-more">+${names.length - maxVisible}</span>`);
    }
    return `<span class="vld-row-meta-audience">${parts.join('')}</span>`;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderValidationListRowTags(rule) {
    const tags = [
      `<span class="sch-row-tag">${esc(formatValidationRuleApproachShort(rule))}</span>`,
      `<span class="sch-row-tag vld-row-tag--action">${esc(formatValidationRuleActionShort(rule))}</span>`,
    ];

    const availId = rule.availabilityRuleId;
    if (availId) {
      const avRule = rulesMap.get(availId);
      tags.push(`<span class="sch-row-tag vld-row-tag--schedule">${esc(avRule?.name || 'По расписанию')}</span>`);
    } else if (rule.scheduleTemplate) {
      tags.push('<span class="sch-row-tag vld-row-tag--schedule">По шаблону</span>');
    }

    return `<span class="vld-row-meta-tags sch-row-tags">${tags.join('')}</span>`;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderValidationListRowBody(rule) {
    return `
      <span class="vld-row-body">
        ${audienceMetaHtml(rule)}
        ${renderValidationListRowTags(rule)}
      </span>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderRuleStatusIndicator(rule) {
    const active = !isRuleDeprioritized(rule);
    if (active) {
      return `
        <span class="vld-row-status sch-row-status-wrap" title="Правило активно">
          <span class="prm-row-status prm-row-status--on" aria-hidden="true"></span>
          <span class="products-channel-label">Активно</span>
        </span>
      `;
    }
    return `
      <span class="vld-row-status sch-row-status-wrap" title="Правило на паузе">
        <span class="prm-row-status prm-row-status--off" aria-hidden="true"></span>
        <span class="products-channel-label products-channel-label--off">Пауза</span>
      </span>
    `;
  }

  function renderListItemsHtml() {
    const { active, inactive } = partitionRulesForList();
    return [
      ...active.map(r => renderListRow(r)),
      renderHiddenRulesDivider(inactive.length),
      ...inactive.map(r => renderListRow(r)),
    ].join('');
  }

  function syncPanelToState() {
    const panel = host.querySelector('#vld-detail-panel');
    if (!selectedId || !panel) return;

    const actionType = panel.querySelector('[data-vld-action].period-tab--active')?.dataset.vldAction
      || 'meal_set';

    const draft = normalizeValidationRuleDoc({
      id: selectedId,
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      targetUserGroupIds: readGroupIds(panel),
      availabilityRuleId: panel.querySelector('[data-field="availability-rule-id"]')?.value || null,
      approachLimit: Number(panel.querySelector('[data-field="approach-limit"]')?.value) || 1,
      approachInterval: panel.querySelector('[data-field="approach-interval"]')?.value || 'day',
      approachPeriodStart: panel.querySelector('[data-field="approach-period-start"]')?.value || null,
      approachPeriodEnd: panel.querySelector('[data-field="approach-period-end"]')?.value || null,
      approachNumber: Number(panel.querySelector('[data-field="approach-number"]')?.value) || 1,
      actionType,
      itemIds: readItemIds(panel),
      amount: Number(panel.querySelector('[data-field="amount"]')?.value) || 0,
      walletId: panel.querySelector('[data-field="wallet-id"]')?.value || 'dotation',
      allowOverdraft: panel.querySelector('[data-field="allow-overdraft"]')?.checked === true,
      isActive: panel.querySelector('[data-field="is-active"]')?.checked !== false,
      resultDisplaySeconds: Number(panel.querySelector('[data-field="result-display-seconds"]')?.value)
        || resolveValidationDisplaySeconds(null),
      successHeadline: panel.querySelector('[data-field="success-headline"]')?.value.trim() || null,
      deniedHeadline: panel.querySelector('[data-field="denied-headline"]')?.value.trim() || null,
    }, selectedId);

    rules = rules.map(r => (r.id === selectedId ? draft : r));
  }

  function readGroupIds(panel) {
    return [...panel.querySelectorAll('[data-vld-group-id]')]
      .map(el => el.dataset.vldGroupId)
      .filter(Boolean);
  }

  function readItemIds(panel) {
    return [...panel.querySelectorAll('[data-vld-item-id]')]
      .map(el => el.dataset.vldItemId)
      .filter(Boolean);
  }

  function panelChange() {
    syncPanelToState();
    updateListRowMeta(selectedId, { resort: false });
  }

  function revealClass(visible) {
    return `vld-reveal ${visible ? 'vld-reveal--visible' : ''}`;
  }

  function toggleActionReveal(panel, actionType) {
    panel.querySelectorAll('.vld-reveal').forEach(el => {
      const isMeal = el.querySelector('#vld-items-list');
      const isMoney = el.querySelector('[data-field="amount"]');
      const visible = (actionType === 'meal_set' && isMeal) || (actionType === 'money' && isMoney);
      el.classList.toggle('vld-reveal--visible', visible);
    });
  }

  /** @param {string[]} groupIds */
  function renderGroupCapsules(groupIds) {
    if (!groupIds.length) {
      return '<p class="cgr-group-products-empty">Группы клиентов не выбраны. Добавьте целевую аудиторию правила.</p>';
    }
    return groupIds.map(id => `
      <div class="cgr-product-capsule" data-vld-group-id="${escAttr(id)}">
        <span class="cgr-product-capsule__name">${esc(groupsById.get(id) || id)}</span>
        <button
          type="button"
          class="cgr-product-capsule__remove btn-press"
          data-action="remove-group"
          data-group-id="${escAttr(id)}"
          title="Убрать группу"
          aria-label="Убрать «${escAttr(groupsById.get(id) || id)}»"
        >${REMOVE_ICON}</button>
      </div>
    `).join('');
  }

  /** @param {string[]} itemIds */
  function renderItemCapsules(itemIds) {
    if (!itemIds.length) {
      return '<p class="cgr-group-products-empty">Товары не выбраны. Добавьте позиции для списания пайки.</p>';
    }
    return itemIds.map(id => `
      <div class="cgr-product-capsule" data-vld-item-id="${escAttr(id)}">
        <span class="cgr-product-capsule__name">${esc(itemsById.get(id) || id)}</span>
        <button
          type="button"
          class="cgr-product-capsule__remove btn-press"
          data-action="remove-item"
          data-item-id="${escAttr(id)}"
          title="Убрать товар"
          aria-label="Убрать «${escAttr(itemsById.get(id) || id)}»"
        >${REMOVE_ICON}</button>
      </div>
    `).join('');
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderActiveSection(rule) {
    return `
      <div class="sch-fieldset vld-active-section" id="vld-active-section">
        <span class="sch-fieldset__legend">Активность</span>
        <div class="vld-active-row">
          ${renderActiveToggle(rule)}
        </div>
      </div>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderAudienceSection(rule) {
    const count = rule.targetUserGroupIds.length;
    return `
      <div class="admin-field-block">
        <div class="cgr-products-head">
          <span class="admin-field-label">Целевая аудитория</span>
          <span class="cgr-products-count" id="vld-groups-count">${groupsCountLabel(count)}</span>
        </div>
        <div class="cgr-products-panel">
          <div class="cgr-group-products-toolbar">
            <button type="button" class="btn btn-outline btn-press products-create-btn" data-action="add-groups">
              + Добавить группы
            </button>
          </div>
          <div class="catm-products-list cgr-products-list" id="vld-groups-list">
            ${renderGroupCapsules(rule.targetUserGroupIds)}
          </div>
        </div>
      </div>
    `;
  }

  function toggleIntervalReveal(panel, interval) {
    const periodReveal = panel.querySelector('#vld-approach-period-reveal');
    const shiftReveal = panel.querySelector('#vld-approach-shift-reveal');
    if (periodReveal) periodReveal.classList.toggle('vld-reveal--visible', interval === 'period');
    if (shiftReveal) shiftReveal.classList.toggle('vld-reveal--visible', interval === 'shift');
  }

  function renderShiftIntervalHint() {
    if (!workShifts.length) {
      return `
        <p class="sch-fieldset__hint">
          Лимит подходов сбрасывается в начале рабочей смены каждого клиента.
          Назначьте смену в карточке клиента или в справочнике
          <a class="wsh-calendar-link" href="#/work-shifts">«Рабочие смены»</a>.
        </p>
      `;
    }
    const rows = workShifts.map(s => `
      <li><strong>${esc(s.name)}</strong> — ${esc(formatShiftTimeRange(s))}${s.crossesMidnight ? ' · ночная' : ''}</li>
    `).join('');
    return `
      <p class="sch-fieldset__hint">
        Интервал «В смену» берётся из рабочей смены клиента (поле в карточке CRM).
        Счётчик подходов обнуляется в начале каждого рабочего интервала.
      </p>
      <ul class="vld-shift-ref-list">${rows}</ul>
      <p class="sch-fieldset__hint">
        <a class="wsh-calendar-link" href="#/work-shifts">Справочник рабочих смен →</a>
      </p>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderTriggerSection(rule) {
    const showPeriod = rule.approachInterval === 'period';
    const showShift = rule.approachInterval === 'shift';
    return `
      <div class="admin-field-block">
        <span class="admin-field-label">Условия срабатывания</span>
        <div class="admin-form-stack">
          <div class="admin-channel-grid vld-trigger-grid">
            <div class="admin-channel-field">
              <label class="admin-field-label" for="vld-approach-limit">Лимит подходов</label>
              <input id="vld-approach-limit" type="number" class="admin-field-input" data-field="approach-limit"
                min="1" step="1" value="${escAttr(String(rule.approachLimit))}" />
            </div>
            <div class="admin-channel-field">
              <label class="admin-field-label" for="vld-approach-interval">В интервал времени</label>
              <select id="vld-approach-interval" class="admin-field-input" data-field="approach-interval">
                ${APPROACH_INTERVAL_OPTIONS.map(o => `
                  <option value="${escAttr(o.id)}" ${rule.approachInterval === o.id ? 'selected' : ''}>
                    ${esc(o.label)}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
          <div class="${revealClass(showPeriod)}" id="vld-approach-period-reveal">
            <div class="vld-reveal-inner">
              <div class="admin-channel-grid vld-trigger-grid">
                <div class="admin-channel-field">
                  <label class="admin-field-label" for="vld-approach-period-start">Дата начала периода</label>
                  <input id="vld-approach-period-start" type="date" class="admin-field-input"
                    data-field="approach-period-start" value="${escAttr(rule.approachPeriodStart || '')}" />
                </div>
                <div class="admin-channel-field">
                  <label class="admin-field-label" for="vld-approach-period-end">Дата окончания периода</label>
                  <input id="vld-approach-period-end" type="date" class="admin-field-input"
                    data-field="approach-period-end" value="${escAttr(rule.approachPeriodEnd || '')}" />
                </div>
              </div>
            </div>
          </div>
          <div class="${revealClass(showShift)}" id="vld-approach-shift-reveal">
            <div class="vld-reveal-inner vld-shift-ref">
              ${renderShiftIntervalHint()}
            </div>
          </div>
          <div class="admin-field-block">
            <label class="admin-field-label" for="vld-approach-number">Срабатывать на подход №</label>
            <input id="vld-approach-number" type="number" class="admin-field-input" data-field="approach-number"
              min="1" step="1" value="${escAttr(String(rule.approachNumber))}" />
          </div>
        </div>
      </div>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderActiveToggle(rule) {
    const isActive = rule.isActive !== false;
    return `
      <label class="avr-active-toggle" title="${isActive ? 'Приостановить правило' : 'Активировать правило'}">
        <input type="checkbox" data-field="is-active" ${isActive ? 'checked' : ''} />
        <span class="avr-switch" aria-hidden="true"></span>
        <span class="avr-active-label">${isActive ? 'Активно' : 'Пауза'}</span>
      </label>
    `;
  }

  function syncActiveToggleLabel(panel = host.querySelector('#vld-detail-panel')) {
    const input = panel?.querySelector('[data-field="is-active"]');
    if (!input) return;
    const active = input.checked;
    const toggle = input.closest('.avr-active-toggle');
    const label = toggle?.querySelector('.avr-active-label');
    if (label) label.textContent = active ? 'Активно' : 'Пауза';
    toggle?.setAttribute('title', active ? 'Приостановить правило' : 'Активировать правило');
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderScheduleSection(rule) {
    const selected = rule.availabilityRuleId || '';
    const selectedRule = selected ? rulesMap.get(selected) : null;
    const summary = selectedRule ? formatAvailabilityRuleSummary(selectedRule) : '';

    return `
      <div class="sch-fieldset" id="vld-schedule-section">
        <span class="sch-fieldset__legend">Расписание</span>
        <select id="vld-schedule-id" class="admin-field-input cgr-avail-select" data-field="availability-rule-id">
          <option value="" ${!selected ? 'selected' : ''}>Без ограничений (круглосуточно)</option>
          ${activeAvailabilityRules.map(r => `
            <option value="${escAttr(r.id)}" ${r.id === selected ? 'selected' : ''}>
              ${esc(r.name)} — ${esc(formatAvailabilityRuleShort(r))}
            </option>
          `).join('')}
        </select>
        <p class="cgr-avail-rule-summary" id="vld-schedule-summary" ${summary ? '' : 'hidden'}>${esc(summary)}</p>
      </div>
    `;
  }

  function refreshScheduleSummary() {
    const rule = selectedRule();
    const summaryEl = host.querySelector('#vld-schedule-summary');
    if (!summaryEl) return;
    const availRule = rule?.availabilityRuleId ? rulesMap.get(rule.availabilityRuleId) : null;
    const summary = availRule ? formatAvailabilityRuleSummary(availRule) : '';
    summaryEl.textContent = summary;
    summaryEl.hidden = !summary;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderDisplaySection(rule) {
    const defaultSuccess = getDefaultValidationSuccessHeadline(rule);
    const displaySec = resolveValidationDisplaySeconds(rule);
    const successCustom = rule.successHeadline || '';
    const deniedCustom = rule.deniedHeadline || '';

    return `
      <div class="sch-fieldset vld-display-fieldset" id="vld-display-section">
        <span class="sch-fieldset__legend">Экран терминала</span>
        <p class="sch-fieldset__hint">
          Настройте, как долго показывать табличку результата и какие заголовки видит оператор на экране «Разрешено» / «Запрещено».
        </p>

        <div class="admin-field-block vld-display-duration">
          <label class="admin-field-label" for="vld-display-seconds">Время показа результата, сек</label>
          <input
            id="vld-display-seconds"
            type="number"
            class="admin-field-input vld-display-seconds-input"
            data-field="result-display-seconds"
            min="3"
            max="60"
            step="1"
            value="${escAttr(String(displaySec))}"
          />
          <p class="sch-fieldset__hint">От 3 до 60 секунд. После этого экран вернётся к «Приложите пропуск».</p>
        </div>

        <div class="vld-display-messages">
          <div class="admin-field-block vld-display-message">
            <label class="admin-field-label" for="vld-success-headline">Заголовок «Разрешено»</label>
            <p class="vld-display-default" id="vld-success-headline-default">
              Типовое: <span class="vld-display-default-text">${esc(defaultSuccess)}</span>
            </p>
            <input
              id="vld-success-headline"
              type="text"
              class="admin-field-input"
              data-field="success-headline"
              maxlength="160"
              placeholder="${escAttr(defaultSuccess)}"
              value="${escAttr(successCustom)}"
            />
            <p class="sch-fieldset__hint">Оставьте пустым, чтобы использовать типовое сообщение для выбранного типа списания.</p>
          </div>

          <div class="admin-field-block vld-display-message">
            <label class="admin-field-label" for="vld-denied-headline">Заголовок «Запрещено»</label>
            <p class="vld-display-default" id="vld-denied-headline-default">
              Типовое: <span class="vld-display-default-text">${esc(DEFAULT_VALIDATION_DENIED_HEADLINE)}</span>
            </p>
            <input
              id="vld-denied-headline"
              type="text"
              class="admin-field-input"
              data-field="denied-headline"
              maxlength="160"
              placeholder="${escAttr(DEFAULT_VALIDATION_DENIED_HEADLINE)}"
              value="${escAttr(deniedCustom)}"
            />
            <p class="sch-fieldset__hint">Текст причины отказа (лимит, расписание и т.д.) формируется автоматически под ситуацию.</p>
          </div>
        </div>
      </div>
    `;
  }

  function refreshDisplayDefaultHints() {
    const rule = selectedRule();
    const panel = host.querySelector('#vld-detail-panel');
    if (!rule || !panel) return;

    const defaultSuccess = getDefaultValidationSuccessHeadline(rule);
    panel.querySelector('#vld-success-headline-default .vld-display-default-text')
      ?.replaceChildren(document.createTextNode(defaultSuccess));
    const successInput = panel.querySelector('[data-field="success-headline"]');
    if (successInput) successInput.placeholder = defaultSuccess;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderActionSection(rule) {
    const actionType = rule.actionType || 'meal_set';
    const count = rule.itemIds.length;

    return `
      ${renderChannelAvailabilityGrid({
        id: 'vld-action-section',
        mode: actionType,
        modes: ACTION_TYPE_MODES,
        modeDataAttr: 'data-vld-action',
        fieldLabel: 'Тип списания',
        ariaLabel: 'Тип списания',
        showOrderFields: false,
      })}

      <div class="${revealClass(actionType === 'meal_set')}">
        <div class="vld-reveal-inner admin-field-block">
          <div class="cgr-products-head">
            <span class="admin-field-label">Товары для списания</span>
            <span class="cgr-products-count" id="vld-items-count">${itemsCountLabel(count)}</span>
          </div>
          <div class="cgr-products-panel">
            <div class="cgr-group-products-toolbar">
              <button type="button" class="btn btn-outline btn-press products-create-btn" data-action="add-items">
                + Добавить товары
              </button>
            </div>
            <div class="catm-products-list cgr-products-list" id="vld-items-list">
              ${renderItemCapsules(rule.itemIds)}
            </div>
          </div>
        </div>
      </div>

      <div class="${revealClass(actionType === 'money')}">
        <div class="vld-reveal-inner admin-form-stack">
          <div class="admin-field-block">
            <label class="admin-field-label" for="vld-amount">Сумма, ₽</label>
            <input id="vld-amount" type="number" class="admin-field-input" data-field="amount"
              min="1" step="1" value="${escAttr(String(rule.amount || ''))}" placeholder="300" />
          </div>
          <div class="admin-field-block">
            <label class="admin-field-label" for="vld-wallet">Кошелёк</label>
            <select id="vld-wallet" class="admin-field-input" data-field="wallet-id">
              ${wallets.map(w => `
                <option value="${escAttr(w.id)}" ${rule.walletId === w.id ? 'selected' : ''}>
                  ${esc(w.name)}
                </option>
              `).join('')}
            </select>
          </div>
          <label class="cgr-schedule-toggle cgr-schedule-toggle--block">
            <input type="checkbox" data-field="allow-overdraft" ${rule.allowOverdraft ? 'checked' : ''} />
            <span>Разрешить уход в минус (Овердрафт)</span>
          </label>
        </div>
      </div>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderDetailPanel(rule) {
    return `
      <div class="avr-detail-panel" id="vld-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование правила',
          cancelId: 'vld-detail-cancel',
          saveId: 'vld-detail-save',
          saveLabel: 'Сохранить изменения',
        })}
        <div class="avr-detail-body cgr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="vld-name">Название правила</label>
              <input
                id="vld-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(rule.name)}"
                maxlength="120"
                placeholder="Комплексный обед (1 раз в день)"
              />
            </div>

            ${renderAudienceSection(rule)}

            ${renderActiveSection(rule)}

            ${renderScheduleSection(rule)}

            ${renderTriggerSection(rule)}
            ${renderActionSection(rule)}
            ${renderDisplaySection(rule)}
          </div>
          <p class="ifm-error" id="vld-error" hidden></p>
        </div>

        ${!isNew ? `
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="vld-delete-confirm" />
                <span>Я подтверждаю удаление этого правила</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="vld-detail-delete" disabled>
                Удалить правило
              </button>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">🎫</span>
        <p class="avr-detail-empty-title">Выберите правило</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить правило» слева или выберите правило из списка, чтобы настроить аудиторию, условия и списание.</p>
      </div>
    `;
  }

  /** @param {import('../../shared/validation-rules.js').ValidationRuleDoc} rule */
  function renderListRow(rule) {
    const active = rule.id === selectedId;
    const deprioritized = isRuleDeprioritized(rule);
    return `
      <li class="avr-row avr-row--thumb avr-row--vld ${active ? 'avr-row--active' : ''} ${deprioritized ? 'cgr-row--hidden' : ''}" data-id="${escAttr(rule.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${productThumbHtml({ name: rule.name })}</span>
            <span class="avr-row-info vld-row-info">
              <span class="vld-row-head">
                <span class="avr-row-name">${esc(rule.name)}</span>
                ${renderRuleStatusIndicator(rule)}
              </span>
              ${renderValidationListRowBody(rule)}
            </span>
          </span>
        </button>
      </li>
    `;
  }

  /** @param {string|null} id @param {{ resort?: boolean }} [opts] */
  function updateListRowMeta(id, { resort = false } = {}) {
    if (resort) {
      const list = host.querySelector('#vld-list');
      if (list) list.innerHTML = renderListItemsHtml();
      return;
    }

    const rule = rules.find(r => r.id === id);
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id || '')}"]`);
    if (!rule || !row) return;

    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(rule.name));
    const statusEl = row.querySelector('.vld-row-head .vld-row-status');
    if (statusEl) statusEl.outerHTML = renderRuleStatusIndicator(rule);
    const bodyEl = row.querySelector('.vld-row-body');
    if (bodyEl) bodyEl.outerHTML = renderValidationListRowBody(rule);
    row.classList.toggle('cgr-row--hidden', isRuleDeprioritized(rule));
    row.querySelector('.avr-row-thumb')?.replaceChildren();
    row.querySelector('.avr-row-thumb')?.insertAdjacentHTML(
      'afterbegin',
      productThumbHtml({ name: rule.name }),
    );
  }

  function render() {
    const rule = selectedRule();
    host.innerHTML = `
      <div class="avr-layout cgr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Правила (${rules.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="vld-create">
              + Добавить правило
            </button>
          </div>
          <ul class="avr-list" id="vld-list">${renderListItemsHtml()}</ul>
          ${!rules.length ? '<p class="avr-list-empty">Нет правил. Создайте первое.</p>' : ''}
          <p class="ifm-error" id="vld-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Настройки правила">
          ${rule ? renderDetailPanel(rule) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function closeDetailPanel() {
    if (isNew) {
      rules = rules.filter(r => r.id !== selectedId);
    }
    selectedId = null;
    isNew = false;
    render();
  }

  function bindEvents() {
    host.querySelector('#vld-create')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: saveRule,
        proceed: () => {
          const draft = createDefaultValidationRule(`vld-${Date.now()}`);
          rules = [...rules, draft];
          selectedId = draft.id;
          isNew = true;
          render();
        },
      });
    });

    host.querySelector('#vld-list')?.addEventListener('click', e => {
      const selectBtn = e.target.closest('[data-action="select"]');
      if (!selectBtn) return;
      const id = selectBtn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: saveRule,
        proceed: () => {
          selectedId = id;
          isNew = false;
          render();
        },
      });
    });

    host.querySelector('#vld-detail-save')?.addEventListener('click', () => saveRule());
    bindAvrDetailCancel(host, 'vld-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: saveRule,
      onClose: closeDetailPanel,
    });

    host.querySelector('#vld-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#vld-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#vld-detail-delete')?.addEventListener('click', () => deleteRule());

    const panel = host.querySelector('#vld-detail-panel');
    if (!panel) return;

    panel.addEventListener('input', e => {
      if (e.target.matches('[data-field="name"]')) {
        panelChange();
        return;
      }
      if (e.target.matches('[data-field]')) panelChange();
    });

    panel.addEventListener('change', e => {
      if (e.target.matches('[data-field]')) {
        panelChange();
        if (e.target.matches('[data-field="is-active"]')) {
          syncActiveToggleLabel(panel);
          updateListRowMeta(selectedId, { resort: true });
        }
        if (e.target.matches('[data-field="availability-rule-id"]')) {
          refreshScheduleSummary();
        }
        if (e.target.matches('[data-field="approach-interval"]')) {
          toggleIntervalReveal(panel, e.target.value);
        }
      }
    });

    panel.addEventListener('click', e => {
      const actionBtn = e.target.closest('[data-vld-action]');
      if (actionBtn && selectedId) {
        e.preventDefault();
        panel.querySelectorAll('[data-vld-action]').forEach(btn => {
          const active = btn === actionBtn;
          btn.classList.toggle('period-tab--active', active);
          btn.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        panelChange();
        toggleActionReveal(panel, actionBtn.dataset.vldAction || 'meal_set');
        refreshDisplayDefaultHints();
        return;
      }

      if (e.target.closest('[data-action="add-groups"]')) {
        syncPanelToState();
        const rule = selectedRule();
        openUserGroupsPickerModal({
          title: 'Выбор групп клиентов',
          selectedIds: rule?.targetUserGroupIds || [],
          groups: userGroups,
          onApplied: ids => {
            rules = rules.map(r => r.id === selectedId ? { ...r, targetUserGroupIds: ids } : r);
            render();
          },
        });
        return;
      }

      if (e.target.closest('[data-action="add-items"]')) {
        syncPanelToState();
        const rule = selectedRule();
        openLunchStepProductsPickerModal({
          stepName: 'Списание пайки',
          selectedIds: rule?.itemIds || [],
          items,
          onApplied: ids => {
            rules = rules.map(r => r.id === selectedId ? { ...r, itemIds: ids } : r);
            render();
          },
        });
        return;
      }

      const removeGroup = e.target.closest('[data-action="remove-group"]');
      if (removeGroup) {
        const gid = removeGroup.dataset.groupId;
        rules = rules.map(r => r.id === selectedId
          ? { ...r, targetUserGroupIds: r.targetUserGroupIds.filter(x => x !== gid) }
          : r);
        render();
        return;
      }

      const removeItem = e.target.closest('[data-action="remove-item"]');
      if (removeItem) {
        const iid = removeItem.dataset.itemId;
        rules = rules.map(r => r.id === selectedId
          ? { ...r, itemIds: r.itemIds.filter(x => x !== iid) }
          : r);
        render();
      }
    });
  }

  async function saveRule() {
    syncPanelToState();
    const rule = selectedRule();
    const errEl = host.querySelector('#vld-error');
    if (!rule) return false;

    const errors = validateValidationRuleDoc(rule);
    if (errors.length) {
      if (errEl) {
        errEl.textContent = errors[0];
        errEl.hidden = false;
      }
      return false;
    }
    if (errEl) errEl.hidden = true;

    try {
      const saved = await saveValidationRule(rule, isNew ? '' : rule.id);
      rules = rules.map(r => (r.id === rule.id ? saved : r));
      selectedId = saved.id;
      isNew = false;
      commitBaseline();
      showToast('Правило сохранено');
      await onSaved?.();
      render();
      return true;
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Ошибка сохранения';
        errEl.hidden = false;
      }
      return false;
    }
  }

  async function deleteRule() {
    const rule = selectedRule();
    if (!rule || isNew) return;
    try {
      await deleteValidationRule(rule.id);
      rules = rules.filter(r => r.id !== rule.id);
      selectedId = null;
      commitBaseline();
      showToast('Правило удалено');
      await onSaved?.();
      render();
    } catch (err) {
      showToast(err.message || 'Не удалось удалить');
    }
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
  };
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}
