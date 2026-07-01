import {
  CYCLE_UNIT_OPTIONS,
  CYCLE_UNITS,
  DEFAULT_WORK_SHIFT_ID,
  FIXED_PATTERN_OPTIONS,
  SCHEDULE_TYPE_OPTIONS,
  SCHEDULE_TYPES,
  computeCrossesMidnight,
  formatWorkShiftSummary,
  normalizeWorkShift,
} from '../../shared/work-shifts.js';
import { saveWorkShift, deleteWorkShift } from '../services/work-shifts-data.js';
import { shiftThumbHtml } from '../utils/product-image.js';
import { showToast } from '../utils/toast.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.shifts
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createWorkShiftsEditor(host, { shifts: initialShifts, onSaved }) {
  /** @type {Array<object>} */
  let shifts = initialShifts.map(s => normalizeWorkShift(s));
  /** @type {string|null} */
  let selectedId = null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(shifts.map(s => normalizeWorkShift(s)).sort((a, b) => a.id.localeCompare(b.id)));
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
    shifts = JSON.parse(baselineJson).map(s => normalizeWorkShift(s));
    if (selectedId && !shifts.some(s => s.id === selectedId)) {
      selectedId = shifts[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedShift() {
    return shifts.find(s => s.id === selectedId) || null;
  }

  function readPanelFields() {
    const panel = host.querySelector('#wsh-detail-panel');
    if (!selectedId || !panel) return null;

    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const scheduleType = panel.querySelector('[data-field="schedule-type"]')?.value || SCHEDULE_TYPES.FIXED;
    const fixedPattern = panel.querySelector('[data-field="fixed-pattern"]')?.value || FIXED_PATTERN_OPTIONS[0].value;
    const cycleUnit = panel.querySelector('[data-field="cycle-unit"]')?.value || CYCLE_UNITS.DAYS;
    const workPeriod = Number(panel.querySelector('[data-field="work-period"]')?.value) || 2;
    const restPeriod = Number(panel.querySelector('[data-field="rest-period"]')?.value) || 2;
    const cycleStartDate = panel.querySelector('[data-field="cycle-start-date"]')?.value || null;
    const shiftStart = panel.querySelector('[data-field="shift-start"]')?.value || '09:00';
    const shiftEnd = panel.querySelector('[data-field="shift-end"]')?.value || '18:00';
    const useProductionCalendar = panel.querySelector('[data-field="use-production-calendar"]')?.checked === true;

    return normalizeWorkShift({
      id: selectedId,
      name,
      scheduleType,
      fixedPattern,
      cycleUnit,
      workPeriod,
      restPeriod,
      cycleStartDate,
      shiftStart,
      shiftEnd,
      useProductionCalendar,
    });
  }

  function syncPanel() {
    const data = readPanelFields();
    if (!data) return;
    shifts = shifts.map(s => (s.id === selectedId ? { ...s, ...data } : s));
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `shift_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (shifts.some(s => s.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function renderRow(shift) {
    const active = shift.id === selectedId;
    const summary = formatWorkShiftSummary(shift);
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''}" data-id="${escAttr(shift.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${shiftThumbHtml()}</span>
            <span class="avr-row-info">
              <span class="avr-row-name">${esc(shift.name)}</span>
              <span class="avr-row-meta">${esc(summary)}</span>
            </span>
          </span>
        </button>
      </li>
    `;
  }

  function renderCycleSection(shift) {
    const isRotating = shift.scheduleType === SCHEDULE_TYPES.ROTATING;
    const isHours = shift.cycleUnit === CYCLE_UNITS.HOURS;
    const workLabel = isHours ? 'Рабочих часов' : 'Рабочих дней';
    const restLabel = isHours ? 'Часов отдыха' : 'Выходных дней';

    return `
      <div class="sch-fieldset wsh-fieldset">
        <span class="sch-fieldset__legend">Параметры цикла</span>
        <div class="wsh-fieldset__body">

        <div class="admin-field-block">
          <label class="admin-field-label" for="wsh-schedule-type">Тип графика</label>
          <select id="wsh-schedule-type" class="admin-field-input" data-field="schedule-type">
            ${SCHEDULE_TYPE_OPTIONS.map(o => `
              <option value="${escAttr(o.value)}" ${shift.scheduleType === o.value ? 'selected' : ''}>${esc(o.label)}</option>
            `).join('')}
          </select>
        </div>

        <div class="wsh-type-panel" data-panel="fixed" ${isRotating ? 'hidden' : ''}>
          <div class="admin-field-block">
            <label class="admin-field-label" for="wsh-fixed-pattern">Шаблон недели</label>
            <select id="wsh-fixed-pattern" class="admin-field-input" data-field="fixed-pattern">
              ${FIXED_PATTERN_OPTIONS.map(o => `
                <option value="${escAttr(o.value)}" ${shift.fixedPattern === o.value ? 'selected' : ''}>${esc(o.label)}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="wsh-type-panel" data-panel="rotating" ${!isRotating ? 'hidden' : ''}>
          <div class="admin-field-block">
            <label class="admin-field-label" for="wsh-cycle-unit">Единица цикла</label>
            <select id="wsh-cycle-unit" class="admin-field-input" data-field="cycle-unit">
              ${CYCLE_UNIT_OPTIONS.map(o => `
                <option value="${escAttr(o.value)}" ${shift.cycleUnit === o.value ? 'selected' : ''}>${esc(o.label)}</option>
              `).join('')}
            </select>
          </div>

          <div class="wsh-inline-fields">
            <div class="wsh-inline-field">
              <label class="admin-field-label" for="wsh-work-period">${esc(workLabel)}</label>
              <input id="wsh-work-period" type="number" class="admin-field-input wsh-inline-input" data-field="work-period" min="1" max="999" value="${escAttr(String(shift.workPeriod))}" />
            </div>
            <span class="wsh-inline-sep" aria-hidden="true">|</span>
            <div class="wsh-inline-field">
              <label class="admin-field-label" for="wsh-rest-period">${esc(restLabel)}</label>
              <input id="wsh-rest-period" type="number" class="admin-field-input wsh-inline-input" data-field="rest-period" min="1" max="999" value="${escAttr(String(shift.restPeriod))}" />
            </div>
          </div>

          <div class="admin-field-block">
            <label class="admin-field-label" for="wsh-cycle-start-date">Дата начала отсчёта</label>
            <input id="wsh-cycle-start-date" type="date" class="admin-field-input" data-field="cycle-start-date" value="${escAttr(shift.cycleStartDate || '')}" />
            <p class="sch-fieldset__hint">Первый рабочий день цикла отсчитывается от этой даты.</p>
          </div>
        </div>

        </div>
      </div>
    `;
  }

  function renderTimeSection(shift) {
    const crossesMidnight = computeCrossesMidnight(shift.shiftStart, shift.shiftEnd);
    return `
      <div class="sch-fieldset wsh-fieldset">
        <span class="sch-fieldset__legend">Время работы</span>
        <div class="wsh-fieldset__body">
        <div class="wsh-inline-fields">
          <div class="wsh-inline-field">
            <label class="admin-field-label" for="wsh-shift-start">Начало смены</label>
            <input id="wsh-shift-start" type="time" class="admin-field-input wsh-inline-input" data-field="shift-start" value="${escAttr(shift.shiftStart)}" />
          </div>
          <span class="wsh-inline-sep" aria-hidden="true">|</span>
          <div class="wsh-inline-field">
            <label class="admin-field-label" for="wsh-shift-end">Окончание смены</label>
            <input id="wsh-shift-end" type="time" class="admin-field-input wsh-inline-input" data-field="shift-end" value="${escAttr(shift.shiftEnd)}" />
          </div>
        </div>
        <p class="sch-fieldset__hint wsh-midnight-hint" ${crossesMidnight ? '' : 'hidden'}>
          Смена переходит на следующие сутки (ночная). Дотации объединяются в рамках одного рабочего интервала.
        </p>
        </div>
      </div>
    `;
  }

  function calendarHintText(isFixed) {
    return isFixed
      ? 'Для графика 5/2 праздничные дни автоматически становятся выходными.'
      : 'Для сменных графиков (2/2, сутки/трое) праздники остаются рабочими днями по циклу, если не задано иное.';
  }

  function renderCalendarSection(shift) {
    const isFixed = shift.scheduleType === SCHEDULE_TYPES.FIXED;
    const calendarOn = shift.useProductionCalendar === true;
    return `
      <div class="sch-fieldset wsh-fieldset">
        <span class="sch-fieldset__legend">Производственный календарь</span>
        <div class="wsh-fieldset__body">
        <div class="avr-active-row wsh-calendar-active">
          <label class="avr-active-toggle" title="${calendarOn ? 'Отключить учёт праздников' : 'Включить учёт праздников'}">
            <input
              type="checkbox"
              data-field="use-production-calendar"
              ${calendarOn ? 'checked' : ''}
            />
            <span class="avr-switch" aria-hidden="true"></span>
            <span class="avr-active-label">${calendarOn ? 'Учитывать праздники' : 'Не учитывать'}</span>
          </label>
        </div>
        <div class="wsh-calendar-foot">
          <p class="sch-fieldset__hint wsh-calendar-hint">${calendarHintText(isFixed)}</p>
          <a class="wsh-calendar-link btn-press" href="#/calendar">
            <span class="wsh-calendar-link__icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </span>
            <span class="wsh-calendar-link__label">Настроить календарь дней</span>
            <span class="wsh-calendar-link__arrow" aria-hidden="true">→</span>
          </a>
        </div>
        </div>
      </div>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">🕐</span>
        <p class="avr-detail-empty-title">Выберите смену</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить смену» слева или выберите график из списка, чтобы настроить цикл, время работы и производственный календарь.</p>
      </div>
    `;
  }

  function renderDetailPanel(shift) {
    return `
      <div class="avr-detail-panel" id="wsh-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование смены',
          cancelId: 'wsh-detail-cancel',
          saveId: 'wsh-detail-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body cgr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="wsh-name">Название смены</label>
              <input id="wsh-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(shift.name)}" maxlength="120" placeholder="Смена А (Дневная 2/2)" />
            </div>

            ${renderCycleSection(shift)}
            ${renderTimeSection(shift)}
            ${renderCalendarSection(shift)}
          </div>
          <p class="ifm-error" id="wsh-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="wsh-delete-confirm" ${shift.id === DEFAULT_WORK_SHIFT_ID ? 'disabled' : ''} />
                <span>Подтверждаю удаление смены</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="wsh-detail-delete" disabled ${shift.id === DEFAULT_WORK_SHIFT_ID ? 'title="Стандартную смену удалить нельзя"' : ''}>Удалить смену</button>
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

  function syncCalendarToggleLabel() {
    const panel = host.querySelector('#wsh-detail-panel');
    const input = panel?.querySelector('[data-field="use-production-calendar"]');
    if (!input) return;
    const active = input.checked;
    const toggle = input.closest('.avr-active-toggle');
    const label = toggle?.querySelector('.avr-active-label');
    if (label) label.textContent = active ? 'Учитывать праздники' : 'Не учитывать';
    toggle?.setAttribute('title', active ? 'Отключить учёт праздников' : 'Включить учёт праздников');
  }

  function refreshTypePanels() {
    const panel = host.querySelector('#wsh-detail-panel');
    if (!panel) return;
    const scheduleType = panel.querySelector('[data-field="schedule-type"]')?.value;
    const cycleUnit = panel.querySelector('[data-field="cycle-unit"]')?.value;
    const isRotating = scheduleType === SCHEDULE_TYPES.ROTATING;
    const isHours = cycleUnit === CYCLE_UNITS.HOURS;

    panel.querySelector('[data-panel="fixed"]')?.toggleAttribute('hidden', isRotating);
    panel.querySelector('[data-panel="rotating"]')?.toggleAttribute('hidden', !isRotating);

    const workLabel = panel.querySelector('label[for="wsh-work-period"]');
    const restLabel = panel.querySelector('label[for="wsh-rest-period"]');
    if (workLabel) workLabel.textContent = isHours ? 'Рабочих часов' : 'Рабочих дней';
    if (restLabel) restLabel.textContent = isHours ? 'Часов отдыха' : 'Выходных дней';

    const calendarHint = panel.querySelector('.wsh-calendar-hint');
    if (calendarHint) {
      calendarHint.textContent = calendarHintText(!isRotating);
    }
  }

  function refreshMidnightHint() {
    const panel = host.querySelector('#wsh-detail-panel');
    if (!panel) return;
    const start = panel.querySelector('[data-field="shift-start"]')?.value;
    const end = panel.querySelector('[data-field="shift-end"]')?.value;
    const hint = panel.querySelector('.wsh-midnight-hint');
    if (hint) hint.hidden = !computeCrossesMidnight(start, end);
  }

  function updateListRowMeta(id) {
    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const shift = shifts.find(s => s.id === id);
    if (!row || !shift) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(shift.name));
    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.textContent = formatWorkShiftSummary(shift);
  }

  function render() {
    const shift = selectedShift();
    host.innerHTML = `
      <div class="avr-layout cgr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Смены (${shifts.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="wsh-create-btn">
              + Добавить смену
            </button>
          </div>
          <ul class="avr-list" id="wsh-list">${shifts.map(renderRow).join('')}</ul>
          ${!shifts.length ? '<p class="avr-list-empty">Нет смен. Создайте первую.</p>' : ''}
          <p class="ifm-error" id="wsh-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Настройки смены">
          ${shift ? renderDetailPanel(shift) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#wsh-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const shift = selectedShift();
    if (!shift?.name?.trim()) {
      showError('Укажите название смены');
      return false;
    }
    if (shift.scheduleType === SCHEDULE_TYPES.ROTATING && !shift.cycleStartDate) {
      showError('Укажите дату начала отсчёта для циклического графика');
      return false;
    }
    saving = true;
    render();
    try {
      await saveWorkShift(shift);
      commitBaseline();
      showToast('Смена сохранена');
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
    host.querySelector('#wsh-create-btn')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          const id = uniqueId('новая_смена');
          const draft = normalizeWorkShift({
            id,
            name: 'Новая смена',
            scheduleType: SCHEDULE_TYPES.ROTATING,
            cycleUnit: CYCLE_UNITS.DAYS,
            workPeriod: 2,
            restPeriod: 2,
            cycleStartDate: new Date().toISOString().slice(0, 10),
            shiftStart: '08:00',
            shiftEnd: '20:00',
            useProductionCalendar: true,
          });
          shifts = [...shifts, draft];
          selectedId = id;
          render();
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        },
      });
    });

    host.querySelector('#wsh-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const id = btn.closest('.avr-row')?.dataset.id;
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

    const panel = host.querySelector('#wsh-detail-panel');
    panel?.addEventListener('input', () => {
      syncPanel();
      refreshMidnightHint();
      if (selectedId) updateListRowMeta(selectedId);
    });
    panel?.addEventListener('change', e => {
      syncPanel();
      if (e.target.matches('[data-field="schedule-type"], [data-field="cycle-unit"]')) {
        refreshTypePanels();
      }
      if (e.target.matches('[data-field="use-production-calendar"]')) {
        syncCalendarToggleLabel();
      }
      refreshMidnightHint();
      if (selectedId) updateListRowMeta(selectedId);
    });

    host.querySelector('#wsh-detail-save')?.addEventListener('click', persistCurrent);
    bindAvrDetailCancel(host, 'wsh-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });

    host.querySelector('#wsh-delete-confirm')?.addEventListener('change', e => {
      host.querySelector('#wsh-detail-delete').disabled = !e.target.checked;
    });

    host.querySelector('#wsh-detail-delete')?.addEventListener('click', async () => {
      if (!selectedId || selectedId === DEFAULT_WORK_SHIFT_ID) return;
      saving = true;
      try {
        await deleteWorkShift(selectedId);
        shifts = shifts.filter(s => s.id !== selectedId);
        selectedId = shifts[0]?.id || null;
        commitBaseline();
        showToast('Смена удалена');
        await onSaved?.();
      } catch (err) {
        showError(err.message || 'Не удалось удалить');
      } finally {
        saving = false;
        render();
      }
    });
  }

  render();

  return { destroy() { host.innerHTML = ''; }, isDirty };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
