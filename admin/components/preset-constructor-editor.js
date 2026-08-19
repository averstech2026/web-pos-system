import {
  applyPreset,
  applyLkCardColor,
  bulkReplaceDomain,
  DEFAULT_COMPANY_NAME,
  DEFAULT_DOCUMENT_TITLE_BRAND,
  DEFAULT_LK_CARD_COLOR,
  DEFAULT_SUPPORT_PHONE,
  DEFAULT_THEME_PRIMARY,
  deriveLkCardPalette,
  getDefaultPreset,
  loadPreset,
  LOGO_INVERT_SLOT_META,
  normalizeHexColor,
  normalizeLogoInvertSlots,
  resetAppliedPreset,
  savePreset,
  setDocumentTitle,
} from '../../shared/demo-preset.js';
import { applyLogoInvertSlots } from '../../shared/demo-preset-logo-invert.js';
import {
  createSavedPresetFromDraft,
  DEFAULT_PRESET_ID,
  deleteSavedPreset,
  getActivePresetId,
  getSavedPresetById,
  loadSavedPresets,
  savedPresetToDemoPreset,
  setActivePresetId,
  updateSavedPresetFromDraft,
} from '../../shared/demo-preset-library.js';
import systemLogoUrl from '../../shared/assets/logo-ifcm-tech.png';
import kioskLogoUrl from '../../kiosk/public/assets/logo.png';
import {
  applyCashierThemePreview,
  CASHIER_THEME_GROUPS,
  DEFAULT_CASHIER_THEME,
  getDefaultCashierTheme,
  isDefaultCashierTheme,
  normalizeCashierTheme,
} from '../../shared/cashier-theme.js';

/** @type {{ id: string; label: string; path: string; url: string; modules: string[]; wide?: boolean }[]} */
const SYSTEM_LOGOS = [
  {
    id: 'main',
    label: 'Основной',
    path: 'shared/assets/logo-ifcm-tech.png',
    url: systemLogoUrl,
    modules: [
      'Админка (меню и вход)',
      'Личный кабинет',
      'Кухонный терминал',
      'Терминал выдачи',
      'Валидатор',
      'Табло очереди',
      'Касса',
    ],
  },
  {
    id: 'kiosk',
    label: 'Киоск',
    path: 'kiosk/public/assets/logo.png',
    url: kioskLogoUrl,
    wide: true,
    modules: [
      'Киоск — экран приветствия',
      'Киоск — шапки всех экранов',
    ],
  },
];

/** @type {{ id: string; label: string; applyTheme: boolean; effects: string[]; note?: string }[]} */
const THEME_MODULES = [
  {
    id: 'admin',
    label: 'Админка',
    applyTheme: true,
    effects: [
      'Фон бокового меню',
      'Кнопки .btn-primary и активные табы/чипы',
      'Акценты заголовков, focus и CRM-вкладок',
      'Экран входа',
    ],
  },
  {
    id: 'client-lk',
    label: 'Личный кабинет',
    applyTheme: true,
    effects: [
      'Карта питания — отдельный цвет (см. ниже)',
      'Аватар в шапке',
      'Основные кнопки: заказ, корзина, оплата',
      'Переключатели и акценты интерфейса',
    ],
  },
  {
    id: 'kitchen',
    label: 'Кухонный терминал',
    applyTheme: true,
    effects: [
      'Шапка и экран входа',
      'Таймеры заказов',
      'Основные кнопки и активные фильтры',
    ],
  },
  {
    id: 'delivery',
    label: 'Терминал выдачи',
    applyTheme: true,
    effects: [
      'Шапка и экран входа',
      'Кнопки подтверждения',
      'Активные состояния списка заказов',
    ],
  },
  {
    id: 'validator',
    label: 'Валидатор',
    applyTheme: true,
    effects: [
      'Экран входа и idle-экран',
      'Focus-состояния форм',
      'Primary-кнопки и текстовые акценты',
    ],
  },
  {
    id: 'queue',
    label: 'Табло очереди',
    applyTheme: true,
    effects: [
      'Заголовок и часы в шапке',
      'Номера заказов на табло',
      'Экран загрузки',
    ],
  },
  {
    id: 'kiosk',
    label: 'Киоск',
    applyTheme: true,
    effects: [
      'Экран приветствия и кнопка «Начать покупки»',
      'Боковая навигация (bg-navy)',
      'CTA по всему флоу: корзина, оплата, категории',
    ],
  },
  {
    id: 'cashier',
    label: 'Касса',
    applyTheme: false,
    effects: [
      'Собственная палитра (--ct-*)',
      'Настраивается в блоке «Кассовый модуль»',
      'Не зависит от основного цвета темы',
    ],
    note: 'Логотип и реквизиты — из пресета; палитра — отдельный блок ниже',
  },
];

/** @type {{ id: string; label: string; location: string; companyInfo: string[]; presetFields: string[]; note?: string }[]} */
const HEADER_COMPANY_MODULES = [
  {
    id: 'admin',
    label: 'Админка',
    location: 'Sidebar, экран входа',
    companyInfo: ['Логотип', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
  },
  {
    id: 'client-lk',
    label: 'Личный кабинет',
    location: 'lk-header, экран входа',
    companyInfo: ['Логотип', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
    note: 'Меню и оплата — без логотипа в хедере',
  },
  {
    id: 'kitchen',
    label: 'Кухня',
    location: 'kt-header, экран входа',
    companyInfo: ['Логотип', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
  },
  {
    id: 'delivery',
    label: 'Терминал выдачи',
    location: 'dt-header, экран входа',
    companyInfo: ['Логотип', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
  },
  {
    id: 'validator',
    label: 'Валидатор',
    location: 'vtd-head, idle-экран, вход',
    companyInfo: ['Логотип (хедер + idle)', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
  },
  {
    id: 'queue',
    label: 'Табло очереди',
    location: 'qs-header',
    companyInfo: ['Логотип', 'alt логотипа', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Бренд в title'],
  },
  {
    id: 'kiosk',
    label: 'Киоск',
    location: 'Экран приветствия, logo-header на всех экранах',
    companyInfo: ['Логотип', 'alt логотипа', '<title> (компания — модуль)'],
    presetFields: ['Логотип', 'Название компании'],
  },
  {
    id: 'cashier',
    label: 'Касса',
    location: 'ct-header, футер',
    companyInfo: ['Логотип', 'alt логотипа', 'Техподдержка 24/7', '<title> вкладки'],
    presetFields: ['Логотип', 'Название компании', 'Телефон поддержки', 'Бренд в title'],
  },
];

const ICON_SAVE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
const ICON_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;
const ICON_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const DEFAULT_PRESET_LABEL = `Дефолтный пресет (${DEFAULT_COMPANY_NAME})`;

/** @type {{ name: string; weights: string; cssVar?: string; modules: string[]; note?: string }[]} */
const DESIGN_FONTS = [
  {
    name: 'Montserrat',
    weights: '400–800',
    cssVar: '--font-base',
    modules: [
      'Админка',
      'Личный кабинет',
      'Кухонный терминал',
      'Терминал выдачи',
      'Валидатор',
      'Табло очереди',
      'Киоск',
      'Касса',
    ],
    note: 'Единый шрифт всех модулей. Касса — своя палитра (--ct-*), но тот же Montserrat',
  },
];

/** @type {{ token: string; label: string; hex: string; note?: string }[]} */
const DESIGN_COLOR_FIXED = [
  { token: '--color-danger', label: 'Ошибки / отмена', hex: '#E11D48' },
  { token: '--color-success', label: 'Успех / подтверждение', hex: '#27AE60' },
  { token: '--color-bg', label: 'Фон страницы', hex: '#F3F4F6' },
  { token: '--color-surface', label: 'Карточки и панели', hex: '#FFFFFF' },
  { token: '--color-surface-muted', label: 'Приглушённый фон', hex: '#F9FAFB' },
  { token: '--color-border', label: 'Границы', hex: '#E5E7EB' },
  { token: '--color-text', label: 'Основной текст', hex: '#1F2937' },
  { token: '--color-text-muted', label: 'Вторичный текст', hex: '#6B7280' },
  { token: '--color-indigo-soft', label: 'Indigo-фон (badges, toolbar)', hex: '#EEF2FF' },
  { token: '--color-indigo-border', label: 'Indigo-границы', hex: '#C7D2FE' },
];

/** @type {{ id: string; label: string; size: string }[]} */
const DESIGN_FONT_SCALE = [
  { id: '--font-size-xs', label: 'Мелкий (labels)', size: '11px' },
  { id: '--font-size-sm', label: 'Компактный', size: '12px' },
  { id: '--font-size-md', label: 'Базовый UI', size: '14px' },
  { id: '--font-size-lg', label: 'Крупный текст', size: '16px' },
  { id: '--font-size-xl', label: 'Подзаголовки', size: '20px' },
  { id: '--font-size-2xl', label: 'Заголовки', size: '24px' },
  { id: '--font-size-3xl', label: 'Hero / табло', size: '28px' },
];

const PREVIEW_RECEIPT_ITEMS = [
  { name: 'Борщ', price: '180 ₽', selected: true },
  { name: 'Котлета с пюре', price: '220 ₽' },
  { name: 'Салат Оливье', price: '95 ₽' },
  { name: 'Компот 0,3', price: '45 ₽' },
  { name: 'Булочка с маком', price: '55 ₽' },
  { name: 'Чай чёрный', price: '40 ₽' },
  { name: 'Сырники', price: '110 ₽' },
  { name: 'Кофе латте', price: '120 ₽' },
];

const PREVIEW_CATALOG_TILES = [
  { name: 'Борщ', color: '#6BA3C7' },
  { name: 'Котлета', color: '#6BA3C7' },
  { name: 'Салат Цезарь', color: '#A8D5BA' },
  { name: 'Компот', color: '#C5D8E8' },
  { name: 'Булочка', color: '#E8D4B8' },
  { name: 'Сырники', color: '#E8D4B8' },
  { name: 'Кофе', color: '#C5D8E8' },
  { name: 'Чай', color: '#C5D8E8' },
];

function renderCashierPreviewReceiptRows() {
  return PREVIEW_RECEIPT_ITEMS.map((item, index) => `
    <div class="dpc-cp-receipt-row${item.selected ? ' dpc-cp-receipt-row--selected' : ''}">
      <span>${index + 1}</span><span>${escapeHtml(item.name)}</span><span>${escapeHtml(item.price)}</span>
    </div>
  `).join('');
}

function renderCashierPreviewCatalogTiles() {
  return PREVIEW_CATALOG_TILES.map(tile => `
    <span class="dpc-cp-tile" style="background:${escapeAttr(tile.color)}">${escapeHtml(tile.name)}</span>
  `).join('');
}

/**
 * @param {HTMLElement} host
 * @param {{ onApplied?: (preset: import('../../shared/demo-preset.js').DemoPreset) => void }} [options]
 */
export function createPresetConstructorEditor(host, options = {}) {
  /** @type {import('../../shared/demo-preset.js').DemoPreset} */
  let draft = loadPreset() || getDefaultPreset();
  let activePresetId = getActivePresetId();
  /** @type {import('../../shared/demo-preset-library.js').SavedDemoPreset[]} */
  let savedPresets = loadSavedPresets();
  let createModalOpen = false;

  function isCustomPresetActive() {
    return activePresetId !== DEFAULT_PRESET_ID;
  }

  function loadDraftForActivePreset() {
    if (activePresetId === DEFAULT_PRESET_ID) {
      draft = getDefaultPreset();
      if (loadPreset() && !loadPreset()?.applied) {
        draft = { ...loadPreset(), applied: false };
      }
      return;
    }

    const saved = getSavedPresetById(activePresetId);
    if (saved) {
      draft = savedPresetToDemoPreset(saved);
      return;
    }

    activePresetId = DEFAULT_PRESET_ID;
    setActivePresetId(null);
    draft = getDefaultPreset();
  }

  function renderManagerBar() {
    const optionsHtml = [
      `<option value="${DEFAULT_PRESET_ID}"${activePresetId === DEFAULT_PRESET_ID ? ' selected' : ''}>${escapeHtml(DEFAULT_PRESET_LABEL)}</option>`,
      ...savedPresets.map(preset => `
        <option value="${escapeAttr(preset.id)}"${preset.id === activePresetId ? ' selected' : ''}>
          ${escapeHtml(preset.name)}
        </option>
      `),
    ].join('');

    const badgeHtml = isCustomPresetActive()
      ? '<span class="dpc-demo-badge" role="status"><span class="dpc-demo-badge-dot" aria-hidden="true">•</span> Режим демонстрации активен</span>'
      : '';

    const deleteBtnHtml = isCustomPresetActive()
      ? `<button type="button" class="dpc-manager-btn dpc-manager-btn--danger btn-press" id="dpc-delete-preset" title="Удалить выбранный пресет">${ICON_TRASH}<span>Удалить</span></button>`
      : '';

    return `
      <section class="card dpc-manager-bar">
        <div class="dpc-manager-left">
          <label class="dpc-manager-label" for="dpc-preset-select">Активный пресет</label>
          <div class="dpc-manager-select-wrap">
            <select id="dpc-preset-select" class="dpc-manager-select">${optionsHtml}</select>
            ${badgeHtml}
          </div>
        </div>
        <div class="dpc-manager-actions">
          <button
            type="button"
            class="dpc-manager-btn btn-press"
            id="dpc-save-preset"
            ${isCustomPresetActive() ? '' : 'disabled'}
            title="${isCustomPresetActive() ? 'Сохранить изменения в выбранный пресет' : 'Выберите или создайте кастомный пресет'}"
          >
            ${ICON_SAVE}
            <span>Сохранить текущие настройки</span>
          </button>
          <button type="button" class="dpc-manager-btn dpc-manager-btn--create btn-press" id="dpc-create-preset">
            ${ICON_PLUS}
            <span>Создать новый пресет</span>
          </button>
          ${deleteBtnHtml}
        </div>
      </section>
      ${createModalOpen ? renderCreateModal() : ''}
    `;
  }

  function renderCreateModal() {
    return `
      <div class="dpc-modal-backdrop" id="dpc-create-modal">
        <div class="dpc-modal card" role="dialog" aria-modal="true" aria-labelledby="dpc-create-modal-title">
          <h3 class="dpc-modal-title" id="dpc-create-modal-title">Новый пресет демонстрации</h3>
          <p class="dpc-modal-desc">
            Введите название — цвет, реквизиты компании и пользователи будут сохранены из текущей формы.
            Логотип заказчика нужно загрузить отдельно для каждого пресета.
          </p>
          <label class="dpc-field-label" for="dpc-create-name">Название пресета</label>
          <input
            type="text"
            id="dpc-create-name"
            class="dpc-field-input dpc-modal-input"
            placeholder="Пресет: Азбука Вкуса"
            maxlength="120"
          />
          <div class="dpc-modal-actions">
            <button type="button" class="btn btn-outline btn-press" id="dpc-create-cancel">Отмена</button>
            <button type="button" class="dpc-manager-btn dpc-manager-btn--create btn-press" id="dpc-create-confirm">
              ${ICON_PLUS}
              <span>Создать</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function getDraftCashierTheme() {
    return draft.cashierTheme
      ? normalizeCashierTheme(draft.cashierTheme)
      : getDefaultCashierTheme();
  }

  /** @type {ResizeObserver | null} */
  let previewScalerObserver = null;

  function updateCashierPreviewScale() {
    const scaler = host.querySelector('.dpc-cashier-preview-scaler');
    if (!(scaler instanceof HTMLElement)) return;
    const width = scaler.getBoundingClientRect().width;
    if (width <= 0) return;
    scaler.style.setProperty('--dpc-preview-scale', String(width / 1024));
  }

  function bindPreviewScaler() {
    previewScalerObserver?.disconnect();
    const scaler = host.querySelector('.dpc-cashier-preview-scaler');
    if (!(scaler instanceof HTMLElement)) return;

    updateCashierPreviewScale();
    previewScalerObserver = new ResizeObserver(() => updateCashierPreviewScale());
    previewScalerObserver.observe(scaler);
  }

  function refreshCashierThemePreview() {
    const preview = host.querySelector('[data-dpc-cashier-preview]');
    if (preview instanceof HTMLElement) {
      applyCashierThemePreview(getDraftCashierTheme(), preview);
    }
  }

  function renderCashierThemeSection() {
    const theme = getDraftCashierTheme();
    const isCustom = !isDefaultCashierTheme(theme);

    const groupsHtml = CASHIER_THEME_GROUPS.map(group => `
      <div class="dpc-cashier-group dpc-cashier-group--${escapeAttr(group.id)}">
        <h4 class="dpc-cashier-group-title">${escapeHtml(group.label)}</h4>
        <div class="dpc-cashier-fields">
          ${group.fields.map(field => `
            <div class="dpc-cashier-field">
              <label class="dpc-cashier-field-label" for="dpc-cashier-${escapeAttr(field.key)}">${escapeHtml(field.label)}</label>
              <div class="dpc-cashier-field-controls">
                <input
                  type="color"
                  id="dpc-cashier-${escapeAttr(field.key)}"
                  class="dpc-color-input"
                  data-cashier-theme-key="${escapeAttr(field.key)}"
                  value="${escapeAttr(theme[field.key] || DEFAULT_CASHIER_THEME[field.key])}"
                />
                <code class="dpc-color-value dpc-cashier-color-value" data-cashier-theme-value="${escapeAttr(field.key)}">${escapeHtml(theme[field.key] || DEFAULT_CASHIER_THEME[field.key])}</code>
              </div>
              <p class="dpc-cashier-field-hint">${field.hint ? escapeHtml(field.hint) : '\u00a0'}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <section class="card dpc-section dpc-section--cashier">
        <h2 class="dpc-section-title">3. Кассовый модуль — палитра</h2>
        <p class="dpc-section-desc">
          Отдельная цветовая схема кассы (<code>--ct-*</code>). Не связана с основным цветом темы
          и картой питания — меняется только здесь, для точной кастомизации под заказчика.
          ${isCustom
            ? 'Сейчас задана <strong>кастомная</strong> палитра.'
            : 'Сейчас используются <strong>заводские</strong> значения из CSS кассы.'}
        </p>

        <div class="dpc-cashier-layout">
          <div class="dpc-cashier-controls">
            <div class="dpc-cashier-controls-head">
              <button type="button" class="btn btn-outline btn-press" id="dpc-cashier-reset">
                Сбросить к заводским
              </button>
            </div>
            ${groupsHtml}
          </div>

          <div class="dpc-cashier-preview-wrap">
            <span class="dpc-cashier-preview-label">Предпросмотр · 1024×768</span>
            <div class="dpc-cashier-preview-scaler">
              <div class="dpc-cashier-preview" data-dpc-cashier-preview aria-hidden="true">
                <div class="dpc-cp-header">
                  <span class="dpc-cp-header-text">Заказ № 1042 · Касса 1</span>
                  <span class="dpc-cp-header-meta">12:45</span>
                </div>
                <div class="dpc-cp-body">
                <div class="dpc-cp-left">
                  <div class="dpc-cp-receipt">
                    ${renderCashierPreviewReceiptRows()}
                  </div>
                  <div class="dpc-cp-strip dpc-cp-strip--toolbar">
                    <span class="dpc-cp-strip-tag">Инструменты</span>
                    <div class="dpc-cp-strip-btns" aria-hidden="true">
                      <span>☰</span><span>−</span><span>123</span><span>+</span><span>×</span>
                    </div>
                  </div>
                  <div class="dpc-cp-totals">
                    <span>К оплате</span><strong>865 ₽</strong>
                  </div>
                  <div class="dpc-cp-actions">
                    <span class="dpc-cp-btn dpc-cp-btn--pay">ЧЕК</span>
                    <span class="dpc-cp-btn dpc-cp-btn--steel">КАРТА</span>
                    <span class="dpc-cp-btn dpc-cp-btn--exit">ВЫХОД</span>
                  </div>
                </div>
                <div class="dpc-cp-right">
                  <div class="dpc-cp-strip dpc-cp-strip--nav">
                    <span class="dpc-cp-strip-tag">Каталог</span>
                    <div class="dpc-cp-strip-btns" aria-hidden="true">
                      <span>←</span><span>⌂</span><span>♥</span><span>⌕</span>
                    </div>
                  </div>
                  <div class="dpc-cp-grid">
                    ${renderCashierPreviewCatalogTiles()}
                  </div>
                  <div class="dpc-cp-capsule">Меню / Вторые блюда</div>
                </div>
              </div>
              </div>
            </div>
            <p class="dpc-cashier-preview-legend">
              Слева: список заказа → инструменты (кол-во, скидка, удаление) → итоги → кнопки.
              Справа: навигация каталога и сетка товаров.
            </p>
          </div>
        </div>
      </section>
    `;
  }

  function collectDraftFromForm() {
    const companyName = host.querySelector('#dpc-company-name');
    const supportPhone = host.querySelector('#dpc-support-phone');
    const titleBrand = host.querySelector('#dpc-title-brand');
    const themeColor = host.querySelector('#dpc-theme-color');
    const lkCardColor = host.querySelector('#dpc-lk-card-color');

    if (companyName instanceof HTMLInputElement) draft.companyName = companyName.value;
    if (supportPhone instanceof HTMLInputElement) draft.supportPhone = supportPhone.value;
    if (titleBrand instanceof HTMLInputElement) draft.documentTitleBrand = titleBrand.value;
    if (themeColor instanceof HTMLInputElement) {
      draft.themePrimary = normalizeHexColor(themeColor.value) || DEFAULT_THEME_PRIMARY;
    }
    if (lkCardColor instanceof HTMLInputElement) {
      draft.lkCardColor = normalizeHexColor(lkCardColor.value) || DEFAULT_LK_CARD_COLOR;
    }

    const theme = { ...getDraftCashierTheme() };
    host.querySelectorAll('[data-cashier-theme-key]').forEach(input => {
      if (!(input instanceof HTMLInputElement)) return;
      const key = input.dataset.cashierThemeKey;
      if (!key || !(key in DEFAULT_CASHIER_THEME)) return;
      theme[key] = normalizeHexColor(input.value) || DEFAULT_CASHIER_THEME[key];
    });
    draft.cashierTheme = isDefaultCashierTheme(theme) ? null : normalizeCashierTheme(theme);
  }

  function switchActivePreset(nextId) {
    collectDraftFromForm();
    activePresetId = nextId;

    if (nextId === DEFAULT_PRESET_ID) {
      setActivePresetId(null);
      draft = resetAppliedPreset(systemLogoUrl, { activePresetId: null });
      setDocumentTitle('Пресет демонстрации');
      render();
      return;
    }

    const saved = getSavedPresetById(nextId);
    if (!saved) {
      activePresetId = DEFAULT_PRESET_ID;
      setActivePresetId(null);
      draft = resetAppliedPreset(systemLogoUrl, { activePresetId: null });
      render();
      return;
    }

    setActivePresetId(nextId);
    draft = applyPreset(savedPresetToDemoPreset(saved), { activePresetId: nextId });
    setDocumentTitle('Пресет демонстрации');
    options.onApplied?.(draft);
    render();
  }

  function saveCurrentPreset() {
    if (!isCustomPresetActive()) {
      alert('Сначала создайте или выберите кастомный пресет.');
      return;
    }

    collectDraftFromForm();
    const updated = updateSavedPresetFromDraft(activePresetId, draft);
    if (!updated) {
      alert('Не удалось сохранить пресет.');
      return;
    }

    savedPresets = loadSavedPresets();
    draft = applyPreset(savedPresetToDemoPreset(updated), { activePresetId });
    options.onApplied?.(draft);
    flashManagerAction('#dpc-save-preset', 'Сохранено ✓');
    render();
  }

  function openCreateModal() {
    createModalOpen = true;
    render();
    host.querySelector('#dpc-create-name')?.focus();
  }

  function closeCreateModal() {
    createModalOpen = false;
    render();
  }

  function confirmCreatePreset() {
    const input = host.querySelector('#dpc-create-name');
    const name = input instanceof HTMLInputElement ? input.value.trim() : '';
    if (!name) {
      alert('Введите название пресета.');
      return;
    }

    collectDraftFromForm();
    const created = createSavedPresetFromDraft(name, { ...draft, logoDataUrl: null });
    if (!created) {
      alert('Не удалось создать пресет.');
      return;
    }

    savedPresets = loadSavedPresets();
    activePresetId = created.id;
    setActivePresetId(created.id);
    draft = applyPreset(savedPresetToDemoPreset(created), { activePresetId: created.id });
    options.onApplied?.(draft);
    createModalOpen = false;
    setDocumentTitle('Пресет демонстрации');
    render();
  }

  function deleteActivePreset() {
    if (!isCustomPresetActive()) return;

    const saved = getSavedPresetById(activePresetId);
    const label = saved?.name || 'этот пресет';
    if (!confirm(`Удалить «${label}» из библиотеки?`)) return;

    deleteSavedPreset(activePresetId);
    savedPresets = loadSavedPresets();
    activePresetId = DEFAULT_PRESET_ID;
    setActivePresetId(null);
    draft = resetAppliedPreset(systemLogoUrl, { activePresetId: null });
    setDocumentTitle('Пресет демонстрации');
    render();
  }

  /** @param {string} selector @param {string} message */
  function flashManagerAction(selector, message) {
    const btn = host.querySelector(selector);
    if (!(btn instanceof HTMLButtonElement)) return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = message;
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = original;
    }, 1800);
  }

  loadDraftForActivePreset();
  draft.logoInvertSlots = normalizeLogoInvertSlots(draft.logoInvertSlots);
  if (isCustomPresetActive()) {
    const saved = getSavedPresetById(activePresetId);
    if (saved) draft = applyPreset(savedPresetToDemoPreset(saved), { activePresetId });
  } else {
    draft = resetAppliedPreset(systemLogoUrl, { activePresetId: null });
  }

  function persistDraft() {
    savePreset({ ...draft, applied: draft.applied });
  }

  function renderSystemLogos() {
    const customLogo = draft.logoDataUrl;
    const showCustom = Boolean(customLogo);

    return SYSTEM_LOGOS.map(logo => `
      <article class="dpc-logo-system-card${showCustom ? ' dpc-logo-system-card--replaced' : ''}">
        <div class="dpc-logo-system-head">
          <span class="dpc-logo-system-label">${escapeHtml(logo.label)}</span>
          <code class="dpc-logo-system-path">${escapeHtml(logo.path)}</code>
        </div>
        <div class="dpc-logo-system-preview-wrap${logo.wide ? ' dpc-logo-system-preview-wrap--wide' : ''}${showCustom ? ' dpc-logo-system-preview-wrap--replaced' : ''}">
          ${showCustom
            ? `<img
                src="${customLogo}"
                alt="Активный логотип заказчика"
                class="dpc-logo-system-preview dpc-logo-system-preview--active${logo.wide ? ' dpc-logo-system-preview--wide' : ''}"
              />`
            : `<img
                src="${logo.url}"
                alt="${escapeAttr(logo.label)}"
                class="dpc-logo-system-preview${logo.wide ? ' dpc-logo-system-preview--wide' : ''}"
              />`}
          ${showCustom ? '<span class="dpc-logo-system-replaced-badge">Заменён</span>' : ''}
        </div>
        <ul class="dpc-logo-system-modules">
          ${logo.modules.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
      </article>
    `).join('');
  }

  function renderCustomLogoBlock() {
    const status = getCustomLogoStatus(draft);
    const preview = draft.logoDataUrl
      ? `<img src="${draft.logoDataUrl}" alt="Логотип заказчика" class="dpc-logo-preview" />`
      : '<div class="dpc-logo-placeholder">Файл не загружен</div>';

    return `
      <div class="dpc-custom-block">
        <h3 class="dpc-subsection-title">Логотип заказчика</h3>
        <p class="dpc-section-desc">
          Один загруженный файл заменит оба системных логотипа во всех перечисленных модулях.
        </p>
        <p class="dpc-custom-status ${status.className}" role="status">${escapeHtml(status.text)}</p>
        <div class="dpc-logo-row">
          <div class="dpc-logo-preview-wrap brand-logo-wrap">${preview}</div>
          <div class="dpc-logo-actions">
            <label class="btn btn-outline btn-press dpc-upload-btn">
              Выбрать изображение
              <input type="file" accept="image/*" id="dpc-logo-input" hidden />
            </label>
            ${draft.logoDataUrl ? '<button type="button" class="btn btn-outline btn-press" id="dpc-logo-clear">Сбросить</button>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderLogoInvertBlock() {
    const slots = normalizeLogoInvertSlots(draft.logoInvertSlots);

    const rows = LOGO_INVERT_SLOT_META.map(slot => `
      <label class="dpc-logo-invert-row">
        <input
          type="checkbox"
          class="dpc-logo-invert-check"
          data-logo-invert-slot="${escapeAttr(slot.id)}"
          ${slots[slot.id] ? 'checked' : ''}
        />
        <span class="dpc-logo-invert-copy">
          <strong>${escapeHtml(slot.label)}</strong>
          <span>${escapeHtml(slot.location)}</span>
        </span>
      </label>
    `).join('');

    return `
      <div class="dpc-subsection dpc-logo-invert-block">
        <h3 class="dpc-subsection-title">Инвертирование логотипа в белый</h3>
        <p class="dpc-section-desc">
          Для тёмных фонов цветной логотип можно автоматически превращать в белый монохром
          (<code>filter: invert</code>). По умолчанию включено только для бокового меню админки.
          Работает и для логотипа заказчика.
        </p>
        <div class="dpc-logo-invert-grid">${rows}</div>
      </div>
    `;
  }

  function renderLkCardColorBlock() {
    const palette = deriveLkCardPalette(draft.lkCardColor || DEFAULT_LK_CARD_COLOR);
    const previewStyle = [
      `background: linear-gradient(145deg, ${palette.start} 0%, ${palette.mid} 30%, ${palette.base} 62%, ${palette.dark} 100%)`,
      `box-shadow: 0 14px 28px -10px rgba(${palette.shadow}, 0.45)`,
    ].join('; ');

    return `
      <div class="dpc-subsection dpc-lk-card-block">
        <h3 class="dpc-subsection-title">Карта питания (личный кабинет)</h3>
        <p class="dpc-section-desc">
          Отдельный контрастный градиент для панели с номером карты и QR-кодом.
          Не связан с основным цветом темы — можно задать свой оттенок.
          По умолчанию: <code>${escapeHtml(DEFAULT_LK_CARD_COLOR)}</code>.
        </p>
        <div class="dpc-color-row">
          <label class="dpc-color-label" for="dpc-lk-card-color">Базовый цвет карты</label>
          <input
            type="color"
            id="dpc-lk-card-color"
            class="dpc-color-input"
            value="${escapeAttr(draft.lkCardColor || DEFAULT_LK_CARD_COLOR)}"
          />
          <code class="dpc-color-value dpc-lk-card-color-value">${escapeHtml(draft.lkCardColor || DEFAULT_LK_CARD_COLOR)}</code>
        </div>
        <div class="dpc-lk-card-preview" style="${previewStyle}" aria-hidden="true">
          <div class="dpc-lk-card-preview-content">
            <span class="dpc-lk-card-preview-label">Карта питания:</span>
            <span class="dpc-lk-card-preview-code">BD4PSTZYSKC4</span>
            <span class="dpc-lk-card-preview-balance">Баланс: 330,00 ₽</span>
          </div>
          <div class="dpc-lk-card-preview-qr"></div>
        </div>
      </div>
    `;
  }

  function buildPresetColorRowsHtml() {
    const themePrimary = draft.themePrimary || DEFAULT_THEME_PRIMARY;
    const lkCard = draft.lkCardColor || DEFAULT_LK_CARD_COLOR;
    const cardPalette = deriveLkCardPalette(lkCard);
    const themeDark = deriveLkCardPalette(themePrimary).dark;

    /** @type {{ token: string; label: string; hex: string; preset?: string; note?: string }[]} */
    const presetColors = [
      {
        token: '--theme-primary / --color-navy',
        label: 'Основной цвет темы',
        hex: themePrimary,
        preset: 'themePrimary',
      },
      {
        token: '--color-primary-dark',
        label: 'Primary dark',
        hex: themeDark,
        note: 'Авто: −24 RGB от theme-primary',
      },
      {
        token: '--lk-card-base',
        label: 'Карта питания (ЛК)',
        hex: lkCard,
        preset: 'lkCardColor',
      },
      {
        token: '--lk-card-gradient-start',
        label: 'Карта — верх градиента',
        hex: cardPalette.start,
        note: 'Авто от lkCardColor',
      },
      {
        token: '--lk-card-dark',
        label: 'Карта — низ градиента',
        hex: cardPalette.dark,
        note: 'Авто от lkCardColor',
      },
    ];

    return presetColors.map(color => `
      <tr>
        <td>
          <span class="dpc-design-swatch" style="background:${escapeAttr(color.hex)}" aria-hidden="true"></span>
          <code>${escapeHtml(color.hex)}</code>
        </td>
        <td><code>${escapeHtml(color.token)}</code></td>
        <td>${escapeHtml(color.label)}</td>
        <td>
          ${color.preset
            ? `<span class="dpc-design-badge dpc-design-badge--preset">Пресет</span>`
            : `<span class="dpc-design-badge dpc-design-badge--derived">Авто</span>`}
        </td>
        <td class="dpc-design-note-cell">${color.note ? escapeHtml(color.note) : '—'}</td>
      </tr>
    `).join('');
  }

  function refreshPresetColorReference() {
    const tbody = host.querySelector('[data-dpc-preset-colors-body]');
    if (tbody) tbody.innerHTML = buildPresetColorRowsHtml();
  }

  function renderDesignSystemSection() {
    const fontCards = DESIGN_FONTS.map(font => `
      <article class="dpc-design-font-card">
        <div class="dpc-design-font-head">
          <span class="dpc-design-font-name" style="font-family: '${escapeAttr(font.name)}', sans-serif">${escapeHtml(font.name)}</span>
          <code class="dpc-design-font-weights">${escapeHtml(font.weights)}</code>
        </div>
        ${font.cssVar ? `<code class="dpc-design-token">${escapeHtml(font.cssVar)}</code>` : ''}
        <ul class="dpc-design-module-list">
          ${font.modules.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
        ${font.note ? `<p class="dpc-design-note">${escapeHtml(font.note)}</p>` : ''}
      </article>
    `).join('');

    const fixedColorRows = DESIGN_COLOR_FIXED.map(color => `
      <tr>
        <td>
          <span class="dpc-design-swatch" style="background:${escapeAttr(color.hex)}" aria-hidden="true"></span>
          <code>${escapeHtml(color.hex)}</code>
        </td>
        <td><code>${escapeHtml(color.token)}</code></td>
        <td>${escapeHtml(color.label)}</td>
        <td><span class="dpc-design-badge dpc-design-badge--fixed">Системный</span></td>
        <td class="dpc-design-note-cell">—</td>
      </tr>
    `).join('');

    const scaleRows = DESIGN_FONT_SCALE.map(row => `
      <tr>
        <td><code>${escapeHtml(row.id)}</code></td>
        <td>${escapeHtml(row.label)}</td>
        <td><code>${escapeHtml(row.size)}</code></td>
      </tr>
    `).join('');

    return `
      <section class="card dpc-section">
        <h2 class="dpc-section-title">6. Шрифты и системная палитра</h2>
        <p class="dpc-section-desc">
          Справочник типографики и цветовых токенов из <code>shared/styles.css</code>.
          Во всех модулях — <strong>Montserrat</strong> (<code>--font-base</code>).
          Пресет меняет только отмеченные цвета; шрифт и системные токены — фиксированы.
        </p>

        <div class="dpc-subsection">
          <h3 class="dpc-subsection-title">Шрифты по модулям</h3>
          <div class="dpc-design-font-grid">${fontCards}</div>
        </div>

        <div class="dpc-subsection">
          <h3 class="dpc-subsection-title">Шкала размеров (--font-size-*)</h3>
          <div class="dpc-table-wrap">
            <table class="dpc-table dpc-design-table">
              <thead>
                <tr>
                  <th>Токен</th>
                  <th>Назначение</th>
                  <th>Размер</th>
                </tr>
              </thead>
              <tbody>${scaleRows}</tbody>
            </table>
          </div>
        </div>

        <div class="dpc-subsection">
          <h3 class="dpc-subsection-title">Цвета пресета (текущие значения)</h3>
          <div class="dpc-table-wrap">
            <table class="dpc-table dpc-design-table">
              <thead>
                <tr>
                  <th>Образец</th>
                  <th>CSS-переменная</th>
                  <th>Назначение</th>
                  <th>Источник</th>
                  <th>Примечание</th>
                </tr>
              </thead>
              <tbody data-dpc-preset-colors-body>${buildPresetColorRowsHtml()}</tbody>
            </table>
          </div>
        </div>

        <div class="dpc-subsection">
          <h3 class="dpc-subsection-title">Системные цвета (не меняются пресетом)</h3>
          <div class="dpc-table-wrap">
            <table class="dpc-table dpc-design-table">
              <thead>
                <tr>
                  <th>Образец</th>
                  <th>CSS-переменная</th>
                  <th>Назначение</th>
                  <th>Источник</th>
                  <th>Примечание</th>
                </tr>
              </thead>
              <tbody>${fixedColorRows}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function renderThemeModules() {
    return THEME_MODULES.map(mod => `
      <article class="dpc-theme-module-card${mod.applyTheme ? '' : ' dpc-theme-module-card--excluded'}">
        <div class="dpc-theme-module-head">
          <span class="dpc-theme-module-label">${escapeHtml(mod.label)}</span>
          <span class="dpc-theme-module-badge${mod.applyTheme ? ' dpc-theme-module-badge--on' : ' dpc-theme-module-badge--off'}">
            ${mod.applyTheme ? 'Цвет меняется' : 'Без изменений'}
          </span>
        </div>
        <ul class="dpc-theme-module-effects">
          ${mod.effects.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
        </ul>
        ${mod.note ? `<p class="dpc-theme-module-note">${escapeHtml(mod.note)}</p>` : ''}
      </article>
    `).join('');
  }

  function renderHeaderCompanyModules() {
    return HEADER_COMPANY_MODULES.map(mod => `
      <article class="dpc-header-module-card">
        <div class="dpc-header-module-head">
          <span class="dpc-header-module-label">${escapeHtml(mod.label)}</span>
          <code class="dpc-header-module-location">${escapeHtml(mod.location)}</code>
        </div>
        <div class="dpc-header-module-columns">
          <div class="dpc-header-module-col">
            <span class="dpc-header-module-col-title">В хедере</span>
            <ul class="dpc-header-module-list">
              ${mod.companyInfo.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
          <div class="dpc-header-module-col">
            <span class="dpc-header-module-col-title">Управляется пресетом</span>
            <ul class="dpc-header-module-list dpc-header-module-list--preset">
              ${mod.presetFields.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        </div>
        ${mod.note ? `<p class="dpc-header-module-note">${escapeHtml(mod.note)}</p>` : '<p class="dpc-header-module-note dpc-header-module-note--empty" aria-hidden="true"></p>'}
      </article>
    `).join('');
  }

  function renderCompanyFieldsBlock() {
    const companyName = draft.companyName || DEFAULT_COMPANY_NAME;
    const titleBrand = draft.documentTitleBrand || DEFAULT_DOCUMENT_TITLE_BRAND;
    const titlePreviewSuffix = `Админ-панель — ${titleBrand}`;
    const titlePreviewPrefix = `${companyName} — Киоск самообслуживания`;

    return `
      <div class="dpc-company-fields">
        <div class="dpc-field-row">
          <label class="dpc-field-label" for="dpc-company-name">Название компании</label>
          <input
            type="text"
            id="dpc-company-name"
            class="dpc-field-input"
            value="${escapeAttr(draft.companyName)}"
            placeholder="${escapeAttr(DEFAULT_COMPANY_NAME)}"
          />
          <p class="dpc-field-hint">Alt-текст логотипов и префикс title киоска.</p>
        </div>
        <div class="dpc-field-row">
          <label class="dpc-field-label" for="dpc-support-phone">Телефон техподдержки</label>
          <input
            type="text"
            id="dpc-support-phone"
            class="dpc-field-input"
            value="${escapeAttr(draft.supportPhone)}"
            placeholder="${escapeAttr(DEFAULT_SUPPORT_PHONE)}"
          />
          <p class="dpc-field-hint">Касса: хедер продаж и футер (<code>data-brand-support</code>).</p>
        </div>
        <div class="dpc-field-row">
          <label class="dpc-field-label" for="dpc-title-brand">Бренд в &lt;title&gt;</label>
          <input
            type="text"
            id="dpc-title-brand"
            class="dpc-field-input"
            value="${escapeAttr(draft.documentTitleBrand)}"
            placeholder="${escapeAttr(DEFAULT_DOCUMENT_TITLE_BRAND)}"
          />
          <p class="dpc-field-hint">
            Суффикс вкладки: «Админ-панель — <strong>${escapeHtml(draft.documentTitleBrand || DEFAULT_DOCUMENT_TITLE_BRAND)}</strong>».
            Киоск: «<strong>${escapeHtml(draft.companyName || DEFAULT_COMPANY_NAME)}</strong> — Киоск…».
          </p>
        </div>
        <div class="dpc-title-preview">
          <div class="dpc-title-preview-item">
            <span class="dpc-title-preview-label">Пример (модули)</span>
            <code>${escapeHtml(titlePreviewSuffix)}</code>
          </div>
          <div class="dpc-title-preview-item">
            <span class="dpc-title-preview-label">Пример (киоск)</span>
            <code>${escapeHtml(titlePreviewPrefix)}</code>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const rows = draft.serviceUsers.map(user => `
      <tr data-user-id="${user.id}">
        <td>
          <input
            type="text"
            class="dpc-inline-input"
            data-field="name"
            value="${escapeAttr(user.name)}"
            aria-label="Имя пользователя"
          />
        </td>
        <td>
          <input
            type="email"
            class="dpc-inline-input"
            data-field="email"
            value="${escapeAttr(user.email)}"
            aria-label="Email пользователя"
          />
        </td>
      </tr>
    `).join('');

    host.innerHTML = `
      <div class="dpc-page">
        ${renderManagerBar()}
        <section class="card dpc-section">
          <h2 class="dpc-section-title">1. Брендирование (логотип)</h2>
          <p class="dpc-section-desc">
            ${draft.logoDataUrl
              ? 'Логотип заказчика заменяет оба системных файла ниже во всех модулях.'
              : 'Пока логотип заказчика не загружен, в интерфейсе используются два системных файла.'}
          </p>
          <div class="dpc-subsection">
            <h3 class="dpc-subsection-title">Системные логотипы (по умолчанию)</h3>
            <div class="dpc-logo-system-grid">${renderSystemLogos()}</div>
          </div>
          ${renderCustomLogoBlock()}
          ${renderLogoInvertBlock()}
        </section>

        <section class="card dpc-section">
          <h2 class="dpc-section-title">2. Управление цветом</h2>
          <p class="dpc-section-desc">
            Основной цвет задаёт CSS-переменные <code>--theme-primary</code>, <code>--color-navy</code>,
            <code>--color-primary</code> и <code>--color-primary-dark</code> на странице.
            По умолчанию: <code>${escapeHtml(DEFAULT_THEME_PRIMARY)}</code>.
          </p>
          <div class="dpc-color-row">
            <label class="dpc-color-label" for="dpc-theme-color">Основной цвет темы</label>
            <input
              type="color"
              id="dpc-theme-color"
              class="dpc-color-input"
              value="${escapeAttr(draft.themePrimary)}"
            />
            <code class="dpc-color-value">${escapeHtml(draft.themePrimary)}</code>
          </div>
          ${renderLkCardColorBlock()}
          <div class="dpc-subsection">
            <h3 class="dpc-subsection-title">Сводка по модулям</h3>
            <div class="dpc-theme-module-grid">${renderThemeModules()}</div>
          </div>
        </section>

        ${renderCashierThemeSection()}

        <section class="card dpc-section">
          <h2 class="dpc-section-title">4. Информация компании</h2>
          <p class="dpc-section-desc">
            Текстовые поля брендинга: название, телефон поддержки и бренд во вкладке браузера.
            По умолчанию: «${escapeHtml(DEFAULT_COMPANY_NAME)}», «${escapeHtml(DEFAULT_SUPPORT_PHONE)}»,
            title «… — ${escapeHtml(DEFAULT_DOCUMENT_TITLE_BRAND)}».
          </p>
          ${renderCompanyFieldsBlock()}
          <div class="dpc-subsection">
            <h3 class="dpc-subsection-title">Сводка по хедерам модулей</h3>
            <div class="dpc-header-module-grid">${renderHeaderCompanyModules()}</div>
          </div>
        </section>

        <section class="card dpc-section">
          <h2 class="dpc-section-title">5. Служебные пользователи и маскировка доменов</h2>
          <div class="dpc-domain-row">
            <label class="dpc-domain-label" for="dpc-new-domain">Новый домен для email (вместо ifcm.demo)</label>
            <div class="dpc-domain-controls">
              <input
                type="text"
                id="dpc-new-domain"
                class="dpc-domain-input"
                placeholder="newclient.ru"
              />
              <button type="button" class="btn btn-outline btn-press" id="dpc-domain-apply">
                Применить ко всем
              </button>
            </div>
          </div>
          <div class="dpc-table-wrap">
            <table class="dpc-table">
              <thead>
                <tr>
                  <th>Логин / Имя пользователя</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody id="dpc-users-body">
                ${rows}
              </tbody>
            </table>
          </div>
        </section>

        ${renderDesignSystemSection()}

        <div class="dpc-apply-wrap">
          <button type="button" class="dpc-apply-btn btn-press" id="dpc-apply-btn">
            Применить пресет демонстрации
          </button>
          <p class="dpc-apply-hint">Изменения применяются ко всему фронтенду без перезагрузки страницы.</p>
        </div>
      </div>
    `;

    bindEvents();
    bindPreviewScaler();
    refreshCashierThemePreview();
    requestAnimationFrame(() => {
      updateCashierPreviewScale();
      refreshCashierThemePreview();
    });
  }

  function bindEvents() {
    host.querySelector('#dpc-preset-select')?.addEventListener('change', event => {
      const select = /** @type {HTMLSelectElement} */ (event.target);
      switchActivePreset(select.value);
    });

    host.querySelector('#dpc-save-preset')?.addEventListener('click', () => saveCurrentPreset());
    host.querySelector('#dpc-create-preset')?.addEventListener('click', () => openCreateModal());
    host.querySelector('#dpc-delete-preset')?.addEventListener('click', () => deleteActivePreset());
    host.querySelector('#dpc-create-cancel')?.addEventListener('click', () => closeCreateModal());
    host.querySelector('#dpc-create-confirm')?.addEventListener('click', () => confirmCreatePreset());
    host.querySelector('#dpc-create-modal')?.addEventListener('click', event => {
      if (event.target instanceof HTMLElement && event.target.id === 'dpc-create-modal') {
        closeCreateModal();
      }
    });
    host.querySelector('#dpc-create-name')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmCreatePreset();
      }
      if (event.key === 'Escape') closeCreateModal();
    });

    host.querySelector('#dpc-logo-input')?.addEventListener('change', event => {
      const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('Выберите файл изображения (PNG/JPG).');
        return;
      }

      // Prevent quotaExceededError / Firestore string size limit:
      // see console errors: `logoDataUrl longer than 104857 bytes`
      // and: `Failed to execute 'setItem' on 'Storage' ... exceeded the quota`
      (async () => {
        try {
          host.querySelector('#dpc-logo-input')?.setAttribute('disabled', 'true');
          const compressed = await compressLogoToJpegDataUrl(file);
          const approxBytes = estimateDataUrlBytes(compressed);

          // Keep a safe margin under Firestore error threshold (~104857).
          if (approxBytes > 98000) {
            alert('Логотип слишком большой. Уменьшите картинку (лучше до 80–100KB) и попробуйте снова.');
            return;
          }

          draft.logoDataUrl = compressed || null;
          persistDraft();
          render();
        } catch (err) {
          alert(err?.message || 'Ошибка загрузки/сжатия логотипа.');
        } finally {
          host.querySelector('#dpc-logo-input')?.removeAttribute('disabled');
        }
      })();
    });

    host.querySelector('#dpc-logo-clear')?.addEventListener('click', () => {
      draft.logoDataUrl = null;
      persistDraft();
      render();
    });

    host.querySelectorAll('.dpc-logo-invert-check').forEach(input => {
      input.addEventListener('change', event => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const slotId = target.dataset.logoInvertSlot;
        if (!slotId) return;
        draft.logoInvertSlots = normalizeLogoInvertSlots({
          ...draft.logoInvertSlots,
          [slotId]: target.checked,
        });
        applyLogoInvertSlots(draft.logoInvertSlots);
        persistDraft();
      });
    });

    host.querySelector('#dpc-theme-color')?.addEventListener('input', event => {
      const value = /** @type {HTMLInputElement} */ (event.target).value;
      draft.themePrimary = normalizeHexColor(value) || DEFAULT_THEME_PRIMARY;
      host.querySelector('.dpc-color-value:not(.dpc-lk-card-color-value)').textContent = draft.themePrimary;
      persistDraft();
      refreshPresetColorReference();
    });

    host.querySelector('#dpc-lk-card-color')?.addEventListener('input', event => {
      const value = /** @type {HTMLInputElement} */ (event.target).value;
      draft.lkCardColor = normalizeHexColor(value) || DEFAULT_LK_CARD_COLOR;
      const code = host.querySelector('.dpc-lk-card-color-value');
      if (code) code.textContent = draft.lkCardColor;
      applyLkCardColor(draft.lkCardColor);
      persistDraft();
      const block = host.querySelector('.dpc-lk-card-preview');
      if (block instanceof HTMLElement) {
        const palette = deriveLkCardPalette(draft.lkCardColor);
        block.style.background = `linear-gradient(145deg, ${palette.start} 0%, ${palette.mid} 30%, ${palette.base} 62%, ${palette.dark} 100%)`;
        block.style.boxShadow = `0 14px 28px -10px rgba(${palette.shadow}, 0.45)`;
      }
      refreshPresetColorReference();
    });

    host.querySelectorAll('[data-cashier-theme-key]').forEach(input => {
      input.addEventListener('input', event => {
        const target = /** @type {HTMLInputElement} */ (event.target);
        const key = target.dataset.cashierThemeKey;
        if (!key || !(key in DEFAULT_CASHIER_THEME)) return;

        const theme = { ...getDraftCashierTheme(), [key]: normalizeHexColor(target.value) || DEFAULT_CASHIER_THEME[key] };

        const code = host.querySelector(`[data-cashier-theme-value="${key}"]`);
        if (code) code.textContent = theme[key];

        draft.cashierTheme = isDefaultCashierTheme(theme) ? null : normalizeCashierTheme(theme);
        persistDraft();
        refreshCashierThemePreview();
      });
    });

    host.querySelector('#dpc-cashier-reset')?.addEventListener('click', () => {
      draft.cashierTheme = null;
      persistDraft();
      render();
    });

    host.querySelector('#dpc-company-name')?.addEventListener('input', event => {
      draft.companyName = /** @type {HTMLInputElement} */ (event.target).value;
      persistDraft();
    });

    host.querySelector('#dpc-support-phone')?.addEventListener('input', event => {
      draft.supportPhone = /** @type {HTMLInputElement} */ (event.target).value;
      persistDraft();
    });

    host.querySelector('#dpc-title-brand')?.addEventListener('input', event => {
      draft.documentTitleBrand = /** @type {HTMLInputElement} */ (event.target).value;
      persistDraft();
    });

    host.querySelector('#dpc-company-name')?.addEventListener('blur', () => render());
    host.querySelector('#dpc-support-phone')?.addEventListener('blur', () => render());
    host.querySelector('#dpc-title-brand')?.addEventListener('blur', () => render());

    host.querySelector('#dpc-domain-apply')?.addEventListener('click', () => {
      const input = host.querySelector('#dpc-new-domain');
      const domain = input instanceof HTMLInputElement ? input.value.trim() : '';
      if (!domain) {
        alert('Введите новый домен, например newclient.ru');
        return;
      }
      draft.serviceUsers = bulkReplaceDomain(draft.serviceUsers, domain);
      persistDraft();
      render();
    });

    host.querySelector('#dpc-users-body')?.addEventListener('input', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const row = input.closest('tr');
      const userId = row?.getAttribute('data-user-id');
      const field = input.dataset.field;
      if (!userId || (field !== 'name' && field !== 'email')) return;

      const user = draft.serviceUsers.find(u => u.id === userId);
      if (!user) return;
      user[field] = input.value;
      persistDraft();
    });

    host.querySelector('#dpc-apply-btn')?.addEventListener('click', () => {
      collectDraftFromForm();
      const applied = applyPreset(
        { ...draft, applied: true },
        { activePresetId: isCustomPresetActive() ? activePresetId : null },
      );
      draft = applied;
      if (isCustomPresetActive()) {
        updateSavedPresetFromDraft(activePresetId, draft);
        savedPresets = loadSavedPresets();
      }
      options.onApplied?.(applied);
      setDocumentTitle('Пресет демонстрации');
      render();

      const btn = host.querySelector('#dpc-apply-btn');
      if (btn instanceof HTMLButtonElement) {
        const original = btn.textContent;
        btn.textContent = 'Пресет применён ✓';
        btn.disabled = true;
        setTimeout(() => {
          const again = host.querySelector('#dpc-apply-btn');
          if (again instanceof HTMLButtonElement) {
            again.textContent = original;
            again.disabled = false;
          }
        }, 2200);
      }
    });
  }

  render();

  return {
    destroy() {
      previewScalerObserver?.disconnect();
      previewScalerObserver = null;
      host.innerHTML = '';
    },
  };
}

/** @param {import('../../shared/demo-preset.js').DemoPreset} draft */
function getCustomLogoStatus(draft) {
  if (draft.logoDataUrl && draft.applied) {
    return {
      text: 'Применён — заменяет оба системных логотипа во всех модулях',
      className: 'dpc-custom-status--applied',
    };
  }
  if (draft.logoDataUrl) {
    return {
      text: 'Загружен — нажмите «Применить пресет демонстрации»',
      className: 'dpc-custom-status--pending',
    };
  }
  return {
    text: 'Не загружен — используются системные логотипы выше',
    className: 'dpc-custom-status--default',
  };
}

/** @param {string} value */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function estimateDataUrlBytes(dataUrl) {
  // Rough estimate: base64 payload bytes ~ base64Len * 3 / 4.
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Compress uploaded logo to keep it within Firestore/localStorage limits.
 * Output format: JPEG (to reduce size).
 *
 * @param {File} file
 * @returns {Promise<string>} jpeg data url
 */
async function compressLogoToJpegDataUrl(file) {
  if (!file) throw new Error('No file');

  // SVG -> canvas can be unreliable; keep behavior strict.
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error('Нужно PNG/JPG изображение.');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });

  // If it’s already small enough, keep as-is.
  // (Console showed Firestore limit ~104857 bytes for logoDataUrl.)
  const approxBytes = estimateDataUrlBytes(dataUrl);
  if (approxBytes <= 90000) return dataUrl;

  const img = new Image();
  img.decoding = 'async';

  return await new Promise((resolve, reject) => {
    img.onload = () => {
      const MAX_SIDE = 420; // quality/size trade-off
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        reject(new Error('Не удалось прочитать изображение.'));
        return;
      }

      const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
      const width = Math.max(1, Math.round(srcW * scale));
      const height = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Не удалось создать canvas.'));
        return;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // If input is PNG, try preserving transparency first.
      if (file.type === 'image/png') {
        const outPng = canvas.toDataURL('image/png');
        // Keep consistent with the safe threshold used on save.
        if (estimateDataUrlBytes(outPng) <= 98000) {
          resolve(outPng);
          return;
        }
      }

      // JPEG reduces size dramatically but it doesn't support transparency.
      // Fill background to avoid "black box" artifacts.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      const outJpeg = canvas.toDataURL('image/jpeg', 0.72);
      resolve(outJpeg);
    };
    img.onerror = () => reject(new Error('Не удалось загрузить изображение.'));
    img.src = dataUrl;
  });
}
