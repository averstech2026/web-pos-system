import {
  AVAIL_DAY_UI_ORDER,
  AVAIL_DAY_LABELS,
  createDefaultAvailabilityRuleDoc,
  createDefaultCondition,
  filterActiveRules,
  formatAvailabilityRuleShort,
  getRuleDirectUsage,
  isRuleArchived,
  isRuleInUse,
  normalizeAvailabilityRuleDoc,
  validateAvailabilityRuleDoc,
} from '../../shared/availability-rules.js';
import {
  archiveAvailabilityRule,
  deleteAvailabilityRule,
  saveAvailabilityRule,
} from '../services/availability-rules-data.js';
import { showToast } from '../utils/toast.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.rules
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} [p.categoryGroups]
 * @param {Array<{ id: string, name?: string, availabilityRuleId?: string|null }>} [p.items]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createAvailabilityRulesEditor(host, {
  rules: initialRules,
  categoryGroups = [],
  items = [],
  onSaved,
}) {
  /** @type {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} */
  let rules = initialRules.map(r => normalizeAvailabilityRuleDoc(r, r.id));
  /** @type {import('../../shared/menu-catalog.js').CategoryGroup[]} */
  let groups = [...categoryGroups];
  /** @type {Array<{ id: string, name?: string, availabilityRuleId?: string|null }>} */
  let catalogItems = [...items];
  /** @type {string|null} */
  let selectedId = filterActiveRules(rules)[0]?.id || null;
  /** @type {boolean} */
  let isNew = false;

  function activeRules() {
    return filterActiveRules(rules);
  }

  function selectedRule() {
    return rules.find(r => r.id === selectedId) || null;
  }

  function readConditionsFromPanel(panel) {
    return [...panel.querySelectorAll('.avr-condition-row')].map(row => ({
      type: row.querySelector('[data-field="type"]')?.value === 'deny' ? 'deny' : 'allow',
      isActive: row.querySelector('[data-field="is-active"]')?.checked !== false,
      days: [...row.querySelectorAll('.avr-day-chip--active')].map(btn => Number(btn.dataset.day)),
      timeStart: row.querySelector('[data-field="time-start"]')?.value || null,
      timeEnd: row.querySelector('[data-field="time-end"]')?.value || null,
      dateStart: row.querySelector('[data-field="date-start"]')?.value || null,
      dateEnd: row.querySelector('[data-field="date-end"]')?.value || null,
    }));
  }

  function syncPanelToState() {
    const panel = host.querySelector('#avr-detail-panel');
    if (!selectedId || !panel) return;

    const updated = normalizeAvailabilityRuleDoc({
      id: selectedId,
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      status: rules.find(r => r.id === selectedId)?.status || 'active',
      conditions: readConditionsFromPanel(panel),
    }, selectedId);

    rules = rules.map(r => (r.id === selectedId ? updated : r));
  }

  function renderConditionRow(cond, index) {
    const isActive = cond.isActive !== false;
    const dateEnabled = !!(cond.dateStart || cond.dateEnd);
    const timeEnabled = !!(cond.timeStart && cond.timeEnd);

    return `
      <div class="avr-condition-row ${isActive ? '' : 'avr-condition-row--inactive'}" data-index="${index}">
        <div class="avr-condition-head">
          <label class="avr-condition-type">
            <span class="avr-field-label">Действие</span>
            <select data-field="type" class="avr-select" ${isActive ? '' : 'disabled'}>
              <option value="allow" ${cond.type === 'allow' ? 'selected' : ''}>Разрешить доступ</option>
              <option value="deny" ${cond.type === 'deny' ? 'selected' : ''}>Запретить / Скрыть</option>
            </select>
          </label>
          <label class="avr-active-toggle" title="${isActive ? 'Приостановить условие' : 'Активировать условие'}">
            <input type="checkbox" data-field="is-active" ${isActive ? 'checked' : ''} />
            <span class="avr-switch" aria-hidden="true"></span>
            <span class="avr-active-label">${isActive ? 'Активно' : 'Пауза'}</span>
          </label>
        </div>
        <div class="avr-condition-body">
          <div class="avr-condition-block">
            <span class="avr-field-label">Дни недели</span>
            <div class="avr-day-chips" role="group" aria-label="Дни недели">
              ${AVAIL_DAY_UI_ORDER.map(day => `
                <button
                  type="button"
                  class="avr-day-chip btn-press ${cond.days.includes(day) ? 'avr-day-chip--active' : ''}"
                  data-day="${day}"
                  aria-pressed="${cond.days.includes(day)}"
                  ${isActive ? '' : 'disabled'}
                >${AVAIL_DAY_LABELS[day]}</button>
              `).join('')}
            </div>
          </div>
          <div class="avr-condition-block">
            <span class="avr-field-label">Время</span>
            <div class="avr-time-row">
              <label class="avr-time-field">
                <span>с</span>
                <input type="time" data-field="time-start" value="${escAttr(cond.timeStart || '')}" ${timeEnabled && isActive ? '' : 'disabled'} />
              </label>
              <label class="avr-time-field">
                <span>до</span>
                <input type="time" data-field="time-end" value="${escAttr(cond.timeEnd || '')}" ${timeEnabled && isActive ? '' : 'disabled'} />
              </label>
              <label class="avr-time-toggle">
                <input type="checkbox" data-field="time-enabled" ${timeEnabled ? 'checked' : ''} ${isActive ? '' : 'disabled'} />
                <span>Ограничить по времени</span>
              </label>
            </div>
          </div>
          <div class="avr-condition-block">
            <label class="avr-date-toggle">
              <input type="checkbox" data-field="date-enabled" ${dateEnabled ? 'checked' : ''} ${isActive ? '' : 'disabled'} />
              <span>Ограничить период дат</span>
            </label>
            <div class="avr-date-row" data-date-fields ${dateEnabled ? '' : 'hidden'}>
              <label class="avr-time-field">
                <span>с</span>
                <input type="date" data-field="date-start" value="${escAttr(cond.dateStart || '')}" ${isActive ? '' : 'disabled'} />
              </label>
              <label class="avr-time-field">
                <span>до</span>
                <input type="date" data-field="date-end" value="${escAttr(cond.dateEnd || '')}" ${isActive ? '' : 'disabled'} />
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderUsageBlock(ruleId) {
    const { groups: linkedGroups, items: linkedItems } = getRuleDirectUsage(ruleId, groups, catalogItems);
    const hasUsage = linkedGroups.length > 0 || linkedItems.length > 0;

    if (!hasUsage) {
      return `
        <div class="avr-usage avr-usage--empty" id="avr-usage-section">
          <h3 class="avr-usage-title">Используется в объектах</h3>
          <p class="avr-usage-empty">Данный шаблон пока не назначен ни одной группе или товару.</p>
        </div>
      `;
    }

    const tags = [
      ...linkedGroups.map(g => `
        <span class="avr-usage-tag avr-usage-tag--group">
          <span class="avr-usage-tag-icon" aria-hidden="true">📂</span>
          <span class="avr-usage-tag-label">Группа</span>
          <span class="avr-usage-tag-name">${esc(g.name)}</span>
        </span>
      `),
      ...linkedItems.map(i => `
        <span class="avr-usage-tag avr-usage-tag--item">
          <span class="avr-usage-tag-icon" aria-hidden="true">🍽</span>
          <span class="avr-usage-tag-label">Товар</span>
          <span class="avr-usage-tag-name">${esc(i.name || '—')}</span>
        </span>
      `),
    ].join('');

    return `
      <div class="avr-usage" id="avr-usage-section">
        <h3 class="avr-usage-title">Используется в объектах</h3>
        <div class="avr-usage-tags">${tags}</div>
      </div>
    `;
  }

  function renderDetailPanel(rule) {
    return `
      <div class="avr-detail-panel" id="avr-detail-panel">
        <div class="avr-detail-scroll">
          <label class="avr-name-field">
            <span class="avr-field-label">Название шаблона</span>
            <input type="text" class="avr-name-input" data-field="name" value="${escAttr(rule.name)}" maxlength="120" />
          </label>

          <div class="avr-conditions-section">
            <div class="avr-section-head">
              <h3 class="avr-section-title">Условия</h3>
              <button type="button" class="btn btn-outline btn-press avr-add-condition" data-action="add-condition">
                + Добавить условие
              </button>
            </div>
            <div class="avr-conditions" id="avr-conditions">
              ${rule.conditions.map((c, i) => renderConditionRow(c, i)).join('')}
            </div>
          </div>

          ${!isNew ? renderUsageBlock(rule.id) : ''}

          <p class="ifm-error" id="avr-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <button type="button" class="btn btn-primary btn-press avr-save-btn" id="avr-save-btn">Сохранить шаблон</button>
          ${!isNew ? `
            <button type="button" class="btn btn-outline btn-press avr-archive-btn" id="avr-archive-btn">В архив</button>
            <div class="cgr-detail-danger avr-detail-danger">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="avr-delete-confirm" />
                <span>Я подтверждаю, что хочу безвозвратно удалить этот шаблон расписания</span>
              </label>
              <button type="button" class="cgr-detail-delete btn-press" id="avr-detail-delete" disabled>
                Удалить шаблон
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">🕐</span>
        <p class="avr-detail-empty-title">Выберите шаблон</p>
        <p class="avr-detail-empty-hint">Создайте новое расписание или выберите существующий шаблон из списка слева.</p>
      </div>
    `;
  }

  function renderListRow(rule) {
    const active = rule.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(rule.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(rule.name)}</span>
            <span class="avr-row-meta">${esc(formatAvailabilityRuleShort(rule))}</span>
          </span>
        </button>
      </li>
    `;
  }

  function render() {
    const rule = selectedRule();
    const visible = activeRules();
    host.innerHTML = `
      <div class="avr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Шаблоны (${visible.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="avr-create-btn">+ Новый шаблон</button>
          </div>
          <ul class="avr-list" id="avr-list">${visible.map(r => renderListRow(r)).join('')}</ul>
          ${!visible.length ? '<p class="avr-list-empty">Нет активных шаблонов. Создайте новый.</p>' : ''}
        </div>
        <aside class="avr-detail" aria-label="Редактор расписания">
          ${rule && !isRuleArchived(rule) ? renderDetailPanel(rule) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function refreshConditions() {
    const rule = selectedRule();
    const container = host.querySelector('#avr-conditions');
    if (!rule || !container) return;
    container.innerHTML = rule.conditions.map((c, i) => renderConditionRow(c, i)).join('');
    bindConditionEvents();
  }

  function updateListRow(id) {
    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const rule = rules.find(r => r.id === id);
    if (!row || !rule) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(rule.name));
    row.querySelector('.avr-row-meta')?.replaceChildren(
      document.createTextNode(formatAvailabilityRuleShort(rule)),
    );
  }

  function setConditionRowActive(row, active) {
    row.classList.toggle('avr-condition-row--inactive', !active);
    row.querySelector('[data-field="type"]')?.toggleAttribute('disabled', !active);
    row.querySelectorAll('.avr-day-chip').forEach(chip => chip.toggleAttribute('disabled', !active));
    row.querySelectorAll('input:not([data-field="is-active"]), select').forEach(el => {
      if (el.matches('[data-field="is-active"]')) return;
      if (el.matches('[data-field="time-enabled"], [data-field="date-enabled"]')) {
        el.toggleAttribute('disabled', !active);
        return;
      }
      if (el.matches('[data-field="time-start"], [data-field="time-end"]')) {
        const timeOn = row.querySelector('[data-field="time-enabled"]')?.checked;
        el.toggleAttribute('disabled', !active || !timeOn);
        return;
      }
      el.toggleAttribute('disabled', !active);
    });
    const label = row.querySelector('.avr-active-label');
    if (label) label.textContent = active ? 'Активно' : 'Пауза';
    row.querySelector('.avr-active-toggle')?.setAttribute(
      'title',
      active ? 'Приостановить условие' : 'Активировать условие',
    );
  }

  function bindConditionEvents() {
    host.querySelectorAll('[data-field="is-active"]').forEach(input => {
      input.addEventListener('change', e => {
        const row = e.target.closest('.avr-condition-row');
        if (!row) return;
        setConditionRowActive(row, e.target.checked);
        syncPanelToState();
        updateListRow(selectedId);
      });
    });
  }

  function bindEvents() {
    bindConditionEvents();

    host.querySelector('#avr-create-btn')?.addEventListener('click', () => {
      syncPanelToState();
      const draft = createDefaultAvailabilityRuleDoc(`draft-${Date.now()}`);
      rules.push(draft);
      selectedId = draft.id;
      isNew = true;
      render();
      requestAnimationFrame(() => {
        host.querySelector('[data-field="name"]')?.focus();
        host.querySelector('[data-field="name"]')?.select();
      });
    });

    host.querySelector('#avr-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const id = btn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      syncPanelToState();
      selectedId = id;
      isNew = false;
      render();
    });

    host.querySelector('#avr-save-btn')?.addEventListener('click', () => save());
    host.querySelector('#avr-archive-btn')?.addEventListener('click', () => archiveRule());
    host.querySelector('#avr-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#avr-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#avr-detail-delete')?.addEventListener('click', () => deleteRule());

    host.querySelector('#avr-detail-panel')?.addEventListener('click', e => {
      if (e.target.closest('[data-action="add-condition"]')) {
        syncPanelToState();
        const rule = selectedRule();
        if (!rule) return;
        rule.conditions.push(createDefaultCondition('allow'));
        rules = rules.map(r => (r.id === selectedId ? { ...rule } : r));
        refreshConditions();
        return;
      }

      const chip = e.target.closest('.avr-day-chip');
      if (chip && !chip.disabled) {
        chip.classList.toggle('avr-day-chip--active');
        chip.setAttribute('aria-pressed', String(chip.classList.contains('avr-day-chip--active')));
        syncPanelToState();
        updateListRow(selectedId);
      }
    });

    host.querySelector('#avr-detail-panel')?.addEventListener('change', e => {
      if (!selectedId) return;

      if (e.target.matches('[data-field="type"]')) {
        syncPanelToState();
        refreshConditions();
        updateListRow(selectedId);
        return;
      }

      if (e.target.matches('[data-field="time-enabled"]')) {
        const row = e.target.closest('.avr-condition-row');
        const enabled = e.target.checked;
        row?.querySelector('[data-field="time-start"]')?.toggleAttribute('disabled', !enabled);
        row?.querySelector('[data-field="time-end"]')?.toggleAttribute('disabled', !enabled);
        if (!enabled) {
          const start = row?.querySelector('[data-field="time-start"]');
          const end = row?.querySelector('[data-field="time-end"]');
          if (start) start.value = '';
          if (end) end.value = '';
        } else {
          const start = row?.querySelector('[data-field="time-start"]');
          const end = row?.querySelector('[data-field="time-end"]');
          if (start && !start.value) start.value = '08:00';
          if (end && !end.value) end.value = '10:00';
        }
        syncPanelToState();
        updateListRow(selectedId);
        return;
      }

      if (e.target.matches('[data-field="date-enabled"]')) {
        const row = e.target.closest('.avr-condition-row');
        const fields = row?.querySelector('[data-date-fields]');
        if (fields) fields.hidden = !e.target.checked;
        if (!e.target.checked) {
          row?.querySelector('[data-field="date-start"]') && (row.querySelector('[data-field="date-start"]').value = '');
          row?.querySelector('[data-field="date-end"]') && (row.querySelector('[data-field="date-end"]').value = '');
        }
        syncPanelToState();
        updateListRow(selectedId);
        return;
      }

      if (e.target.matches('[data-field="time-start"], [data-field="time-end"], [data-field="date-start"], [data-field="date-end"]')) {
        syncPanelToState();
        updateListRow(selectedId);
      }
    });

    host.querySelector('#avr-detail-panel')?.addEventListener('input', e => {
      if (e.target.matches('[data-field="name"]')) {
        syncPanelToState();
        updateListRow(selectedId);
      }
    });
  }

  async function save() {
    syncPanelToState();
    const errEl = host.querySelector('#avr-error');
    if (errEl) errEl.hidden = true;

    const btn = host.querySelector('#avr-save-btn');
    if (btn) btn.disabled = true;

    try {
      const rule = selectedRule();
      if (!rule) throw new Error('Выберите шаблон');

      validateAvailabilityRuleDoc(rule);
      const savedId = isNew ? '' : rule.id;
      const saved = await saveAvailabilityRule(rule, savedId);

      if (isNew) {
        rules = rules.filter(r => r.id !== selectedId);
      }
      rules = [...rules.filter(r => r.id !== saved.id), saved];
      selectedId = saved.id;
      isNew = false;

      render();
      await onSaved?.();
    } catch (err) {
      console.error('[availability-rules]', err);
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось сохранить шаблон';
        errEl.hidden = false;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function archiveRule() {
    if (isNew || !selectedId) return;
    if (!confirm('Отправить шаблон в архив? Группы и товары с этим правилом станут «Доступно всегда».')) return;

    const idToArchive = selectedId;
    try {
      await archiveAvailabilityRule(idToArchive);
      rules = rules.map(r => (r.id === idToArchive ? { ...r, status: 'archived' } : r));
      selectedId = activeRules()[0]?.id || null;
      isNew = false;
      render();
      await onSaved?.();
    } catch (err) {
      console.error('[availability-rules] archive', err);
      const errEl = host.querySelector('#avr-error');
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось отправить шаблон в архив';
        errEl.hidden = false;
      }
    }
  }

  async function deleteRule() {
    const confirmEl = host.querySelector('#avr-delete-confirm');
    if (isNew || !selectedId || !confirmEl?.checked) return;

    if (isRuleInUse(selectedId, groups, catalogItems)) {
      showToast('Нельзя удалить используемое расписание. Сначала отвяжите его от всех групп и товаров');
      return;
    }

    const idToDelete = selectedId;
    const btn = host.querySelector('#avr-detail-delete');
    if (btn) btn.disabled = true;

    try {
      await deleteAvailabilityRule(idToDelete);
      rules = rules.filter(r => r.id !== idToDelete);
      selectedId = activeRules()[0]?.id || null;
      isNew = false;
      render();
      await onSaved?.();
    } catch (err) {
      console.error('[availability-rules] delete', err);
      if (btn) {
        btn.disabled = !confirmEl.checked;
        btn.classList.toggle('cgr-detail-delete--active', confirmEl.checked);
      }
      const errEl = host.querySelector('#avr-error');
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось удалить шаблон';
        errEl.hidden = false;
      }
    }
  }

  function destroy() {
    host.innerHTML = '';
  }

  render();
  return { destroy };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
