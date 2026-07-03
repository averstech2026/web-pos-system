import {
  CASHIER_DISCOUNT_ROLE_OPTIONS,
  createCashierDiscountPreset,
  DISCOUNT_APPLY_CHANNEL_OPTIONS,
  formatCashierDiscountLabel,
  formatDiscountApplyChannelsShort,
  isDiscountActiveOnChannels,
  normalizeDiscountApplyChannels,
  normalizeDiscountSettings,
  suggestCashierDiscountPercent,
  validateDiscountSettings,
} from '../../shared/discount-settings.js';
import { saveDiscountSettings } from '../services/discount-settings-data.js';
import { saveLoyaltyCategory } from '../services/crm-ref-data.js';
import { promoThumbHtml } from '../utils/product-image.js';
import { showToast } from '../utils/toast.js';
import { bindAvrDetailCancel, renderAvrDetailStickyHead, runWithUnsavedGuard } from '../utils/avr-unsaved-changes.js';

const DSC_LOYALTY_PREFIX = 'dsc-loyalty:';
const DSC_CASHIER_PREFIX = 'dsc-cashier:';

const ROLE_LABELS = Object.fromEntries(
  CASHIER_DISCOUNT_ROLE_OPTIONS.map(o => [o.id, o.label]),
);

/** @param {string|null|undefined} rowId */
function parseDscSelection(rowId) {
  if (!rowId) return null;
  if (rowId.startsWith(DSC_LOYALTY_PREFIX)) {
    return { type: 'loyalty', id: rowId.slice(DSC_LOYALTY_PREFIX.length) };
  }
  if (rowId.startsWith(DSC_CASHIER_PREFIX)) {
    return { type: 'cashier', id: rowId.slice(DSC_CASHIER_PREFIX.length) };
  }
  return null;
}

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<{ id: string, name: string, discountPercent?: number, cashbackPercent?: number }>} p.loyaltyCategories
 * @param {import('../../shared/discount-settings.js').DiscountSettingsDoc} p.discountSettings
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createDiscountDirectoryEditor(host, {
  loyaltyCategories: initialCategories,
  discountSettings: initialSettings,
  onSaved,
}) {
  /** @type {Array<{ id: string, name: string, discountPercent: number, cashbackPercent: number, applyOnPos: boolean, applyOnWeb: boolean, applyOnKiosk: boolean }>} */
  let loyaltyCategories = initialCategories.map(c => ({
    id: c.id,
    name: c.name || '',
    discountPercent: Number(c.discountPercent) || 0,
    cashbackPercent: Number(c.cashbackPercent) || 0,
    ...normalizeDiscountApplyChannels(c, { defaultPos: true, defaultWeb: true, defaultKiosk: true }),
  }));

  /** @type {import('../../shared/discount-settings.js').DiscountSettingsDoc} */
  let discountSettings = normalizeDiscountSettings(initialSettings);

  /** @type {string|null} */
  let selectedId = firstRowId();
  /** @type {string|null} */
  let isNewCashierId = null;

  let saving = false;
  /** @type {string} */
  let baselineJson = '';

  function loyaltyRowId(id) {
    return `${DSC_LOYALTY_PREFIX}${id}`;
  }

  function cashierRowId(id) {
    return `${DSC_CASHIER_PREFIX}${id}`;
  }

  function firstRowId() {
    if (loyaltyCategories[0]) return loyaltyRowId(loyaltyCategories[0].id);
    if (discountSettings.cashierPresets[0]) return cashierRowId(discountSettings.cashierPresets[0].id);
    return null;
  }

  function snapshot() {
    syncPanel();
    return JSON.stringify({
      loyalty: loyaltyCategories
        .map(c => ({
          id: c.id,
          discountPercent: c.discountPercent,
          applyOnPos: c.applyOnPos,
          applyOnWeb: c.applyOnWeb,
          applyOnKiosk: c.applyOnKiosk,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      cashier: discountSettings.cashierPresets.map(p => ({ ...p })),
    });
  }

  function commitBaseline() {
    syncPanel();
    baselineJson = snapshot();
    isNewCashierId = null;
  }

  function isDirty() {
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    const parsed = JSON.parse(baselineJson);
    loyaltyCategories = loyaltyCategories.map(c => {
      const saved = parsed.loyalty.find(l => l.id === c.id);
      return saved ? {
        ...c,
        discountPercent: saved.discountPercent,
        ...normalizeDiscountApplyChannels(saved, { defaultPos: true, defaultWeb: true, defaultKiosk: true }),
      } : c;
    });
    discountSettings = {
      cashierPresets: parsed.cashier.map(p => ({ ...p })),
    };
    isNewCashierId = null;
    if (selectedId && !rowExists(selectedId)) {
      selectedId = firstRowId();
    }
  }

  commitBaseline();

  function rowExists(rowId) {
    const sel = parseDscSelection(rowId);
    if (sel?.type === 'loyalty') return loyaltyCategories.some(c => c.id === sel.id);
    if (sel?.type === 'cashier') return discountSettings.cashierPresets.some(p => p.id === sel.id);
    return false;
  }

  function selectedLoyaltyCategory() {
    const sel = parseDscSelection(selectedId);
    if (sel?.type !== 'loyalty') return null;
    return loyaltyCategories.find(c => c.id === sel.id) || null;
  }

  function selectedCashierPreset() {
    const sel = parseDscSelection(selectedId);
    if (sel?.type !== 'cashier') return null;
    return discountSettings.cashierPresets.find(p => p.id === sel.id) || null;
  }

  function selectedCashierId() {
    const sel = parseDscSelection(selectedId);
    return sel?.type === 'cashier' ? sel.id : null;
  }

  function registryTotalCount() {
    return loyaltyCategories.length + discountSettings.cashierPresets.length;
  }

  function readApplyChannels(panel) {
    return {
      applyOnPos: panel.querySelector('[data-dsc-apply-channel="pos"]')?.checked === true,
      applyOnWeb: panel.querySelector('[data-dsc-apply-channel="web"]')?.checked === true,
      applyOnKiosk: panel.querySelector('[data-dsc-apply-channel="kiosk"]')?.checked === true,
    };
  }

  function renderApplyChannelsSection(channels) {
    const fieldById = { pos: 'applyOnPos', web: 'applyOnWeb', kiosk: 'applyOnKiosk' };
    return `
      <div class="admin-field-block dsc-apply-channels">
        <span class="admin-field-label">Где можно применять</span>
        <p class="dsc-apply-channels-hint">Выберите каналы продаж, в которых доступна эта скидка.</p>
        <div class="lnc-sales-points dsc-apply-channels-grid">
          ${DISCOUNT_APPLY_CHANNEL_OPTIONS.map(opt => `
            <label class="admin-pill-check">
              <input
                type="checkbox"
                class="admin-pill-check__input"
                data-dsc-apply-channel="${escAttr(opt.id)}"
                ${channels[fieldById[opt.id]] ? 'checked' : ''}
              />
              <span class="admin-pill-check__box" aria-hidden="true"></span>
              <span class="admin-pill-check__label">${esc(opt.label)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  function applyChannelBadgesHtml(channels) {
    const badges = [];
    if (channels.applyOnPos) {
      badges.push('<span class="cgr-channel-badge cgr-channel-badge--pos cgr-channel-badge--active" aria-label="Касса">P</span>');
    }
    if (channels.applyOnWeb) {
      badges.push('<span class="cgr-channel-badge cgr-channel-badge--web cgr-channel-badge--active" aria-label="Веб">W</span>');
    }
    if (channels.applyOnKiosk) {
      badges.push('<span class="cgr-channel-badge cgr-channel-badge--kiosk cgr-channel-badge--active" aria-label="Киоск">K</span>');
    }
    return badges.join('');
  }

  function isRowActive(channels, { requirePosActive = false, activeOnCashier = true } = {}) {
    if (!isDiscountActiveOnChannels(channels)) return false;
    if (requirePosActive && !channels.applyOnPos) return false;
    if (requirePosActive && !activeOnCashier) return false;
    return true;
  }

  function syncPanel() {
    const panel = host.querySelector('#dsc-detail-panel');
    if (!panel) return;

    const loyalty = selectedLoyaltyCategory();
    if (loyalty) {
      const input = panel.querySelector('[data-loyalty-discount]');
      const channels = readApplyChannels(panel);
      loyaltyCategories = loyaltyCategories.map(c => (
        c.id === loyalty.id
          ? {
            ...c,
            discountPercent: Math.min(100, Math.max(0, Number(input?.value) || 0)),
            ...channels,
          }
          : c
      ));
      return;
    }

    const cashierId = selectedCashierId();
    if (!cashierId) return;

    const channels = readApplyChannels(panel);
    discountSettings.cashierPresets = discountSettings.cashierPresets.map(preset => {
      if (preset.id !== cashierId) return preset;
      const row = panel.querySelector('[data-cashier-preset]');
      if (!row) return preset;
      const percent = Math.min(100, Math.max(1, Number(row.querySelector('[data-field="percent"]')?.value) || preset.percent));
      return {
        ...preset,
        name: row.querySelector('[data-field="name"]')?.value.trim() || '',
        percent,
        ...channels,
        activeOnCashier: channels.applyOnPos,
        allowedRole: row.querySelector('[data-field="role"]')?.value || 'all',
      };
    });
  }

  function panelChange() {
    syncPanel();
    refreshListOrder();
  }

  function isLoyaltyInactive(cat) {
    return !isRowActive(cat);
  }

  function isCashierInactive(preset) {
    return !isRowActive(preset, { requirePosActive: true, activeOnCashier: preset.activeOnCashier });
  }

  function renderHiddenDiscountsDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider dsc-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Скрытые скидки (${count}) —</span>
      </li>
    `;
  }

  function partitionLoyaltyForList() {
    const sorted = [...loyaltyCategories].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return {
      active: sorted.filter(c => !isLoyaltyInactive(c)),
      inactive: sorted.filter(c => isLoyaltyInactive(c)),
    };
  }

  function partitionCashierForList() {
    const sorted = [...discountSettings.cashierPresets].sort((a, b) => a.percent - b.percent);
    return {
      active: sorted.filter(p => !isCashierInactive(p)),
      inactive: sorted.filter(p => isCashierInactive(p)),
    };
  }

  function renderGroupHeader(title, hint) {
    return `
      <li class="sch-list-group-head" aria-hidden="true">
        <span class="sch-list-group-title">${esc(title)}</span>
        <span class="sch-list-group-hint">${esc(hint)}</span>
      </li>
    `;
  }

  function loyaltyRowMeta(cat) {
    const parts = [`Скидка ${cat.discountPercent}%`, formatDiscountApplyChannelsShort(cat)];
    if (cat.cashbackPercent) parts.splice(1, 0, `кэшбэк ${cat.cashbackPercent}%`);
    return parts.join(' · ');
  }

  function cashierRowMeta(preset) {
    const role = ROLE_LABELS[preset.allowedRole] || preset.allowedRole;
    return `${formatDiscountApplyChannelsShort(preset)} · ${role}`;
  }

  function renderLoyaltyRow(cat) {
    const rowId = loyaltyRowId(cat.id);
    const active = selectedId === rowId;
    const inactive = isLoyaltyInactive(cat);
    return `
      <li class="avr-row avr-row--thumb sch-row dsc-row ${active ? 'avr-row--active' : ''} ${inactive ? 'cgr-row--hidden sch-row--inactive' : ''}" data-id="${escAttr(rowId)}">
        <div class="avr-row-main sch-row-main cgr-row-main">
          <button type="button" class="sch-row-select btn-press" data-action="select" aria-pressed="${active}">
            <span class="sch-row-left">
              <span class="sch-row-icon mkt-row-icon mkt-row-icon--promo" aria-hidden="true">${promoThumbHtml()}</span>
              <span class="avr-row-info">
                <span class="avr-row-name">${esc(cat.name)}</span>
                <span class="avr-row-meta">${esc(loyaltyRowMeta(cat))}</span>
              </span>
            </span>
          </button>
          <span class="cgr-row-indicators sch-row-indicators">${applyChannelBadgesHtml(cat)}</span>
        </div>
      </li>
    `;
  }

  function renderCashierRow(preset) {
    const rowId = cashierRowId(preset.id);
    const active = selectedId === rowId;
    const inactive = isCashierInactive(preset);
    return `
      <li class="avr-row avr-row--thumb sch-row dsc-row ${active ? 'avr-row--active' : ''} ${inactive ? 'cgr-row--hidden sch-row--inactive' : ''}" data-id="${escAttr(rowId)}">
        <div class="avr-row-main sch-row-main cgr-row-main">
          <button type="button" class="sch-row-select btn-press" data-action="select" aria-pressed="${active}">
            <span class="sch-row-left">
              <span class="sch-row-icon mkt-row-icon mkt-row-icon--promo" aria-hidden="true">${promoThumbHtml()}</span>
              <span class="avr-row-info">
                <span class="avr-row-name">${esc(formatCashierDiscountLabel(preset))}</span>
                <span class="avr-row-meta">${esc(cashierRowMeta(preset))}</span>
              </span>
            </span>
          </button>
          <span class="cgr-row-indicators sch-row-indicators">${applyChannelBadgesHtml(preset)}</span>
        </div>
      </li>
    `;
  }

  function renderListHtml() {
    const parts = [];
    const loyaltyParts = partitionLoyaltyForList();
    const cashierParts = partitionCashierForList();

    if (loyaltyCategories.length) {
      parts.push(renderGroupHeader('Автоматические', 'По категории лояльности клиента'));
      parts.push(...loyaltyParts.active.map(c => renderLoyaltyRow(c)));
      parts.push(renderHiddenDiscountsDivider(loyaltyParts.inactive.length));
      parts.push(...loyaltyParts.inactive.map(c => renderLoyaltyRow(c)));
    }

    if (discountSettings.cashierPresets.length) {
      parts.push(renderGroupHeader('Ручные на кассе', 'Быстрые пресеты для кассира'));
      parts.push(...cashierParts.active.map(p => renderCashierRow(p)));
      parts.push(renderHiddenDiscountsDivider(cashierParts.inactive.length));
      parts.push(...cashierParts.inactive.map(p => renderCashierRow(p)));
    }

    if (!parts.length) {
      return '<li class="avr-list-empty dsc-list-empty">Нет скидок. Нажмите «+ Добавить».</li>';
    }

    return parts.join('');
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">%</span>
        <p class="avr-detail-empty-title">Выберите скидку</p>
        <p class="avr-detail-empty-hint">Выберите скидку из списка слева или нажмите «+ Добавить».</p>
      </div>
    `;
  }

  function renderLoyaltyDetailPanel(cat) {
    return `
      <div class="avr-detail-panel dsc-detail-panel" id="dsc-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Настройка скидки',
          cancelId: 'dsc-detail-cancel',
          saveId: 'dsc-detail-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body sch-detail-body">
          <div class="admin-form-stack">
            <p class="sch-kind-note mkt-kind-note">Автоматическая скидка · по категории лояльности клиента</p>
            <div class="admin-field-block">
              <label class="admin-field-label" for="dsc-loyalty-name">Категория клиента</label>
              <input id="dsc-loyalty-name" type="text" class="admin-field-input" value="${escAttr(cat.name)}" disabled />
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="dsc-loyalty-discount">Скидка, %</label>
              <input
                id="dsc-loyalty-discount"
                type="number"
                class="admin-field-input"
                data-loyalty-discount
                min="0"
                max="100"
                step="1"
                value="${cat.discountPercent}"
              />
            </div>
            ${renderApplyChannelsSection(cat)}
            ${cat.cashbackPercent ? `
              <p class="mkt-discount-panel-hint">Кэшбэк по категории: ${cat.cashbackPercent}% (редактируется в «Категории лояльности»).</p>
            ` : ''}
            <p class="alr-detail-id">ID: <code>${esc(cat.id)}</code></p>
          </div>
          <p class="ifm-error" id="dsc-error" hidden></p>
        </div>
      </div>
    `;
  }

  function renderCashierDetailPanel(preset) {
    const isNew = preset.id === isNewCashierId;
    return `
      <div class="avr-detail-panel dsc-detail-panel" id="dsc-detail-panel">
        ${renderAvrDetailStickyHead({
          title: isNew ? 'Новая скидка' : 'Настройка скидки',
          cancelId: 'dsc-detail-cancel',
          saveId: 'dsc-detail-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body sch-detail-body">
          <div class="admin-form-stack" data-cashier-preset="${escAttr(preset.id)}">
            <p class="sch-kind-note mkt-kind-note">Ручная скидка · быстрый пресет на кассовом модуле</p>
            <div class="admin-field-block">
              <label class="admin-field-label" for="dsc-cashier-name">Название</label>
              <input
                id="dsc-cashier-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                maxlength="80"
                value="${escAttr(preset.name || '')}"
                placeholder="Например: Скидка сотрудника"
              />
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="dsc-cashier-percent">Процент скидки</label>
              <input
                id="dsc-cashier-percent"
                type="number"
                class="admin-field-input"
                data-field="percent"
                min="1"
                max="100"
                step="1"
                value="${preset.percent}"
              />
            </div>
            ${renderApplyChannelsSection(preset)}
            <div class="admin-field-block">
              <label class="admin-field-label" for="dsc-cashier-role">Кто может применять</label>
              <select id="dsc-cashier-role" class="admin-field-input" data-field="role">
                ${CASHIER_DISCOUNT_ROLE_OPTIONS.map(opt => `
                  <option value="${escAttr(opt.id)}" ${preset.allowedRole === opt.id ? 'selected' : ''}>
                    ${esc(opt.label)}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
          <p class="ifm-error" id="dsc-error" hidden></p>
        </div>
        ${!isNew ? `
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="dsc-delete-confirm" />
                <span>Подтверждаю удаление скидки</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="dsc-detail-delete" disabled>
                Удалить скидку
              </button>
            </div>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function renderDetailAside() {
    const loyalty = selectedLoyaltyCategory();
    if (loyalty) return renderLoyaltyDetailPanel(loyalty);
    const preset = selectedCashierPreset();
    if (preset) return renderCashierDetailPanel(preset);
    return renderDetailEmpty();
  }

  function render() {
    host.innerHTML = `
      <div class="avr-layout dsc-layout sch-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Скидки (${registryTotalCount()})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="dsc-create">+ Добавить</button>
          </div>
          <ul class="avr-list" id="dsc-list">${renderListHtml()}</ul>
        </div>
        <aside class="avr-detail" aria-label="Настройка скидки">
          ${renderDetailAside()}
        </aside>
      </div>
    `;
    bind();
  }

  function refreshListOrder() {
    syncPanel();
    const list = host.querySelector('#dsc-list');
    if (!list) return;
    list.innerHTML = renderListHtml();
  }

  function updateListRow(id) {
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;

    const sel = parseDscSelection(id);
    if (sel?.type === 'loyalty') {
      const cat = loyaltyCategories.find(c => c.id === sel.id);
      if (!cat) return;
      row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(cat.name));
      const metaEl = row.querySelector('.avr-row-meta');
      if (metaEl) metaEl.textContent = loyaltyRowMeta(cat);
      const indicators = row.querySelector('.sch-row-indicators');
      if (indicators) indicators.innerHTML = applyChannelBadgesHtml(cat);
      row.classList.toggle('cgr-row--hidden', isLoyaltyInactive(cat));
      row.classList.toggle('sch-row--inactive', isLoyaltyInactive(cat));
      return;
    }

    if (sel?.type === 'cashier') {
      const preset = discountSettings.cashierPresets.find(p => p.id === sel.id);
      if (!preset) return;
      row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(formatCashierDiscountLabel(preset)));
      const metaEl = row.querySelector('.avr-row-meta');
      if (metaEl) metaEl.textContent = cashierRowMeta(preset);
      const indicators = row.querySelector('.sch-row-indicators');
      if (indicators) indicators.innerHTML = applyChannelBadgesHtml(preset);
      const inactive = isCashierInactive(preset);
      row.classList.toggle('cgr-row--hidden', inactive);
      row.classList.toggle('sch-row--inactive', inactive);
    }
  }

  function closeDetailPanel() {
    if (isNewCashierId) {
      discountSettings.cashierPresets = discountSettings.cashierPresets.filter(p => p.id !== isNewCashierId);
      isNewCashierId = null;
    }
    selectedId = null;
    render();
  }

  function createEntry() {
    runWithUnsavedGuard({
      isDirty,
      discard: discardChanges,
      save,
      proceed: () => {
        const id = `draft-${Date.now()}`;
        const preset = createCashierDiscountPreset({
          id,
          name: 'Новая скидка',
          percent: suggestCashierDiscountPercent(discountSettings.cashierPresets),
        });
        discountSettings.cashierPresets = [...discountSettings.cashierPresets, preset];
        selectedId = cashierRowId(id);
        isNewCashierId = id;
        render();
        requestAnimationFrame(() => {
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        });
      },
    });
  }

  async function save() {
    syncPanel();
    const errEl = host.querySelector('#dsc-error');
    if (errEl) errEl.hidden = true;

    try {
      validateDiscountSettings(discountSettings);
      for (const cat of loyaltyCategories) {
        if (!isDiscountActiveOnChannels(cat)) {
          throw new Error(`Укажите каналы применения для категории «${cat.name}»`);
        }
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Проверьте настройки скидок';
        errEl.hidden = false;
      }
      return false;
    }

    saving = true;
    render();

    try {
      await Promise.all([
        ...loyaltyCategories.map(cat => saveLoyaltyCategory({
          id: cat.id,
          name: cat.name,
          discountPercent: cat.discountPercent,
          cashbackPercent: cat.cashbackPercent,
          applyOnPos: cat.applyOnPos,
          applyOnWeb: cat.applyOnWeb,
          applyOnKiosk: cat.applyOnKiosk,
        })),
        saveDiscountSettings(discountSettings),
      ]);

      commitBaseline();
      showToast('Справочник скидок сохранён');
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[discount-directory]', err);
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось сохранить справочник скидок';
        errEl.hidden = false;
      }
      return false;
    } finally {
      saving = false;
      if (selectedId) render();
    }
  }

  async function deleteCashierPreset() {
    const confirmEl = host.querySelector('#dsc-delete-confirm');
    if (!confirmEl?.checked) return;
    const preset = selectedCashierPreset();
    if (!preset || preset.id === isNewCashierId) return;

    const idToDelete = preset.id;
    const btn = host.querySelector('#dsc-detail-delete');
    if (btn) btn.disabled = true;

    const prevPresets = discountSettings.cashierPresets.map(p => ({ ...p }));
    const prevSelectedId = selectedId;
    discountSettings.cashierPresets = discountSettings.cashierPresets.filter(p => p.id !== idToDelete);
    selectedId = firstRowId();
    isNewCashierId = null;

    saving = true;
    render();

    try {
      await saveDiscountSettings(discountSettings);
      commitBaseline();
      showToast('Скидка удалена');
      await onSaved?.();
    } catch (err) {
      console.error('[discount-directory] delete', err);
      discountSettings.cashierPresets = prevPresets;
      selectedId = prevSelectedId;
      const errEl = host.querySelector('#dsc-error');
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось удалить скидку';
        errEl.hidden = false;
      }
      if (btn) {
        btn.disabled = !confirmEl.checked;
        btn.classList.toggle('cgr-detail-delete--active', confirmEl.checked);
      }
    } finally {
      saving = false;
      render();
    }
  }

  function bind() {
    host.querySelector('#dsc-create')?.addEventListener('click', () => createEntry());

    host.querySelector('#dsc-list')?.addEventListener('click', e => {
      const selectBtn = e.target.closest('[data-action="select"]');
      if (!selectBtn) return;
      const id = selectBtn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save,
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    const panel = host.querySelector('#dsc-detail-panel');
    panel?.querySelector('[data-loyalty-discount]')?.addEventListener('input', panelChange);
    panel?.querySelector('[data-loyalty-discount]')?.addEventListener('change', panelChange);
    panel?.querySelectorAll('[data-dsc-apply-channel]').forEach(el => {
      el.addEventListener('change', panelChange);
    });
    panel?.querySelectorAll('[data-cashier-preset] [data-field]').forEach(el => {
      el.addEventListener('input', panelChange);
      el.addEventListener('change', panelChange);
    });

    host.querySelector('#dsc-detail-save')?.addEventListener('click', () => save());
    host.querySelector('#dsc-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#dsc-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#dsc-detail-delete')?.addEventListener('click', () => deleteCashierPreset());
    bindAvrDetailCancel(host, 'dsc-detail-cancel', {
      isDirty,
      discard: () => {
        if (isNewCashierId) {
          discountSettings.cashierPresets = discountSettings.cashierPresets.filter(p => p.id !== isNewCashierId);
          isNewCashierId = null;
        }
        discardChanges();
        render();
      },
      save,
      onClose: closeDetailPanel,
    });
  }

  function destroy() {
    host.innerHTML = '';
  }

  render();
  return { destroy, isDirty, save, discardChanges, createEntry };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
