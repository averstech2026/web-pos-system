import {
  deleteCategoryOnItems,
  renameCategoryOnItems,
  saveCategoryGroups,
} from '../services/menu-settings-data.js';
import {
  batchSetItemCategories,
  setItemAvailability,
  channelFlagsFromMode,
  ITEM_CHANNEL_MODES,
  resolveChannelMode,
} from '../services/products-data.js';
import { openItemFormModal } from './item-form-modal.js';
import { openGroupProductsPickerModal } from './group-products-picker-modal.js';
import { productThumbHtml } from '../utils/product-image.js';
import {
  normalizeCategoryGroup,
  slugFromCategoryName,
  formatGroupScheduleSummary,
  sortCategoryGroupsByChannel,
  DEFAULT_CATEGORY_COLORS,
} from '../../shared/menu-catalog.js';
import { formatAvailabilityRuleSummary } from '../../shared/availability-rules.js';
import {
  runWithUnsavedGuard,
  bindAvrDetailCancel,
  renderAvrDetailStickyHead,
} from '../utils/avr-unsaved-changes.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';
import {
  renderListMetaWithSchedule,
  scheduleStatusForGroup,
} from '../utils/schedule-status.js';
import { readModifierGroupIds, renderModifierGroupsField } from './modifier-groups-field.js';

const PRODUCT_REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} p.categoryGroups
 * @param {Array<{ id: string, name?: string, category?: string, isAvailable?: boolean }>} p.items
 * @param {Array<{ id: string, name: string }>} [p.allergens]
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} [p.modifierGroups]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createCategoryGroupsEditor(host, { categoryGroups, items: initialItems, allergens = [], availabilityRules = [], modifierGroups = [], onSaved }) {
  /** @type {import('../../shared/menu-catalog.js').CategoryGroup[]} */
  let groups = categoryGroups.map(g => ({ ...normalizeCategoryGroup(g) }));
  /** @type {Array<{ id: string, name?: string, category?: string, isAvailable?: boolean }>} */
  let items = [...initialItems];
  const originalNames = new Set(groups.map(g => g.name));
  const originalNameById = new Map(groups.map(g => [g.id, g.name]));
  /** @type {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} */
  let rules = [...availabilityRules];
  /** @type {Map<string, import('../../shared/availability-rules.js').AvailabilityRuleDoc>} */
  let rulesMap = new Map(rules.map(r => [r.id, r]));
  /** @type {string|null} */
  let selectedId = null;

  /** @type {Record<string, string>} */
  let previewObjectUrls = {};

  /** @type {string} */
  let baselineGroupsJson = '';
  /** @type {string} */
  let baselineItemsJson = '';
  /** @type {'web'|'kiosk'} */
  let listSortChannel = 'kiosk';

  function groupsSnapshot(gs) {
    return JSON.stringify(
      gs.map(g => normalizeCategoryGroup(g)).sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  function itemsSnapshot(its) {
    return JSON.stringify(
      its.map(i => ({
        id: i.id,
        category: i.category || '',
        isAvailable: i.isAvailable !== false,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  function commitBaseline() {
    syncSidebarToState();
    baselineGroupsJson = groupsSnapshot(groups);
    baselineItemsJson = itemsSnapshot(items);
    originalNames.clear();
    for (const g of groups) originalNames.add(g.name);
    originalNameById.clear();
    for (const g of groups) originalNameById.set(g.id, g.name);
  }

  function isDirty() {
    syncSidebarToState();
    return groupsSnapshot(groups) !== baselineGroupsJson
      || itemsSnapshot(items) !== baselineItemsJson;
  }

  function discardChanges() {
    groups = JSON.parse(baselineGroupsJson);
    const baselineItems = JSON.parse(baselineItemsJson);
    const baselineMap = new Map(baselineItems.map(i => [i.id, i]));
    for (const item of items) {
      const base = baselineMap.get(item.id);
      if (!base) continue;
      item.category = base.category;
      item.isAvailable = base.isAvailable;
    }
    for (const url of Object.values(previewObjectUrls)) {
      if (url) URL.revokeObjectURL(url);
    }
    previewObjectUrls = {};
    if (selectedId && !groups.some(g => g.id === selectedId)) {
      selectedId = firstListGroupId();
    }
  }

  commitBaseline();

  function groupItems(group) {
    return items.filter(i => i.category === group.name);
  }

  function productCountLabel(group) {
    const n = groupItems(group).length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'товар'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'товара'
        : 'товаров';
    return `${n} ${word}`;
  }

  function memberCount(id) {
    const group = groups.find(g => g.id === id);
    return group ? groupItems(group).length : 0;
  }

  function selectedGroup() {
    return groups.find(g => g.id === selectedId) || null;
  }

  function partitionGroupsForList() {
    const sorted = sortCategoryGroupsByChannel(groups, listSortChannel);
    const active = sorted.filter(g => !isGroupDeprioritized(g));
    const inactive = sorted.filter(g => isGroupDeprioritized(g));
    return { active, inactive };
  }

  function firstListGroupId() {
    const { active, inactive } = partitionGroupsForList();
    return active[0]?.id || inactive[0]?.id || null;
  }

  function renderHiddenGroupsDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Скрытые группы (${count}) —</span>
      </li>
    `;
  }

  function renderListItemsHtml() {
    const { active, inactive } = partitionGroupsForList();
    return [
      ...active.map(g => renderListRow(g)),
      renderHiddenGroupsDivider(inactive.length),
      ...inactive.map(g => renderListRow(g)),
    ].join('');
  }

  function isGroupHidden(group) {
    return resolveChannelMode(group.visibleInWeb, group.visibleInKiosk) === 'hidden';
  }

  function groupScheduleStatus(group) {
    const rule = group.availabilityRuleId ? rulesMap.get(group.availabilityRuleId) : null;
    return scheduleStatusForGroup(group, rule);
  }

  function isGroupDeprioritized(group) {
    return isGroupHidden(group) || groupScheduleStatus(group).isExpired === true;
  }

  function channelBadgeHtml(channel, group) {
    const isWeb = channel === 'web';
    const active = isWeb
      ? group.visibleInWeb !== false
      : group.visibleInKiosk === true;
    const order = isWeb ? Number(group.webOrder) || 0 : Number(group.kioskOrder) || 0;
    const letter = isWeb ? 'W' : 'K';
    const channelLabel = isWeb ? 'Веб' : 'Киоск';
    const classes = [
      'cgr-channel-badge',
      isWeb ? 'cgr-channel-badge--web' : 'cgr-channel-badge--kiosk',
      active ? 'cgr-channel-badge--active' : 'cgr-channel-badge--inactive',
    ].join(' ');
    const indexPart = active && order > 0
      ? `<span class="cgr-channel-badge-num">${order}</span>`
      : '';
    const ariaLabel = active && order > 0
      ? `${channelLabel}, порядок ${order}`
      : active
        ? `${channelLabel}, активен`
        : `${channelLabel}, неактивен`;

    return `<span class="${classes}" aria-label="${escAttr(ariaLabel)}">${letter}${indexPart}</span>`;
  }

  function channelIndicatorsHtml(group) {
    return `${channelBadgeHtml('web', group)}${channelBadgeHtml('kiosk', group)}`;
  }

  function listRowMetaHtml(group) {
    return renderListMetaWithSchedule(`${memberCount(group.id)} шт.`, groupScheduleStatus(group));
  }

  function readOrderField(panel, field) {
    const raw = panel.querySelector(`[data-field="${field}"]`)?.value;
    const n = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function readChannelModeFromPanel(panel) {
    const active = panel.querySelector('[data-group-channel-mode].period-tab--active');
    return active?.dataset.groupChannelMode || 'everywhere';
  }

  function syncSidebarToState() {
    const panel = host.querySelector('#cgr-detail-panel');
    if (!selectedId || !panel) return;

    const ruleSelect = panel.querySelector('[data-field="availability-rule-id"]');
    const ruleId = ruleSelect?.value || null;
    const { visibleInWeb, visibleInKiosk } = channelFlagsFromMode(readChannelModeFromPanel(panel));

    const updated = normalizeCategoryGroup({
      ...groups.find(g => g.id === selectedId),
      id: selectedId,
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      imageUrl: panel.querySelector('[data-field="image-url"]')?.value.trim() || null,
      color: panel.querySelector('[data-field="color"]')?.value || null,
      availabilityRuleId: ruleId || null,
      visibleInWeb,
      visibleInKiosk,
      webOrder: readOrderField(panel, 'web-order'),
      kioskOrder: readOrderField(panel, 'kiosk-order'),
      modifierGroupIds: readModifierGroupIds(panel),
    });

    groups = groups.map(g => (g.id === selectedId ? updated : g));
  }

  function renderVisibilitySection(group) {
    const mode = resolveChannelMode(group.visibleInWeb, group.visibleInKiosk);
    return renderChannelAvailabilityGrid({
      id: 'cgr-visibility-section',
      mode,
      modes: ITEM_CHANNEL_MODES,
      webOrder: group.webOrder,
      kioskOrder: group.kioskOrder,
      modeDataAttr: 'data-group-channel-mode',
      ariaLabel: 'Доступность группы',
      webOrderId: 'cgr-web-order',
      kioskOrderId: 'cgr-kiosk-order',
    });
  }

  function syncGroupChannelTabs() {
    const group = selectedGroup();
    const panel = host.querySelector('#cgr-detail-panel');
    if (!group || !panel) return;
    const mode = resolveChannelMode(group.visibleInWeb, group.visibleInKiosk);
    panel.querySelectorAll('[data-group-channel-mode]').forEach(btn => {
      const active = btn.dataset.groupChannelMode === mode;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function renderAvailabilitySection(group) {
    const selectedRuleId = group.availabilityRuleId || '';
    const selectedRule = selectedRuleId ? rulesMap.get(selectedRuleId) : null;
    const summary = selectedRule ? formatAvailabilityRuleSummary(selectedRule) : '';

    const options = rules.map(r => `
      <option value="${escAttr(r.id)}" ${r.id === selectedRuleId ? 'selected' : ''}>${esc(r.name)}</option>
    `).join('');

    return `
      <div class="admin-field-block" id="cgr-availability-section">
        <label class="admin-field-label" for="cgr-avail-select">Время доступности</label>
        <select class="admin-field-input cgr-avail-select" id="cgr-avail-select" data-field="availability-rule-id">
          <option value="" ${!selectedRuleId ? 'selected' : ''}>Доступно всегда (Без ограничений)</option>
          ${options}
        </select>
        <p class="cgr-avail-rule-summary" id="cgr-avail-rule-summary" ${summary ? '' : 'hidden'}>${esc(summary)}</p>
      </div>
    `;
  }

  function refreshAvailabilitySummary() {
    const group = selectedGroup();
    const summaryEl = host.querySelector('#cgr-avail-rule-summary');
    if (!group || !summaryEl) return;
    const ruleId = group.availabilityRuleId;
    const rule = ruleId ? rulesMap.get(ruleId) : null;
    const summary = rule ? formatAvailabilityRuleSummary(rule) : '';
    summaryEl.textContent = summary;
    summaryEl.hidden = !summary;
  }

  function scheduleSummaryForGroup(group) {
    const rule = group.availabilityRuleId ? rulesMap.get(group.availabilityRuleId) : null;
    return formatGroupScheduleSummary(group, rule);
  }

  function refreshAvailabilitySection() {
    const group = selectedGroup();
    const section = host.querySelector('#cgr-availability-section');
    if (!group || !section) return;
    section.outerHTML = renderAvailabilitySection(group);
    bindAvailabilitySelect();
  }

  function bindAvailabilitySelect() {
    host.querySelector('[data-field="availability-rule-id"]')?.addEventListener('change', e => {
      syncSidebarToState();
      refreshAvailabilitySummary();
      updateListRowMeta(selectedId, { resort: true });
    });
  }

  function renderProductList(group) {
    const inGroup = groupItems(group).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));

    if (!inGroup.length) {
      return '<p class="cgr-group-products-empty">В этой группе пока нет товаров. Создайте новый или добавьте из базы.</p>';
    }

    return inGroup.map(item => `
      <div class="cgr-product-capsule">
        <label class="cgr-product-capsule__main" title="В продаже">
          <input
            type="checkbox"
            data-availability-toggle
            data-product-id="${escAttr(item.id)}"
            ${item.isAvailable !== false ? 'checked' : ''}
          />
          <span class="cgr-product-capsule__name">${esc(item.name || '—')}</span>
          ${item.isAvailable === false ? '<span class="cgr-product-capsule__badge">Скрыт</span>' : ''}
        </label>
        <button
          type="button"
          class="cgr-product-capsule__remove btn-press"
          data-action="remove-from-group"
          data-product-id="${escAttr(item.id)}"
          title="Исключить из группы"
          aria-label="Исключить «${escAttr(item.name || 'товар')}» из группы"
        >${PRODUCT_REMOVE_ICON}</button>
      </div>
    `).join('');
  }

  function refreshProductList() {
    const group = selectedGroup();
    const list = host.querySelector('#cgr-products-list');
    const count = host.querySelector('#cgr-detail-count');
    if (!group || !list) return;
    list.innerHTML = renderProductList(group);
    if (count) count.textContent = productCountLabel(group);
    updateListRowMeta(group.id);
  }

  function renderListRow(group) {
    const active = group.id === selectedId;
    const deprioritized = isGroupDeprioritized(group);
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''} ${deprioritized ? 'cgr-row--hidden' : ''}" data-id="${escAttr(group.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${productThumbHtml({ name: group.name, imageUrl: group.imageUrl })}</span>
            <span class="avr-row-info">
              <span class="avr-row-name">${esc(group.name)}</span>
              <span class="avr-row-meta">${listRowMetaHtml(group)}</span>
            </span>
          </span>
          <span class="cgr-row-indicators">${channelIndicatorsHtml(group)}</span>
        </button>
      </li>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">📂</span>
        <p class="avr-detail-empty-title">Выберите группу</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить группу» слева или выберите группу из списка, чтобы настроить состав, время и фото.</p>
      </div>
    `;
  }

  function renderDetailPanel(group) {
    const previewUrl = previewObjectUrls[group.id] || group.imageUrl || '';
    const imagePath = group.imageUrl || '';

    return `
      <div class="avr-detail-panel" id="cgr-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование группы',
          cancelId: 'cgr-detail-cancel',
          saveId: 'cgr-detail-save',
          saveLabel: 'Сохранить изменения',
        })}
        <div class="avr-detail-body cgr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="cgr-group-name">Название группы</label>
              <input
                id="cgr-group-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(group.name)}"
                maxlength="80"
              />
            </div>

            <div class="admin-field-block">
              <label class="admin-field-label" for="cgr-group-color">Цвет плитки на кассе</label>
              <div class="cgr-color-row">
                <input
                  id="cgr-group-color"
                  type="color"
                  class="cgr-color-input"
                  data-field="color"
                  value="${escAttr(group.color || DEFAULT_CATEGORY_COLORS[group.name] || '#C5CED6')}"
                />
                <span class="cgr-color-hint">Используется на кассе, когда фото товаров отключены</span>
              </div>
            </div>

            <div class="admin-field-block">
                <span class="admin-field-label">Товары в группе</span>
                <span class="cgr-products-count" id="cgr-detail-count">${productCountLabel(group)}</span>
              </div>
              <div class="cgr-products-panel">
                <div class="cgr-group-products-toolbar">
                  <button type="button" class="btn btn-primary btn-press products-create-btn" id="cgr-add-product-btn">
                    + Создать и добавить товар
                  </button>
                  <button type="button" class="btn btn-outline btn-press products-create-btn" id="cgr-pick-products-btn">
                    + Добавить из базы
                  </button>
                </div>
                <div class="catm-products-list cgr-products-list" id="cgr-products-list">
                  ${renderProductList(group)}
                </div>
              </div>
            </div>

            ${renderVisibilitySection(group)}

            ${renderModifierGroupsField({
              selectedIds: group.modifierGroupIds,
              modifierGroups,
              hint: 'Будут предлагаться гостю для всех товаров этой группы.',
            })}

            ${renderAvailabilitySection(group)}

            <div class="admin-field-block" id="cgr-image-section">
              <span class="admin-field-label">Изображение в меню</span>
              <div class="admin-media-row cgr-detail-photo-row">
                <div class="cgr-detail-photo-preview" id="cgr-photo-preview">
                  ${productThumbHtml({ name: group.name, imageUrl: previewUrl })}
                </div>
                <div class="cgr-detail-photo-actions">
                  <label class="btn btn-outline btn-press catm-photo-btn">
                    Выбрать файл
                    <input type="file" data-photo-file accept="image/jpeg,image/png,image/webp" hidden />
                  </label>
                  <p class="admin-media-path cgr-detail-photo-path" id="cgr-photo-path-text">${esc(imagePath || 'Файл не выбран')}</p>
                  <input type="hidden" data-field="image-url" value="${escAttr(group.imageUrl || '')}" />
                </div>
              </div>
            </div>
          </div>

          <p class="ifm-error" id="cgr-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="cgr-delete-confirm" />
                <span>Я понимаю, что товары группы перейдут в «Прочее», и подтверждаю удаление</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="cgr-detail-delete" disabled>
                Удалить группу
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function groupsHeaderText() {
    return `Группы (${groups.length})`;
  }

  function renderListSortBar() {
    return `
      <div class="cgr-list-sort-bar">
        <span class="cgr-list-sort-label">Список по</span>
        <div class="period-tabs cgr-list-sort-tabs" role="radiogroup" aria-label="Сортировка списка групп">
          <button
            type="button"
            class="period-tab btn-press ${listSortChannel === 'web' ? 'period-tab--active' : ''}"
            data-cgr-list-sort="web"
            role="radio"
            aria-checked="${listSortChannel === 'web'}"
          >Веб</button>
          <button
            type="button"
            class="period-tab btn-press ${listSortChannel === 'kiosk' ? 'period-tab--active' : ''}"
            data-cgr-list-sort="kiosk"
            role="radio"
            aria-checked="${listSortChannel === 'kiosk'}"
          >Киоск</button>
        </div>
      </div>
    `;
  }

  function refreshListOrder() {
    const list = host.querySelector('#cgr-list');
    if (!list) return;
    list.innerHTML = renderListItemsHtml();
  }

  function syncListSortTabs() {
    host.querySelectorAll('[data-cgr-list-sort]').forEach(btn => {
      const active = btn.dataset.cgrListSort === listSortChannel;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function render() {
    const group = selectedGroup();
    host.innerHTML = `
      <div class="avr-layout cgr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">${groupsHeaderText()}</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="cgr-create-btn">
              + Добавить группу
            </button>
          </div>
          ${renderListSortBar()}
          <ul class="avr-list" id="cgr-list">${renderListItemsHtml()}</ul>
          ${!groups.length ? '<p class="avr-list-empty">Нет групп. Создайте первую.</p>' : ''}
          <p class="ifm-error" id="cgr-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Настройки группы">
          ${group ? renderDetailPanel(group) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateListRowMeta(id, { resort = false } = {}) {
    if (resort) {
      refreshListOrder();
      return;
    }

    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const group = groups.find(g => g.id === id);
    if (!row || !group) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(group.name));
    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.innerHTML = listRowMetaHtml(group);
    row.classList.toggle('cgr-row--hidden', isGroupDeprioritized(group));
    const indicatorsEl = row.querySelector('.cgr-row-indicators');
    if (indicatorsEl) indicatorsEl.innerHTML = channelIndicatorsHtml(group);
    row.querySelector('.avr-row-thumb')?.replaceChildren();
    row.querySelector('.avr-row-thumb')?.insertAdjacentHTML(
      'afterbegin',
      productThumbHtml({ name: group.name, imageUrl: group.imageUrl }),
    );
  }

  function updatePhotoPreview() {
    const group = selectedGroup();
    const preview = host.querySelector('#cgr-photo-preview');
    if (!group || !preview) return;
    const path = host.querySelector('[data-field="image-url"]')?.value.trim();
    const imageUrl = previewObjectUrls[group.id] || path || group.imageUrl || '';
    preview.innerHTML = productThumbHtml({ name: group.name, imageUrl });
    const pathText = host.querySelector('#cgr-photo-path-text');
    if (pathText) pathText.textContent = path || 'Файл не выбран';
    updateListRowMeta(group.id);
  }

  function bindEvents() {
    host.querySelector('#cgr-create-btn')?.addEventListener('click', addCategory);

    host.querySelector('.cgr-list-sort-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cgr-list-sort]');
      if (!btn) return;
      const channel = btn.dataset.cgrListSort;
      if (channel !== 'web' && channel !== 'kiosk') return;
      if (channel === listSortChannel) return;
      listSortChannel = channel;
      syncListSortTabs();
      refreshListOrder();
    });

    host.querySelector('#cgr-list')?.addEventListener('click', e => {
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

    host.querySelector('#cgr-detail-save')?.addEventListener('click', () => save());
    bindAvrDetailCancel(host, 'cgr-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: () => save(),
      onClose: closeDetailPanel,
    });
    host.querySelector('#cgr-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#cgr-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#cgr-detail-delete')?.addEventListener('click', () => deleteSelectedGroup());
    host.querySelector('#cgr-add-product-btn')?.addEventListener('click', openCreateProductModal);
    host.querySelector('#cgr-pick-products-btn')?.addEventListener('click', openPickProductsModal);

    host.querySelector('#cgr-detail-panel')?.addEventListener('click', e => {
      const modeBtn = e.target.closest('[data-group-channel-mode]');
      if (modeBtn && selectedId) {
        e.preventDefault();
        const { visibleInWeb, visibleInKiosk } = channelFlagsFromMode(modeBtn.dataset.groupChannelMode);
        groups = groups.map(g => (
          g.id === selectedId ? { ...g, visibleInWeb, visibleInKiosk } : g
        ));
        syncGroupChannelTabs();
        refreshListOrder();
        return;
      }

      const removeBtn = e.target.closest('[data-action="remove-from-group"]');
      if (removeBtn && selectedId) {
        e.preventDefault();
        const itemId = removeBtn.dataset.productId;
        const item = items.find(i => i.id === itemId);
        if (!item) return;
        item.category = 'Прочее';
        refreshProductList();
        return;
      }
    });

    bindAvailabilitySelect();

    host.querySelector('#cgr-detail-panel')?.addEventListener('input', e => {
      if (!selectedId) return;

      if (e.target.matches('[data-field="name"]')) {
        syncSidebarToState();
        updateListRowMeta(selectedId);
        return;
      }

      if (e.target.matches('[data-field="web-order"], [data-field="kiosk-order"]')) {
        syncSidebarToState();
        updateListRowMeta(selectedId);
        refreshListOrder();
      }
    });

    host.querySelector('#cgr-detail-panel')?.addEventListener('change', e => {
      if (!selectedId) return;

      if (e.target.matches('[data-photo-file]')) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (previewObjectUrls[selectedId]) URL.revokeObjectURL(previewObjectUrls[selectedId]);
        previewObjectUrls[selectedId] = URL.createObjectURL(file);
        const pathInput = host.querySelector('[data-field="image-url"]');
        if (pathInput && !pathInput.value.trim()) pathInput.value = `/products/${file.name}`;
        syncSidebarToState();
        updatePhotoPreview();
        return;
      }

      if (!e.target.matches('[data-availability-toggle], [data-modifier-group-id]')) return;
      if (e.target.matches('[data-modifier-group-id]')) {
        syncSidebarToState();
        return;
      }
      const itemId = e.target.dataset.productId;
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      item.isAvailable = e.target.checked;
      refreshProductList();
    });
  }

  function openPickProductsModal() {
    syncSidebarToState();
    const group = selectedGroup();
    if (!group?.name?.trim()) {
      showError('Сначала укажите название группы');
      return;
    }

    openGroupProductsPickerModal({
      groupName: group.name,
      items,
      deferPersistence: true,
      onApplied: updates => {
        for (const { id, category } of updates) {
          const item = items.find(i => i.id === id);
          if (item) item.category = category;
        }
        refreshProductList();
      },
    });
  }

  function openCreateProductModal() {
    syncSidebarToState();
    const group = selectedGroup();
    if (!group?.name?.trim()) {
      showError('Сначала укажите название группы');
      return;
    }

    openItemFormModal({
      categories: groups.map(g => g.name),
      allergens,
      modifierGroups,
      availabilityRules: rules,
      lockedCategory: group.name,
      onSaved: saved => {
        if (!saved?.id) return;
        const idx = items.findIndex(i => i.id === saved.id);
        if (idx >= 0) items[idx] = { ...items[idx], ...saved };
        else items.push(saved);
        items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
        refreshProductList();
      },
    });
  }

  async function deleteSelectedGroup() {
    const confirmEl = host.querySelector('#cgr-delete-confirm');
    if (!confirmEl?.checked || !selectedId) return;

    const idToDelete = selectedId;
    syncSidebarToState();

    const prevGroups = groups;
    const prevSelectedId = selectedId;
    groups = groups.filter(g => g.id !== idToDelete);
    selectedId = firstListGroupId();

    const ok = await save();
    if (!ok) {
      groups = prevGroups;
      selectedId = prevSelectedId;
      render();
    }
  }

  function addCategory() {
    runWithUnsavedGuard({
      isDirty,
      discard: discardChanges,
      save,
      proceed: () => addCategoryDraft(),
    });
  }

  function addCategoryDraft() {
    syncSidebarToState();

    let name = 'Новая группа';
    let n = 2;
    while (groups.some(g => g.name === name)) {
      name = `Новая группа ${n}`;
      n += 1;
    }

    const id = `${slugFromCategoryName(name)}-${Date.now()}`;
    groups.push(normalizeCategoryGroup({ id, name }));
    selectedId = id;
    render();

    requestAnimationFrame(() => {
      const nameInput = host.querySelector('[data-field="name"]');
      nameInput?.focus();
      nameInput?.select();
    });
  }

  async function applyItemChangesFromBaseline() {
    const baselineItems = JSON.parse(baselineItemsJson);
    const baselineMap = new Map(baselineItems.map(i => [i.id, i]));
    /** @type {Array<{ id: string, category: string }>} */
    const categoryUpdates = [];

    for (const item of items) {
      const base = baselineMap.get(item.id);
      if (!base) continue;
      if (item.category !== base.category) {
        categoryUpdates.push({ id: item.id, category: item.category || 'Прочее' });
      }
    }

    if (categoryUpdates.length) {
      await batchSetItemCategories(categoryUpdates);
    }

    for (const item of items) {
      const base = baselineMap.get(item.id);
      if (!base) continue;
      const avail = item.isAvailable !== false;
      if (avail !== base.isAvailable) {
        await setItemAvailability(item.id, avail);
      }
    }
  }

  async function save() {
    syncSidebarToState();
    const errEl = host.querySelector('#cgr-error');
    if (errEl) errEl.hidden = true;

    const btn = host.querySelector('#cgr-detail-save');
    if (btn) btn.disabled = true;

    try {
      await applyItemChangesFromBaseline();

      const next = [];
      const names = new Set();

      for (const g of groups) {
        const name = g.name?.trim();
        if (!name) throw new Error('Имя группы не может быть пустым');
        if (names.has(name)) throw new Error(`Группа «${name}» указана дважды`);
        names.add(name);

        const normalized = normalizeCategoryGroup({
          ...g,
          name,
          availabilityRuleId: g.availabilityRuleId || null,
        });

        const oldName = originalNameById.get(g.id);
        if (oldName && oldName !== name) await renameCategoryOnItems(oldName, name);
        next.push(normalized);
      }

      const nextNames = new Set(next.map(g => g.name));
      for (const oldName of originalNames) {
        if (!nextNames.has(oldName)) await deleteCategoryOnItems(oldName, 'Прочее');
      }

      await saveCategoryGroups(next);
      groups = next.map(g => ({ ...g }));
      commitBaseline();
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[category-groups]', err);
      showError(err.message || 'Не удалось сохранить группы');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function showError(msg) {
    const errEl = host.querySelector('#cgr-error') || host.querySelector('#cgr-list-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function destroy() {
    for (const url of Object.values(previewObjectUrls)) {
      if (url) URL.revokeObjectURL(url);
    }
    host.innerHTML = '';
  }

  selectedId = firstListGroupId();
  render();

  return { save, destroy, isDirty };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
