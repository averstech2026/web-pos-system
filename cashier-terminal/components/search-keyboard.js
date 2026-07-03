import { esc, escAttr } from '../core/format.js';

const JCUKEN_ROWS = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю'],
];

const QWERTY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const NUMBERS_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ',', '.'],
];

const BACKSPACE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M17 6H8.5a2 2 0 0 0-1.7.94L3 12l3.8 5.06A2 2 0 0 0 8.5 18H17a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z"/><path d="m14 10-4 4M10 10l4 4"/></svg>`;

const COLLAPSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

const EXPAND_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`;

/** @typedef {'jcuken'|'qwerty'|'numbers'} SearchKeyboardLayout */

/**
 * @param {object} config
 * @param {string} config.zoneAttr
 * @param {string} config.inputAttr
 * @param {string} config.placeholder
 * @param {string} config.clearAction
 * @param {string} config.collapseAction
 * @param {string} config.layoutAction
 * @param {string} config.backspaceAction
 * @param {string} [config.zoneClass]
 * @param {object} opts
 * @param {string} [opts.query]
 * @param {boolean} [opts.keyboardOpen]
 * @param {SearchKeyboardLayout} [opts.layout]
 */
export function renderSearchKeyboardZone(config, {
  query = '',
  keyboardOpen = true,
  layout = 'jcuken',
} = {}) {
  const keyboardBody = layout === 'numbers'
    ? renderNumbersKeyboard(config.layoutAction, config.backspaceAction)
    : renderLetterKeyboard(layout, config.layoutAction, config.backspaceAction);

  const zoneClass = config.zoneClass || 'dynamic-keyboard-zone';

  return `
    <div class="${zoneClass} ${keyboardOpen ? '' : 'dynamic-keyboard-zone--collapsed'}" ${config.zoneAttr}>
      <div class="ct-catalog-search-wrap">
        <input
          type="text"
          class="ct-catalog-search-input"
          ${config.inputAttr}=""
          value="${escAttr(query)}"
          placeholder="${escAttr(config.placeholder)}"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          inputmode="search"
        />
        <button type="button" class="ct-catalog-search-clear btn-press ${query ? '' : 'ct-catalog-search-clear--hidden'}" data-action="${escAttr(config.clearAction)}" aria-label="Очистить поиск">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button type="button" class="ct-catalog-search-toggle btn-press" data-action="${escAttr(config.collapseAction)}" aria-label="${keyboardOpen ? 'Свернуть клавиатуру' : 'Развернуть клавиатуру'}">
          ${keyboardOpen ? COLLAPSE_ICON : EXPAND_ICON}
        </button>
      </div>
      <div class="ct-catalog-keyboard" data-search-keyboard>
        ${keyboardBody}
      </div>
    </div>
  `;
}

function renderLetterKeyRow(keys) {
  return `
    <div class="ct-catalog-keyboard-row ct-catalog-keyboard-row--letters">
      ${keys.map(key => `
        <button type="button" class="ct-catalog-key ct-catalog-key--letter btn-press" data-kb-key="${escAttr(key)}">${esc(key)}</button>
      `).join('')}
    </div>
  `;
}

function renderLetterKeyboard(layout, layoutAction, backspaceAction) {
  const rows = layout === 'qwerty' ? QWERTY_ROWS : JCUKEN_ROWS;
  const layoutLabel = layout === 'qwerty' ? 'Ru' : 'En';
  const toggleTarget = layout === 'qwerty' ? 'jcuken' : 'qwerty';

  return `
    ${rows.map(row => renderLetterKeyRow(row)).join('')}
    <div class="ct-catalog-keyboard-row ct-catalog-keyboard-row--actions">
      <button type="button" class="ct-catalog-key ct-catalog-key--layout btn-press" data-action="${escAttr(layoutAction)}" data-kb-layout="${escAttr(toggleTarget)}">${layoutLabel}</button>
      <button type="button" class="ct-catalog-key ct-catalog-key--layout btn-press" data-action="${escAttr(layoutAction)}" data-kb-layout="numbers">123</button>
      <button type="button" class="ct-catalog-key ct-catalog-key--space btn-press" data-kb-key=" ">Пробел</button>
      <button type="button" class="ct-catalog-key ct-catalog-key--backspace btn-press" data-action="${escAttr(backspaceAction)}" aria-label="Стереть">${BACKSPACE_ICON}</button>
    </div>
  `;
}

function renderNumbersKeyboard(layoutAction, backspaceAction) {
  return `
    ${renderLetterKeyRow(NUMBERS_ROWS[0])}
    <div class="ct-catalog-keyboard-row ct-catalog-keyboard-row--actions">
      <button type="button" class="ct-catalog-key ct-catalog-key--layout btn-press" data-action="${escAttr(layoutAction)}" data-kb-layout="jcuken">АБВ</button>
      <button type="button" class="ct-catalog-key ct-catalog-key--space btn-press" data-kb-key=" ">Пробел</button>
      <button type="button" class="ct-catalog-key ct-catalog-key--backspace btn-press" data-action="${escAttr(backspaceAction)}" aria-label="Стереть">${BACKSPACE_ICON}</button>
    </div>
  `;
}

/**
 * @param {HTMLElement} zone
 * @param {object} config
 * @param {string} config.inputAttr
 * @param {string} config.clearAction
 * @param {string} config.collapseAction
 * @param {string} config.layoutAction
 * @param {string} config.backspaceAction
 * @param {object} handlers
 * @param {(query: string) => void} handlers.onQueryChange
 * @param {() => void} [handlers.onClear]
 * @param {() => void} [handlers.onCollapseToggle]
 * @param {(layout: SearchKeyboardLayout) => void} [handlers.onLayoutChange]
 */
export function bindSearchKeyboardZone(zone, config, {
  onQueryChange,
  onClear,
  onCollapseToggle,
  onLayoutChange,
}) {
  function getInput() {
    return zone.querySelector('input.ct-catalog-search-input');
  }

  let queryValue = getInput()?.value ?? '';

  function setQuery(next) {
    queryValue = next;
    const inputEl = getInput();
    if (inputEl) inputEl.value = next;
    const clearBtn = zone.querySelector(`[data-action="${config.clearAction}"]`);
    clearBtn?.classList.toggle('ct-catalog-search-clear--hidden', !next);
    onQueryChange(next);
  }

  getInput()?.addEventListener('input', (e) => {
    setQuery(e.currentTarget.value);
  });

  zone.querySelector(`[data-action="${config.clearAction}"]`)?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setQuery('');
    onClear?.();
    getInput()?.focus();
  });

  zone.querySelectorAll('[data-kb-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.kbKey ?? '';
      if (key === '.' && queryValue.includes('.')) return;
      if (key === ',' && (queryValue.includes(',') || queryValue.includes('.'))) return;
      setQuery(`${queryValue}${key}`);
    });
  });

  zone.querySelector(`[data-action="${config.backspaceAction}"]`)?.addEventListener('click', () => {
    setQuery(queryValue.slice(0, -1));
  });

  zone.querySelector(`[data-action="${config.collapseAction}"]`)?.addEventListener('click', () => {
    onCollapseToggle?.();
  });

  zone.querySelectorAll(`[data-action="${config.layoutAction}"]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.kbLayout;
      if (next === 'jcuken' || next === 'qwerty' || next === 'numbers') onLayoutChange?.(next);
    });
  });

  return {
    focusInput: () => getInput()?.focus(),
    getQuery: () => queryValue,
    setQuery,
  };
}

const CATALOG_SEARCH_CONFIG = {
  zoneAttr: 'data-catalog-search-zone',
  inputAttr: 'data-catalog-search-input',
  placeholder: 'Поиск товара или цены...',
  clearAction: 'catalog-search-clear',
  collapseAction: 'catalog-kb-collapse',
  layoutAction: 'catalog-kb-layout',
  backspaceAction: 'catalog-kb-backspace',
};

const GUEST_SEARCH_CONFIG = {
  zoneAttr: 'data-guest-search-zone',
  inputAttr: 'data-guest-search-input',
  placeholder: 'Имя, карта, телефон…',
  clearAction: 'guest-search-clear',
  collapseAction: 'guest-kb-collapse',
  layoutAction: 'guest-kb-layout',
  backspaceAction: 'guest-kb-backspace',
  zoneClass: 'dynamic-keyboard-zone dynamic-keyboard-zone--guest',
};

/** @param {object} opts */
export function renderCatalogSearchZone(opts = {}) {
  return renderSearchKeyboardZone(CATALOG_SEARCH_CONFIG, opts);
}

/** @param {HTMLElement} zone @param {object} handlers */
export function bindCatalogSearchZone(zone, handlers) {
  return bindSearchKeyboardZone(zone, CATALOG_SEARCH_CONFIG, handlers);
}

/** @param {object} opts */
export function renderGuestSearchZone(opts = {}) {
  return renderSearchKeyboardZone(GUEST_SEARCH_CONFIG, opts);
}

/** @param {HTMLElement} zone @param {object} handlers */
export function bindGuestSearchZone(zone, handlers) {
  return bindSearchKeyboardZone(zone, GUEST_SEARCH_CONFIG, handlers);
}
