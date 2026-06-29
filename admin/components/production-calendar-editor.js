import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  WEEKDAY_HEADERS,
  buildDayEntry,
  collectCalendarEvents,
  defaultNameForType,
  fmtShortDate,
  getDayInfo,
  getYearMonthGrids,
  toDateKey,
} from '../../shared/production-calendar.js';
import {
  saveProductionCalendarDay,
  syncProductionCalendarFromApi,
  fetchProductionCalendar,
} from '../services/production-calendar-data.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtSyncedAt(ts) {
  if (!ts) return '';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dayCellClass(type) {
  if (type === DAY_TYPES.HOLIDAY) return 'pc-day--holiday';
  if (type === DAY_TYPES.WEEKEND) return 'pc-day--weekend';
  if (type === DAY_TYPES.PREHOLIDAY) return 'pc-day--preholiday';
  return 'pc-day--workday';
}

function fmtTodayLabel() {
  const now = new Date();
  const date = now.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long' });
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `Сегодня: ${date}, ${weekdayCap}`;
}

const SYNC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;

const UPCOMING_CAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {number} p.year
 * @param {import('../../shared/production-calendar.js').ProductionDaysMap} p.days
 * @param {import('../../shared/production-calendar.js').ManualOverridesMap} [p.manualOverrides]
 * @param {import('../../shared/production-calendar.js').ProductionDaysMap} [p.apiDays]
 * @param {*} p.syncedAt
 * @param {(year: number) => void} p.onYearChange
 * @param {(payload: { days: import('../../shared/production-calendar.js').ProductionDaysMap, syncedAt: * }) => void} p.onSynced
 * @param {(days: import('../../shared/production-calendar.js').ProductionDaysMap) => void} p.onDaySaved
 */
export function createProductionCalendarEditor(host, {
  year,
  days,
  manualOverrides = {},
  apiDays = null,
  syncedAt,
  onYearChange,
  onSynced,
  onDaySaved,
}) {
  let state = {
    year,
    days: { ...days },
    manualOverrides: { ...manualOverrides },
    apiDays: apiDays ? { ...apiDays } : null,
    syncedAt,
    syncing: false,
    saving: false,
    gridLoading: false,
    showPastMonths: false,
  };
  let popoverEl = null;
  let selectedDateKey = null;
  let initialScrollDone = false;

  const isCurrentYear = () => state.year === new Date().getFullYear();

  const visibleGrids = () => {
    const all = getYearMonthGrids(state.year);
    if (state.showPastMonths || !isCurrentYear()) return all;
    const currentMonth = new Date().getMonth();
    return all.filter(g => g.monthIndex >= currentMonth);
  };

  const yearOptions = () => {
    const cur = new Date().getFullYear();
    const from = cur - 1;
    const to = cur + 2;
    let html = '';
    for (let y = from; y <= to; y += 1) {
      html += `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`;
    }
    return html;
  };

  const syncBtnHtml = () => {
    if (state.syncing) {
      return `<span class="pc-spinner" aria-hidden="true"></span> Обновление…`;
    }
    return `${SYNC_ICON} Синхронизировать`;
  };

  const renderSyncStatusHtml = syncedLabel => {
    if (syncedLabel) {
      return `
        <p class="pc-sync-status-item pc-sync-status-item--ok">
          <svg class="pc-sync-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
          Синхронизировано: ${esc(syncedLabel)}
        </p>
      `;
    }
    return `<p class="pc-sync-status-item pc-sync-status-item--pending">Не синхронизировано</p>`;
  };

  const renderMonthTile = grid => {
    const now = new Date();
    const isCurrentMonth = state.year === now.getFullYear() && grid.monthIndex === now.getMonth();

    const cells = grid.cells.map(dateKey => {
      if (!dateKey) {
        return '<span class="pc-day pc-day--empty" aria-hidden="true"></span>';
      }
      const info = getDayInfo(dateKey, state.days);
      const dayNum = Number(dateKey.slice(8, 10));
      const isToday = dateKey === toDateKey(now);
      return `
        <button
          type="button"
          class="pc-day btn-press ${dayCellClass(info.type)}${isToday ? ' pc-day--today' : ''}"
          data-date="${dateKey}"
          title="${esc(info.name || DAY_TYPE_LABELS[info.type])}"
          aria-label="${esc(`${dayNum} — ${DAY_TYPE_LABELS[info.type]}${isToday ? ' (сегодня)' : ''}`)}"
          aria-current="${isToday ? 'date' : 'false'}"
        >${dayNum}</button>
      `;
    }).join('');

    return `
      <article class="pc-month card${isCurrentMonth ? ' pc-month--current' : ''}" data-month="${grid.monthIndex}" id="pc-month-${grid.monthIndex}">
        <h3 class="pc-month-title">${esc(grid.title)}${isCurrentMonth ? '<span class="pc-month-badge">Текущий</span>' : ''}</h3>
        <div class="pc-month-weekdays">
          ${WEEKDAY_HEADERS.map(w => `<span class="pc-weekday">${w}</span>`).join('')}
        </div>
        <div class="pc-month-grid">${cells}</div>
      </article>
    `;
  };

  const shouldShowUpcomingWidget = () => isCurrentYear();

  const upcomingEvents = () => collectCalendarEvents(state.days, state.year, {
    includePast: state.showPastMonths,
    manualOverrides: state.manualOverrides,
    apiDays: state.apiDays,
  });

  const formatEventDates = (from, to) => {
    if (from === to) return fmtShortDate(from);
    const y = from.slice(0, 4);
    if (to.slice(0, 4) === y) {
      const [, m1, d1] = from.split('-');
      const [, m2, d2] = to.split('-');
      return `${d1}.${m1}–${d2}.${m2}.${y}`;
    }
    return `${fmtShortDate(from)} – ${fmtShortDate(to)}`;
  };

  const shortTypeLabel = typeTag => {
    if (typeTag.includes('Локальн')) return typeTag;
    if (typeTag.includes('Пользовательский')) return 'Пользовательский перенос';
    if (typeTag.includes('Предпраздничный')) return 'Предпраздничный';
    if (typeTag.includes('Гос.')) return 'Гос. праздник';
    if (typeTag.includes('Перенос')) return 'Перенос рабочего дня';
    if (typeTag.includes('Выходной')) return 'Выходной / перенос';
    return typeTag;
  };

  const dateToneClass = type => {
    if (type === DAY_TYPES.PREHOLIDAY) return 'pc-upcoming-date--preholiday';
    if (type === DAY_TYPES.HOLIDAY || type === DAY_TYPES.WEEKEND) return 'pc-upcoming-date--off';
    return 'pc-upcoming-date--neutral';
  };

  const renderUpcomingWidget = () => {
    const events = upcomingEvents();

    const rows = events.length
      ? events.map(ev => `
        <div class="pc-upcoming-row">
          <div class="pc-upcoming-left">
            <span class="pc-upcoming-icon">${UPCOMING_CAL_ICON}</span>
            <div class="pc-upcoming-text">
              <p class="pc-upcoming-name">${esc(ev.name)}</p>
              <p class="pc-upcoming-type">${esc(shortTypeLabel(ev.typeTag))}</p>
            </div>
          </div>
          <time class="pc-upcoming-date ${dateToneClass(ev.type)}" datetime="${esc(ev.dateFrom)}">
            ${esc(formatEventDates(ev.dateFrom, ev.dateTo))}
          </time>
        </div>
      `).join('')
      : `<p class="pc-upcoming-empty">Нет ${state.showPastMonths ? '' : 'предстоящих '}праздников и переносов</p>`;

    return `
      <article class="pc-upcoming card" id="pc-upcoming-widget">
        <h3 class="pc-upcoming-title">Ближайшие праздники и переносы</h3>
        <div class="pc-upcoming-list kiosk-scroll">${rows}</div>
      </article>
    `;
  };

  const renderContentGridHtml = () => {
    const grids = visibleGrids();
    const showWidget = shouldShowUpcomingWidget();

    if (!grids.length && !showWidget) {
      return '<p class="pc-grid-empty">Нет месяцев для отображения</p>';
    }

    if (!showWidget) {
      return `
        <div class="pc-content-grid pc-content-grid--full">
          <div class="pc-months-grid pc-months-grid--quad" id="pc-year-grid">
            ${grids.map(renderMonthTile).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="pc-content-grid">
        <div class="pc-months-grid" id="pc-year-grid">
          ${grids.map(renderMonthTile).join('')}
        </div>
        <div class="pc-upcoming-col">
          ${renderUpcomingWidget()}
        </div>
      </div>
    `;
  };

  const render = () => {
    const syncedLabel = fmtSyncedAt(state.syncedAt);
    const showPastToggle = isCurrentYear();

    host.innerHTML = `
      <div class="pc-layout">
        <header class="pc-toolbar">
          <div class="pc-toolbar-left">
            <div class="pc-today-informer">${esc(fmtTodayLabel())}</div>
            <label class="pc-year-field">
              <span class="pc-year-label">Год</span>
              <select class="pc-year-select avr-select" id="pc-year-select">${yearOptions()}</select>
            </label>
            ${showPastToggle ? `
              <label class="pc-toggle">
                <input type="checkbox" id="pc-show-past" ${state.showPastMonths ? 'checked' : ''} />
                <span class="pc-toggle-track" aria-hidden="true"><span class="pc-toggle-thumb"></span></span>
                <span class="pc-toggle-label">Показать прошедшие месяцы</span>
              </label>
            ` : ''}
          </div>
          <div class="pc-toolbar-sync">
            <button
              type="button"
              class="btn btn-outline btn-press pc-sync-btn"
              id="pc-sync-btn"
              ${state.syncing || state.saving ? 'disabled' : ''}
            >
              ${syncBtnHtml()}
            </button>
            <div class="pc-sync-status">
              <p class="pc-sync-status-item pc-sync-status-item--sources">Источники: API isdayoff.ru / xmlcalendar.ru</p>
              ${renderSyncStatusHtml(syncedLabel)}
            </div>
          </div>
        </header>

        <div class="pc-legend">
          <span class="pc-legend-item"><i class="pc-legend-dot pc-legend-dot--workday"></i> Будни</span>
          <span class="pc-legend-item"><i class="pc-legend-dot pc-legend-dot--weekend"></i> Выходные (Сб, Вс)</span>
          <span class="pc-legend-item"><i class="pc-legend-dot pc-legend-dot--holiday"></i> Праздники и переносы</span>
          <span class="pc-legend-item"><i class="pc-legend-dot pc-legend-dot--preholiday"></i> Предпраздничные</span>
        </div>

        <div class="pc-year-grid-wrap${state.gridLoading ? ' pc-year-grid-wrap--loading' : ''}">
          ${renderContentGridHtml()}
        </div>
      </div>
    `;

    bindEvents();
    scrollToCurrentMonth();
  };

  const getScrollParent = () => host.closest('.admin-content');

  const scrollCalendarIntoView = () => {
    const scrollParent = getScrollParent();
    const anchor = host.querySelector('.pc-year-grid-wrap');
    if (!scrollParent || !anchor) return;

    const parentRect = scrollParent.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const scrollGap = 16;
    const nextTop = scrollParent.scrollTop + (anchorRect.top - parentRect.top) - scrollGap;
    scrollParent.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
  };

  const scrollToCurrentMonth = () => {
    if (initialScrollDone || !isCurrentYear()) return;
    requestAnimationFrame(() => {
      if (state.showPastMonths) {
        scrollCalendarIntoView();
      }
      initialScrollDone = true;
    });
  };

  const refreshGrid = () => {
    const wrap = host.querySelector('.pc-year-grid-wrap');
    if (!wrap) return;
    wrap.innerHTML = renderContentGridHtml();
    wrap.classList.toggle('pc-year-grid-wrap--loading', state.gridLoading);
    bindDayClicks();
    scrollToCurrentMonth();
  };

  const refreshSyncUi = () => {
    const btn = host.querySelector('#pc-sync-btn');
    if (btn) {
      btn.disabled = state.syncing || state.saving;
      btn.innerHTML = syncBtnHtml();
    }
    const statusBlock = host.querySelector('.pc-toolbar-sync .pc-sync-status');
    if (statusBlock) {
      const syncedLabel = fmtSyncedAt(state.syncedAt);
      statusBlock.innerHTML = `
        <p class="pc-sync-status-item pc-sync-status-item--sources">Источники: API isdayoff.ru / xmlcalendar.ru</p>
        ${renderSyncStatusHtml(syncedLabel)}
      `;
    }
  };

  const closePopover = () => {
    popoverEl?.remove();
    popoverEl = null;
    selectedDateKey = null;
  };

  const openPopover = (dateKey, anchor) => {
    closePopover();
    selectedDateKey = dateKey;
    const info = getDayInfo(dateKey, state.days);

    popoverEl = document.createElement('div');
    popoverEl.className = 'pc-popover card';
    popoverEl.id = 'pc-day-popover';
    popoverEl.innerHTML = `
      <div class="pc-popover-head">
        <strong class="pc-popover-date">${esc(formatDateLabel(dateKey))}</strong>
        <button type="button" class="admin-modal-close btn-press pc-popover-close" aria-label="Закрыть">✕</button>
      </div>
      <p class="pc-popover-status">${esc(DAY_TYPE_LABELS[info.type])}</p>
      <label class="pc-popover-field">
        <span class="pc-popover-field-label">Название (необязательно)</span>
        <input type="text" class="pc-popover-input" id="pc-day-name" value="${esc(info.name || '')}" placeholder="Например: корпоративный выходной" />
      </label>
      <div class="pc-popover-types">
        ${[DAY_TYPES.WORKDAY, DAY_TYPES.WEEKEND, DAY_TYPES.HOLIDAY, DAY_TYPES.PREHOLIDAY].map(type => `
          <button
            type="button"
            class="pc-type-btn btn-press pc-type-btn--${type} ${info.type === type ? 'pc-type-btn--active' : ''}"
            data-type="${type}"
          >${esc(DAY_TYPE_LABELS[type])}</button>
        `).join('')}
      </div>
      <div class="pc-popover-foot">
        <button type="button" class="btn btn-primary btn-press" id="pc-save-day">Сохранить</button>
      </div>
    `;

    document.body.appendChild(popoverEl);
    positionPopover(popoverEl, anchor);
    bindPopoverEvents(info);
  };

  function formatDateLabel(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function positionPopover(el, anchor) {
    const rect = anchor.getBoundingClientRect();
    const popRect = el.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;

    if (left + popRect.width > window.innerWidth - 12) {
      left = window.innerWidth - popRect.width - 12;
    }
    if (top + popRect.height > window.innerHeight - 12) {
      top = rect.top - popRect.height - 8;
    }

    el.style.top = `${Math.max(12, top)}px`;
    el.style.left = `${Math.max(12, left)}px`;
  }

  const persistDay = async (dateKey, type, name) => {
    state.saving = true;
    refreshSyncUi();
    try {
      /** @type {import('../../shared/production-calendar.js').ProductionDayEntry} */
      const entry = { type };
      const trimmed = name?.trim();
      const autoName = defaultNameForType(type, dateKey);
      if (trimmed && trimmed !== autoName) {
        entry.name = trimmed;
      }
      const result = await saveProductionCalendarDay(state.year, dateKey, entry, state.days);
      state.days = result.days;
      state.manualOverrides = result.manualOverrides;
      state.apiDays = result.apiDays;
      onDaySaved?.(result);
      closePopover();
      refreshGrid();
    } catch (err) {
      console.error('[production-calendar-editor]', err);
      alert(err.message || 'Не удалось сохранить день');
    } finally {
      state.saving = false;
      refreshSyncUi();
    }
  };

  const runSync = async () => {
    if (state.syncing) return;
    closePopover();
    state.syncing = true;
    refreshSyncUi();

    try {
      const result = await syncProductionCalendarFromApi(state.year);
      const meta = await fetchProductionCalendar(state.year);
      state.days = result.days;
      state.manualOverrides = result.manualOverrides;
      state.apiDays = result.apiDays;
      state.syncedAt = meta?.syncedAt ?? null;
      onSynced?.({
        days: result.days,
        manualOverrides: result.manualOverrides,
        apiDays: result.apiDays,
        syncedAt: state.syncedAt,
      });
      refreshGrid();
      refreshSyncUi();
    } catch (err) {
      console.error('[production-calendar-editor]', err);
      alert(err.message || 'Не удалось синхронизировать календарь');
    } finally {
      state.syncing = false;
      refreshSyncUi();
    }
  };

  const bindPopoverEvents = info => {
    popoverEl?.querySelector('.pc-popover-close')?.addEventListener('click', closePopover);

    popoverEl?.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        popoverEl?.querySelectorAll('[data-type]').forEach(b => {
          b.classList.toggle('pc-type-btn--active', b === btn);
        });
        const type = btn.dataset.type;
        popoverEl.querySelector('.pc-popover-status').textContent = DAY_TYPE_LABELS[type];
        const nameInput = popoverEl?.querySelector('#pc-day-name');
        const autoName = buildDayEntry(type, selectedDateKey).name;
        if (nameInput) nameInput.value = autoName || '';
      });
    });

    popoverEl?.querySelector('#pc-save-day')?.addEventListener('click', () => {
      const active = popoverEl?.querySelector('.pc-type-btn--active');
      const type = active?.dataset.type || info.type;
      const nameInput = popoverEl?.querySelector('#pc-day-name');
      persistDay(selectedDateKey, type, nameInput?.value || '');
    });
  };

  const bindDayClicks = () => {
    host.querySelectorAll('[data-date]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openPopover(btn.dataset.date, btn);
      });
    });
  };

  const onDocClick = e => {
    if (!popoverEl) return;
    if (popoverEl.contains(e.target)) return;
    if (e.target.closest('[data-date]')) return;
    closePopover();
  };

  const bindEvents = () => {
    host.querySelector('#pc-year-select')?.addEventListener('change', e => {
      closePopover();
      initialScrollDone = false;
      onYearChange?.(Number(e.target.value));
    });

    host.querySelector('#pc-show-past')?.addEventListener('change', e => {
      state.showPastMonths = e.target.checked;
      initialScrollDone = false;
      refreshGrid();
    });

    host.querySelector('#pc-sync-btn')?.addEventListener('click', runSync);

    bindDayClicks();
  };

  document.addEventListener('click', onDocClick);
  render();

  return {
    setLoading(loading) {
      state.gridLoading = loading;
      host.querySelector('.pc-year-grid-wrap')?.classList.toggle('pc-year-grid-wrap--loading', loading);
    },

    updateData({ year: y, days: d, manualOverrides: mo, apiDays: ad, syncedAt: ts }) {
      if (y !== undefined) state.year = y;
      if (d) state.days = { ...d };
      if (mo) state.manualOverrides = { ...mo };
      if (ad !== undefined) state.apiDays = ad ? { ...ad } : null;
      if (ts !== undefined) state.syncedAt = ts;
      initialScrollDone = false;
      render();
    },

    destroy() {
      document.removeEventListener('click', onDocClick);
      closePopover();
      host.innerHTML = '';
    },
  };
}
