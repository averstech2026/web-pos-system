import {
  createDefaultMarketingBanner,
  formatMarketingBannerSummary,
  isMarketingBannerHidden,
  isPromoHorizontalPlacement,
  MARKETING_ACCENT_COLORS,
  MARKETING_BACKGROUND_COLORS,
  MARKETING_BANNER_SPEC_HINT,
  MARKETING_CHANNEL_MODES,
  MARKETING_CLICK_ACTION_OPTIONS,
  MARKETING_DEFAULT_LOCATION_ID,
  MARKETING_FORMAT_OPTIONS,
  MARKETING_FULLSCREEN_SPEC_HINT,
  MARKETING_SQUARE_PLACEMENT_OPTIONS,
  MARKETING_STORY_SORT_HINT,
  MARKETING_THUMBNAIL_SPEC_HINT,
  MARKETING_WIDE_PLACEMENT_OPTIONS,
  normalizeMarketingBanner,
  marketingChannelFlagsFromMode,
  resolveMarketingChannelMode,
  sanitizeBannerForFormat,
  sanitizePersistedImageUrl,
  validateMarketingBanner,
  validateMarketingImageFile,
} from '../../shared/marketing-banners.js';
import { formatAvailabilityRuleShort } from '../../shared/availability-rules.js';
import { resolveProductImageUrl } from '../../shared/item-images.js';
import { uploadProductImage } from '../../shared/product-image-upload.js';
import { productThumbHtml } from '../utils/product-image.js';
import { deleteMarketingBanner, saveMarketingBanner } from '../services/marketing-banners-data.js';
import { showToast } from '../utils/toast.js';
import { promptUnsavedChanges, runWithUnsavedGuard, bindAvrDetailCancel, renderAvrDetailStickyHead } from '../utils/avr-unsaved-changes.js';
import {
  renderListMetaWithSchedule,
  scheduleStatusForBanner,
} from '../utils/schedule-status.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/marketing-banners.d.ts').MarketingBanner[]} p.banners
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {Array<{ id: string, name: string }>} p.userGroups
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createMarketingBannersEditor(host, {
  banners: initialBanners,
  availabilityRules = [],
  userGroups = [],
  onSaved,
}) {
  /** @type {import('../../shared/marketing-banners.d.ts').MarketingBanner[]} */
  let banners = initialBanners.map(b => normalizeMarketingBanner(b, b.id));
  /** @type {string|null} */
  let selectedId = banners[0]?.id || null;
  /** @type {boolean} */
  let isNew = false;
  /** @type {string|null} */
  let draftBannerId = null;
  /** @type {import('../../shared/marketing-banners.d.ts').MarketingBanner|null} */
  let pristineBanner = null;

  const activeRules = availabilityRules.filter(r => r.status !== 'archived');

  /** @type {Record<string, string>} */
  const previewObjectUrls = {};

  /** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
  function cloneBanner(banner) {
    return normalizeMarketingBanner({
      ...banner,
      locationIds: [...(banner.locationIds || [])],
      targetUserGroupIds: [...(banner.targetUserGroupIds || [])],
      targetDevices: [...(banner.targetDevices || [])],
      visibleInWeb: banner.visibleInWeb !== false,
      visibleInKiosk: banner.visibleInKiosk === true,
    }, banner.id);
  }

  /** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
  function setPristineSnapshot(banner) {
    pristineBanner = cloneBanner(banner);
  }

  /** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
  function getBannerComparable(banner) {
    const n = normalizeMarketingBanner(banner, banner.id);
    return JSON.stringify({
      bannerFormat: n.bannerFormat,
      title: n.title,
      shortDescription: n.shortDescription,
      fullDescription: n.fullDescription,
      thumbnailUrl: n.thumbnailUrl,
      bannerUrl: n.bannerUrl,
      isActive: n.isActive,
      placement: n.placement,
      targetDevices: [...n.targetDevices].sort(),
      visibleInWeb: n.visibleInWeb !== false,
      visibleInKiosk: n.visibleInKiosk === true,
      locationMode: n.locationMode,
      locationIds: [...n.locationIds].sort(),
      audienceMode: n.audienceMode,
      targetUserGroupIds: [...n.targetUserGroupIds].sort(),
      scheduleId: n.scheduleId,
      campaignDateStart: n.campaignDateStart,
      campaignDateEnd: n.campaignDateEnd,
      sortOrder: n.sortOrder,
      accentColor: n.accentColor,
      backgroundColor: n.backgroundColor,
      badgeText: n.badgeText,
      clickAction: n.clickAction,
      clickUrl: n.clickUrl,
      fullscreenImageUrl: n.fullscreenImageUrl,
    });
  }

  /** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
  function isDraftEmpty(banner) {
    const def = createDefaultMarketingBanner(banner.id);
    return getBannerComparable(banner) === getBannerComparable(def);
  }

  function isFormDirty() {
    if (!pristineBanner || !selectedId) return false;
    syncPanelToState();
    const current = selectedBanner();
    if (!current) return false;
    return getBannerComparable(current) !== getBannerComparable(pristineBanner);
  }

  /** @param {string} bannerId */
  function clearPreviewUrlsForBanner(bannerId) {
    Object.keys(previewObjectUrls).forEach(key => {
      if (!key.startsWith(`${bannerId}-`)) return;
      const url = previewObjectUrls[key];
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      delete previewObjectUrls[key];
    });
  }

  function discardCurrentBannerChanges() {
    const currentId = selectedId;
    if (!currentId) return;

    if (isNew || currentId === draftBannerId) {
      banners = banners.filter(b => b.id !== currentId);
      draftBannerId = null;
      isNew = false;
    } else if (pristineBanner?.id === currentId) {
      banners = banners.map(b => (b.id === currentId ? cloneBanner(pristineBanner) : b));
    }

    clearPreviewUrlsForBanner(currentId);
    pristineBanner = null;
  }

  /** @param {string} targetId */
  function finishSelectBanner(targetId) {
    selectedId = targetId;
    isNew = targetId === draftBannerId;
    const banner = banners.find(b => b.id === targetId);
    if (banner) setPristineSnapshot(banner);
    else pristineBanner = null;
    render();
  }

  /** @param {string} targetId */
  async function attemptSelectBanner(targetId) {
    if (!targetId || targetId === selectedId) return;

    syncPanelToState();
    const current = selectedBanner();

    if (current && (isNew || selectedId === draftBannerId) && isDraftEmpty(current)) {
      banners = banners.filter(b => b.id !== selectedId);
      clearPreviewUrlsForBanner(selectedId);
      draftBannerId = null;
      isNew = false;
      pristineBanner = null;
      finishSelectBanner(targetId);
      return;
    }

    if (current && isFormDirty()) {
      const choice = await promptUnsavedChanges({
        message: 'Есть несохранённые изменения. Перейти к другому баннеру без сохранения?',
      });
      if (choice === 'cancel') return;
      if (choice === 'save') {
        const ok = await saveCurrentBanner();
        if (!ok) return;
        finishSelectBanner(targetId);
        return;
      }

      const leavingId = selectedId;
      discardCurrentBannerChanges();
      if (!banners.some(b => b.id === targetId)) {
        selectedId = banners[0]?.id || null;
        isNew = selectedId != null && selectedId === draftBannerId;
        const next = selectedBanner();
        if (next) setPristineSnapshot(next);
        render();
        return;
      }
      if (leavingId !== targetId) finishSelectBanner(targetId);
      else render();
      return;
    }

    finishSelectBanner(targetId);
  }

  function closeBannerEditor() {
    const currentId = selectedId;
    if (currentId && (isNew || currentId === draftBannerId)) {
      discardCurrentBannerChanges();
    }
    selectedId = null;
    isNew = false;
    pristineBanner = null;
    render();
  }

  function createNewDraft() {
    if (draftBannerId) {
      const staleDraft = banners.find(b => b.id === draftBannerId);
      if (staleDraft && isDraftEmpty(staleDraft)) {
        banners = banners.filter(b => b.id !== draftBannerId);
        clearPreviewUrlsForBanner(draftBannerId);
      }
    }

    const draft = createDefaultMarketingBanner();
    draftBannerId = draft.id;
    banners = [draft, ...banners.filter(b => b.id !== draft.id)];
    selectedId = draft.id;
    isNew = true;
    setPristineSnapshot(draft);
    render();
  }

  async function attemptCreateBanner() {
    syncPanelToState();
    const current = selectedBanner();

    if (current && selectedId === draftBannerId && isDraftEmpty(current)) {
      return;
    }

    if (current && isFormDirty()) {
      const choice = await promptUnsavedChanges({
        message: 'Есть несохранённые изменения. Создать новый баннер без сохранения?',
      });
      if (choice === 'cancel') return;
      if (choice === 'save') {
        const ok = await saveCurrentBanner();
        if (!ok) return;
        createNewDraft();
        return;
      }
      discardCurrentBannerChanges();
      createNewDraft();
      return;
    }

    createNewDraft();
  }

  function selectedBanner() {
    return banners.find(b => b.id === selectedId) || null;
  }

  function requiredStar() {
    return '<span class="mkb-required" aria-hidden="true"> *</span>';
  }

  function resolveImagePreviewUrl(field, url) {
    const key = `${selectedId}-${field}`;
    if (previewObjectUrls[key]) return previewObjectUrls[key];
    const raw = String(url || '').trim();
    if (!raw) return null;
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
    return resolveProductImageUrl(raw);
  }

  /** Raw persisted path or in-memory blob — resolved once in productThumbHtml. */
  function listBannerThumbUrl(banner) {
    const thumbKey = `${banner.id}-thumbnail-url`;
    if (previewObjectUrls[thumbKey]) return previewObjectUrls[thumbKey];
    if (banner.thumbnailUrl) return banner.thumbnailUrl;
    const bannerKey = `${banner.id}-banner-url`;
    if (previewObjectUrls[bannerKey]) return previewObjectUrls[bannerKey];
    return banner.bannerUrl || null;
  }

  function refreshAllImagePreviews() {
    const banner = selectedBanner();
    if (!banner) return;
    ['thumbnail-url', 'banner-url', 'fullscreen-image-url'].forEach(field => {
      const hidden = host.querySelector(`[data-field="${field}"]`);
      const url = hidden?.value.trim()
        || (field === 'thumbnail-url' ? banner.thumbnailUrl
          : field === 'banner-url' ? banner.bannerUrl
            : banner.fullscreenImageUrl);
      if (url) updateImagePreview(field, resolveImagePreviewUrl(field, url));
    });
  }

  function clearFormErrors(panel) {
    panel.querySelectorAll('.mkb-field-error').forEach(el => el.classList.remove('mkb-field-error'));
    panel.querySelectorAll('.mkb-field-error-msg').forEach(el => el.remove());
  }

  function clearFieldError(el) {
    el.closest('[data-field-wrap]')?.classList.remove('mkb-field-error');
    el.closest('[data-field-wrap]')?.querySelector('.mkb-field-error-msg')?.remove();
  }

  /** @param {import('../../shared/marketing-banners.d.ts').MarketingBanner} banner */
  function collectFormErrors(banner) {
    /** @type {{ field: string, message: string }[]} */
    const errors = [];
    const req = 'Поле обязательно для заполнения';

    if (!banner.title.trim()) errors.push({ field: 'title', message: req });
    if (!banner.shortDescription.trim()) errors.push({ field: 'short-description', message: req });
    if (!banner.fullDescription.trim()) errors.push({ field: 'full-description', message: req });

    if (banner.bannerFormat === 'square') {
      if (!banner.thumbnailUrl) errors.push({ field: 'thumbnail-url', message: req });
    } else if (!banner.bannerUrl) {
      errors.push({ field: 'banner-url', message: req });
    }

    if (banner.clickAction === 'url') {
      if (!banner.clickUrl?.trim()) {
        errors.push({ field: 'click-url', message: req });
      }
    } else if (!banner.fullscreenImageUrl) {
      errors.push({ field: 'fullscreen-image-url', message: req });
    }

    return errors;
  }

  function applyFormErrors(panel, errors) {
    clearFormErrors(panel);
    let firstEl = null;
    errors.forEach(({ field, message }) => {
      const wrap = panel.querySelector(`[data-field-wrap="${field}"]`);
      if (!wrap) return;
      wrap.classList.add('mkb-field-error');
      const msg = document.createElement('p');
      msg.className = 'mkb-field-error-msg';
      msg.textContent = message;
      wrap.appendChild(msg);
      if (!firstEl) {
        firstEl = wrap.querySelector('input, textarea, select, button[data-image-pick]') || wrap;
      }
    });
    firstEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (firstEl && typeof firstEl.focus === 'function') firstEl.focus();
  }

  function readChannelModeFromPanel(panel) {
    const active = panel.querySelector('[data-mkb-channel-mode].period-tab--active');
    return active?.dataset.mkbChannelMode || 'everywhere';
  }

  function syncPanelToState() {
    const panel = host.querySelector('#mkb-detail-panel');
    if (!selectedId || !panel) return;

    const locationMode = panel.querySelector('[data-field="location-mode"]')?.value === 'specific'
      ? 'specific'
      : 'all';
    const audienceMode = panel.querySelector('[data-field="audience-mode"]')?.value === 'groups'
      ? 'groups'
      : 'all';

    const format = panel.querySelector('[data-field="banner-format"]')?.value
      || panel.querySelector('[data-format-tab].mkb-format-tab--active')?.dataset.formatTab
      || selectedBanner()?.bannerFormat
      || 'square';
    const placementSelect = panel.querySelector('[data-field="placement"]');
    const placement = format === 'square' ? 'story' : (placementSelect?.value || 'hero');
    const sortField = panel.querySelector('[data-field="sort-order"]');
    const accentField = panel.querySelector('[data-field="accent-color"]');
    const current = banners.find(b => b.id === selectedId);
    const { visibleInWeb, visibleInKiosk } = marketingChannelFlagsFromMode(readChannelModeFromPanel(panel));

    const draft = normalizeMarketingBanner({
      id: selectedId,
      bannerFormat: format,
      title: panel.querySelector('[data-field="title"]')?.value.trim() || '',
      shortDescription: panel.querySelector('[data-field="short-description"]')?.value.trim() || '',
      fullDescription: panel.querySelector('[data-field="full-description"]')?.value.trim() || '',
      thumbnailUrl: sanitizePersistedImageUrl(panel.querySelector('[data-field="thumbnail-url"]')?.value.trim() || null),
      bannerUrl: sanitizePersistedImageUrl(panel.querySelector('[data-field="banner-url"]')?.value.trim() || null),
      isActive: visibleInWeb || visibleInKiosk,
      placement,
      clickAction: panel.querySelector('[data-field="click-action"]')?.value || 'fullscreen_image',
      clickUrl: panel.querySelector('[data-field="click-url"]')?.value.trim() || null,
      fullscreenImageUrl: sanitizePersistedImageUrl(panel.querySelector('[data-field="fullscreen-image-url"]')?.value.trim() || null),
      locationMode,
      locationIds: locationMode === 'specific'
        ? [...panel.querySelectorAll('[data-location-id]:checked')].map(el => el.dataset.locationId)
        : [],
      audienceMode,
      targetUserGroupIds: audienceMode === 'groups'
        ? [...panel.querySelectorAll('[data-user-group-id]:checked')].map(el => el.dataset.userGroupId)
        : [],
      scheduleId: panel.querySelector('[data-field="schedule-id"]')?.value || null,
      campaignDateStart: panel.querySelector('[data-field="date-start"]')?.value || null,
      campaignDateEnd: panel.querySelector('[data-field="date-end"]')?.value || null,
      sortOrder: sortField
        ? Number(sortField.value) || 1
        : (current?.sortOrder ?? 0),
      accentColor: accentField?.value || current?.accentColor || MARKETING_ACCENT_COLORS[0].id,
      backgroundColor: panel.querySelector('[data-field="background-color"]')?.value
        || MARKETING_BACKGROUND_COLORS[0].id,
      badgeText: panel.querySelector('[data-field="badge-text"]')?.value.trim() || null,
      visibleInWeb,
      visibleInKiosk,
    }, selectedId);

    banners = banners.map(b => (b.id === selectedId ? draft : b));
  }

  function renderChannelVisibilitySection(banner) {
    const mode = resolveMarketingChannelMode(banner.visibleInWeb, banner.visibleInKiosk);
    return `
      <div class="admin-field-block admin-channel-field">
        <span class="admin-field-label">Доступность</span>
        <div class="admin-channel-tabs-wrap">
          <div class="period-tabs admin-channel-tabs admin-channel-tabs--h10 mkb-channel-tabs" role="radiogroup" aria-label="Доступность баннера">
            ${MARKETING_CHANNEL_MODES.map(o => `
              <button
                type="button"
                class="period-tab btn-press ${mode === o.id ? 'period-tab--active' : ''}"
                data-mkb-channel-mode="${o.id}"
                role="radio"
                aria-checked="${mode === o.id}"
              >${esc(o.label)}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function syncChannelTabs() {
    const banner = selectedBanner();
    const panel = host.querySelector('#mkb-detail-panel');
    if (!banner || !panel) return;
    const mode = resolveMarketingChannelMode(banner.visibleInWeb, banner.visibleInKiosk);
    panel.querySelectorAll('[data-mkb-channel-mode]').forEach(btn => {
      const active = btn.dataset.mkbChannelMode === mode;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function channelBadgeHtml(channel, banner) {
    const isWeb = channel === 'web';
    const active = isWeb
      ? banner.visibleInWeb !== false
      : banner.visibleInKiosk === true;
    const order = Number(banner.sortOrder) || 0;
    const letter = isWeb ? 'W' : 'K';
    const channelLabel = isWeb ? 'Веб' : 'Киоск';
    const classes = [
      'cgr-channel-badge',
      isWeb ? 'cgr-channel-badge--web' : 'cgr-channel-badge--kiosk',
      active ? 'cgr-channel-badge--active' : 'cgr-channel-badge--inactive',
    ].join(' ');
    const indexPart = active && order >= 1
      ? `<span class="cgr-channel-badge-num">${order}</span>`
      : '';
    const ariaLabel = active && order >= 1
      ? `${channelLabel}, порядок ${order}`
      : active
        ? `${channelLabel}, активен`
        : `${channelLabel}, неактивен`;

    return `<span class="${classes}" aria-label="${escAttr(ariaLabel)}">${letter}${indexPart}</span>`;
  }

  function channelIndicatorsHtml(banner) {
    return `${channelBadgeHtml('web', banner)}${channelBadgeHtml('kiosk', banner)}`;
  }

  function sortBannersForList(items) {
    return [...items].sort((a, b) => {
      const ao = Number(a.sortOrder) || 0;
      const bo = Number(b.sortOrder) || 0;
      if (ao !== bo) return ao - bo;
      return a.title.localeCompare(b.title, 'ru');
    });
  }

  function bannerScheduleStatus(banner) {
    const rule = banner.scheduleId
      ? activeRules.find(r => r.id === banner.scheduleId)
      : null;
    return scheduleStatusForBanner(banner, rule);
  }

  function isBannerDeprioritized(banner) {
    return isMarketingBannerHidden(banner) || bannerScheduleStatus(banner).isExpired === true;
  }

  function listRowMetaHtml(banner) {
    return renderListMetaWithSchedule(
      formatMarketingBannerSummary(banner),
      bannerScheduleStatus(banner),
    );
  }

  function partitionBannersForList() {
    const sorted = sortBannersForList(banners);
    const active = sorted.filter(b => !isBannerDeprioritized(b));
    const inactive = sorted.filter(b => isBannerDeprioritized(b));
    return { active, inactive };
  }

  function renderHiddenBannersDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Скрытые баннеры (${count}) —</span>
      </li>
    `;
  }

  function renderListItemsHtml() {
    const { active, inactive } = partitionBannersForList();
    return [
      ...active.map(b => renderListRow(b)),
      renderHiddenBannersDivider(inactive.length),
      ...inactive.map(b => renderListRow(b)),
    ].join('');
  }

  function refreshListOrder() {
    const list = host.querySelector('#mkb-list');
    if (!list) return;
    list.innerHTML = renderListItemsHtml();
  }

  function renderScheduleOptions(selected) {
    return `
      <option value="">Без расписания (круглосуточно)</option>
      ${activeRules.map(r => `
        <option value="${escAttr(r.id)}" ${r.id === selected ? 'selected' : ''}>
          ${esc(r.name)} — ${esc(formatAvailabilityRuleShort(r))}
        </option>
      `).join('')}
    `;
  }

  function renderLocationCheckboxes(selected = []) {
    const set = new Set(selected);
    const options = [
      { id: MARKETING_DEFAULT_LOCATION_ID, name: 'Основная столовая' },
      ...activeRules.map(r => ({ id: r.id, name: r.name })),
    ];
    return `
      <div class="mkb-chip-group" role="group" aria-label="Локации">
        ${options.map(opt => `
          <label class="mkb-chip btn-press ${set.has(opt.id) ? 'mkb-chip--active' : ''}">
            <input type="checkbox" data-location-id="${escAttr(opt.id)}" ${set.has(opt.id) ? 'checked' : ''} hidden />
            <span>${esc(opt.name)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderUserGroupCheckboxes(selected = []) {
    const set = new Set(selected);
    return `
      <div class="mkb-chip-group" role="group" aria-label="Группы клиентов">
        ${userGroups.map(g => `
          <label class="mkb-chip btn-press ${set.has(g.id) ? 'mkb-chip--active' : ''}">
            <input type="checkbox" data-user-group-id="${escAttr(g.id)}" ${set.has(g.id) ? 'checked' : ''} hidden />
            <span>${esc(g.name)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderBackgroundColorOptions(selected) {
    const value = selected || MARKETING_BACKGROUND_COLORS[0].id;
    return `
      <div class="mkb-color-presets" role="radiogroup" aria-label="Цвет фона баннера">
        ${MARKETING_BACKGROUND_COLORS.map(c => `
          <label class="mkb-color-preset ${value === c.id ? 'mkb-color-preset--active' : ''}">
            <input type="radio" name="mkb-bg-color" data-field="background-color" value="${escAttr(c.id)}"
              ${value === c.id ? 'checked' : ''} hidden />
            <span class="mkb-color-swatch" style="background:${escAttr(c.id)}"></span>
            <span class="mkb-color-preset-label">${esc(c.label)}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderFormatTabs(banner) {
    const format = banner.bannerFormat || 'square';
    return `
      <div class="mkb-form-field">
        <span class="mkb-field-label">Формат баннера</span>
        <input type="hidden" data-field="banner-format" value="${escAttr(format)}" />
        <div class="mkb-format-tabs" role="tablist" aria-label="Формат баннера">
          ${MARKETING_FORMAT_OPTIONS.map(opt => `
            <button type="button" role="tab" class="mkb-format-tab ${format === opt.id ? 'mkb-format-tab--active' : ''}"
              data-format-tab="${escAttr(opt.id)}" aria-selected="${format === opt.id ? 'true' : 'false'}">
              ${esc(opt.label)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderPlacementField(banner) {
    const format = banner.bannerFormat || 'square';
    const options = format === 'square'
      ? MARKETING_SQUARE_PLACEMENT_OPTIONS
      : MARKETING_WIDE_PLACEMENT_OPTIONS;
    const locked = format === 'square';

    return `
      <label class="mkb-form-field">
        <span class="mkb-field-label">Размещение</span>
        <select data-field="placement" class="avr-select mkb-input" ${locked ? 'disabled aria-readonly="true"' : ''}>
          ${options.map(o => `
            <option value="${o.id}" ${(locked ? o.id === 'story' : banner.placement === o.id) ? 'selected' : ''}>${esc(o.label)}</option>
          `).join('')}
        </select>
      </label>
    `;
  }

  function renderClickActionSelect(banner) {
    return `
      <label class="mkb-form-field">
        <span class="mkb-field-label">Действие при нажатии</span>
        <select data-field="click-action" class="avr-select mkb-input">
          ${MARKETING_CLICK_ACTION_OPTIONS.map(o => `
            <option value="${o.id}" ${banner.clickAction === o.id ? 'selected' : ''}>${esc(o.label)}</option>
          `).join('')}
        </select>
      </label>
    `;
  }

  function renderClickUrlField(banner) {
    const showUrl = banner.clickAction === 'url';
    return `
      <div class="mkb-form-field mkb-reveal ${showUrl ? 'mkb-reveal--visible' : ''}" data-click-url-field data-field-wrap="click-url">
        <label class="mkb-field-label">Ссылка для перехода${requiredStar()}</label>
        <input type="url" class="avr-name-input mkb-input" data-field="click-url"
          value="${escAttr(banner.clickUrl || '')}" placeholder="https://example.com/promo" />
      </div>
    `;
  }

  function renderFullscreenImageField(banner) {
    const show = banner.clickAction !== 'url';
    return `
      <div class="mkb-reveal ${show ? 'mkb-reveal--visible' : ''}" data-fullscreen-image-field>
        ${renderImageField({
          field: 'fullscreen-image-url',
          label: 'Полноформатное изображение для модального окна',
          hint: 'Изображение, которое откроется на весь экран при клике на баннер',
          specHint: MARKETING_FULLSCREEN_SPEC_HINT,
          url: banner.fullscreenImageUrl,
          name: banner.title,
          acceptKind: 'fullscreen',
          aspect: 'fullscreen',
        })}
      </div>
    `;
  }

  function renderClickActionContentFields(banner) {
    return `${renderFullscreenImageField(banner)}${renderClickUrlField(banner)}`;
  }

  function renderClickActionFields(banner) {
    return `${renderClickActionSelect(banner)}${renderClickActionContentFields(banner)}`;
  }

  function renderFormatDependentFields(banner) {
    const format = banner.bannerFormat || 'square';
    const isPromoHorizontal = isPromoHorizontalPlacement(banner.placement);
    const visibility = renderChannelVisibilitySection(banner);

    if (format === 'square') {
      return `
        ${renderPlacementField(banner)}
        ${visibility}
        <div class="mkb-sort-block">
          <label class="mkb-form-field mkb-form-field--sort">
            <span class="mkb-field-label mkb-field-label--nowrap">Порядок (index)</span>
            <input type="number" class="avr-name-input mkb-input mkb-input--compact" data-field="sort-order" min="1" step="1"
              value="${escAttr(String(banner.sortOrder || 1))}" />
          </label>
          <p class="mkb-hint mkb-sort-hint">${esc(MARKETING_STORY_SORT_HINT)}</p>
        </div>
        ${renderImageField({
          field: 'thumbnail-url',
          label: 'Миниатюра (истории / карточка)',
          hint: 'Квадратное изображение для компактной ленты',
          specHint: MARKETING_THUMBNAIL_SPEC_HINT,
          url: banner.thumbnailUrl,
          name: banner.title,
          acceptKind: 'thumbnail',
          required: true,
          aspect: 'square',
        })}
        <label class="mkb-form-field" data-field-wrap="accent-color">
          <span class="mkb-field-label">Цвет рамки (истории)</span>
          <select data-field="accent-color" class="avr-select mkb-input">
            ${MARKETING_ACCENT_COLORS.map(c => `
              <option value="${escAttr(c.id)}" ${banner.accentColor === c.id ? 'selected' : ''}>${esc(c.label)}</option>
            `).join('')}
          </select>
        </label>
        ${renderClickActionSelect(banner)}
        ${renderClickActionContentFields(banner)}
      `;
    }

    return `
      ${renderPlacementField(banner)}
      ${visibility}
      <div class="mkb-reveal ${isPromoHorizontal ? 'mkb-reveal--visible' : ''}" data-promo-horizontal-fields>
        <div class="mkb-reveal-inner admin-form-stack">
          <div class="mkb-form-field">
            <span class="mkb-field-label">Цвет фона баннера</span>
            ${renderBackgroundColorOptions(banner.backgroundColor)}
          </div>
          <label class="mkb-form-field">
            <span class="mkb-field-label">Текст бейджа (выделение)</span>
            <input type="text" class="avr-name-input mkb-input" data-field="badge-text"
              value="${escAttr(banner.badgeText || '')}" placeholder="до 50%" />
            <p class="mkb-hint">В коротком описании используйте <code>{badge}</code>, например: «Кешбэк {badge} на новинки»</p>
          </label>
        </div>
      </div>
      ${renderImageField({
        field: 'banner-url',
        label: 'Широкоформатный баннер',
        hint: 'Горизонтальное изображение или PNG с маскотом',
        specHint: MARKETING_BANNER_SPEC_HINT,
        url: banner.bannerUrl,
        name: banner.title,
        acceptKind: 'banner',
        aspect: 'wide',
      })}
      ${renderClickActionFields(banner)}
    `;
  }

  function mountFormatDependentSection(banner) {
    const hostEl = host.querySelector('#mkb-format-dependent');
    if (!hostEl) return;
    hostEl.innerHTML = renderFormatDependentFields(banner);
    bindFormatDependentEvents();
    refreshAllImagePreviews();
  }

  function clearImagePreview(field) {
    const key = `${selectedId}-${field}`;
    if (previewObjectUrls[key]) {
      URL.revokeObjectURL(previewObjectUrls[key]);
      delete previewObjectUrls[key];
    }
  }

  function switchBannerFormat(nextFormat) {
    const prevFormat = selectedBanner()?.bannerFormat || 'square';
    if (prevFormat === nextFormat) return;

    syncPanelToState();
    const current = selectedBanner();
    if (!current) return;

    if (nextFormat === 'square') clearImagePreview('banner-url');
    else clearImagePreview('thumbnail-url');

    const switched = sanitizeBannerForFormat({
      ...current,
      bannerFormat: nextFormat,
      placement: nextFormat === 'square'
        ? 'story'
        : (current.placement === 'promo_horizontal' ? 'promo_horizontal' : 'hero'),
      sortOrder: nextFormat === 'square'
        ? (current.sortOrder >= 1 ? current.sortOrder : 1)
        : current.sortOrder,
      clickAction: current.clickAction || 'fullscreen_image',
      clickUrl: current.clickAction === 'url' ? current.clickUrl : null,
    });

    banners = banners.map(b => (b.id === selectedId ? switched : b));

    const panel = host.querySelector('#mkb-detail-panel');
    const hiddenFormat = panel?.querySelector('[data-field="banner-format"]');
    if (hiddenFormat) hiddenFormat.value = nextFormat;
    panel?.querySelectorAll('[data-format-tab]').forEach(btn => {
      const active = btn.dataset.formatTab === nextFormat;
      btn.classList.toggle('mkb-format-tab--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    mountFormatDependentSection(switched);
    updateListRow(selectedId);
  }

  function bindFormatTabEvents() {
    const panel = host.querySelector('#mkb-detail-panel');
    const tabs = panel?.querySelector('.mkb-format-tabs');
    if (!tabs) return;

    tabs.querySelectorAll('[data-format-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchBannerFormat(btn.dataset.formatTab);
      });
    });
  }

  function imageKindForField(field) {
    if (field === 'banner-url') return 'banner';
    if (field === 'fullscreen-image-url') return 'fullscreen';
    return 'thumbnail';
  }

  function updateClickActionFields(section, action) {
    section.querySelector('[data-click-url-field]')
      ?.classList.toggle('mkb-reveal--visible', action === 'url');
    section.querySelector('[data-fullscreen-image-field]')
      ?.classList.toggle('mkb-reveal--visible', action !== 'url');
  }

  function bindFormatDependentEvents() {
    const panel = host.querySelector('#mkb-detail-panel');
    const section = host.querySelector('#mkb-format-dependent');
    if (!panel || !section) return;

    section.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', () => {
        clearFieldError(el);
        syncPanelToState();
        updateListRow(selectedId, { resort: el.matches('[data-field="sort-order"]') });
      });
      el.addEventListener('change', () => {
        clearFieldError(el);
        syncPanelToState();
        updateListRow(selectedId, { resort: el.matches('[data-field="sort-order"]') });
      });
    });

    section.querySelector('[data-field="placement"]')?.addEventListener('change', e => {
      const isPromo = e.target.value === 'promo_horizontal';
      section.querySelector('[data-promo-horizontal-fields]')
        ?.classList.toggle('mkb-reveal--visible', isPromo);
      syncPanelToState();
      updateListRow(selectedId);
    });

    section.querySelector('[data-field="click-action"]')?.addEventListener('change', e => {
      updateClickActionFields(section, e.target.value);
      syncPanelToState();
    });

    section.addEventListener('click', e => {
      const modeBtn = e.target.closest('[data-mkb-channel-mode]');
      if (!modeBtn || !selectedId) return;
      e.preventDefault();
      const { visibleInWeb, visibleInKiosk } = marketingChannelFlagsFromMode(modeBtn.dataset.mkbChannelMode);
      banners = banners.map(b => (
        b.id === selectedId
          ? { ...b, visibleInWeb, visibleInKiosk, isActive: visibleInWeb || visibleInKiosk }
          : b
      ));
      syncChannelTabs();
      updateListRow(selectedId, { resort: true });
    });

    section.querySelectorAll('[data-field="background-color"]').forEach(radio => {
      radio.addEventListener('change', () => {
        section.querySelectorAll('.mkb-color-preset').forEach(el => {
          const input = el.querySelector('[data-field="background-color"]');
          el.classList.toggle('mkb-color-preset--active', input?.checked === true);
        });
        syncPanelToState();
      });
    });

    section.querySelectorAll('[data-image-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.imagePick;
        section.querySelector(`[data-image-input="${field}"]`)?.click();
      });
    });

    section.querySelectorAll('[data-image-input]').forEach(input => {
      input.addEventListener('change', async () => {
        const field = input.dataset.imageInput;
        const file = input.files?.[0];
        if (!file) return;

        const kind = imageKindForField(field);
        try {
          validateMarketingImageFile(file, kind);
        } catch (err) {
          showToast(err.message || 'Недопустимый файл', 'error');
          input.value = '';
          return;
        }

        const key = `${selectedId}-${field}`;
        const blobUrl = URL.createObjectURL(file);
        if (previewObjectUrls[key] && previewObjectUrls[key] !== blobUrl) {
          URL.revokeObjectURL(previewObjectUrls[key]);
        }
        previewObjectUrls[key] = blobUrl;
        updateImagePreview(field, blobUrl);

        const hidden = section.querySelector(`[data-field="${field}"]`);
        const urlInput = section.querySelector(`[data-image-url="${field}"]`);
        const pickBtn = section.querySelector(`[data-image-pick="${field}"]`);
        if (pickBtn) pickBtn.disabled = true;

        try {
          const path = await uploadProductImage(file);
          if (hidden) hidden.value = path;
          if (urlInput) urlInput.value = path;
          if (previewObjectUrls[key]) {
            URL.revokeObjectURL(previewObjectUrls[key]);
            delete previewObjectUrls[key];
          }
          updateImagePreview(field, path);
          clearFieldError(section.querySelector(`[data-image-field="${field}"]`) || hidden);
          syncPanelToState();
          updateListRow(selectedId);
        } catch (err) {
          if (hidden) hidden.value = '';
          if (urlInput) urlInput.value = '';
          showToast(
            err.message || 'Не удалось загрузить файл. Положите изображение в папку products/ и укажите путь вручную.',
            'error',
          );
        } finally {
          if (pickBtn) pickBtn.disabled = false;
          input.value = '';
        }
      });
    });

    section.querySelectorAll('[data-image-url]').forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.imageUrl;
        const newVal = input.value.trim();
        const hidden = section.querySelector(`[data-field="${field}"]`);
        if (hidden) hidden.value = newVal;
        const key = `${selectedId}-${field}`;
        const prev = previewObjectUrls[key];
        if (prev && prev.startsWith('blob:') && prev !== newVal) {
          URL.revokeObjectURL(prev);
          delete previewObjectUrls[key];
        }
        if (newVal.startsWith('blob:')) {
          showToast('Временные ссылки не сохраняются. Выберите файл или укажите /products/…', 'error');
          const safe = sanitizePersistedImageUrl(newVal);
          if (hidden) hidden.value = safe || '';
          if (input.value !== (safe || '')) input.value = safe || '';
          return;
        }
        if (newVal.startsWith('data:')) {
          previewObjectUrls[key] = newVal;
        }
        clearFieldError(input);
        updateImagePreview(field, newVal);
        syncPanelToState();
        updateListRow(selectedId);
      });
    });
  }

  function renderImageField({
    field,
    label,
    hint,
    specHint,
    url,
    name,
    acceptKind,
    required = false,
    aspect = 'square',
  }) {
    const previewUrl = resolveImagePreviewUrl(field, url);
    const aspectClass = aspect === 'wide'
      ? 'mkb-image-preview--wide'
      : aspect === 'fullscreen'
        ? 'mkb-image-preview--fullscreen'
        : 'mkb-image-preview--square';
    return `
      <div class="mkb-image-field" data-image-field="${escAttr(field)}" data-field-wrap="${escAttr(field)}"
        data-image-kind="${escAttr(acceptKind)}" data-image-aspect="${escAttr(aspect)}">
        <span class="mkb-field-label">${esc(label)}${required ? requiredStar() : ''}</span>
        <p class="mkb-hint">${esc(hint)}</p>
        <div class="mkb-image-preview ${aspectClass}">
          ${productThumbHtml({ name, imageUrl: previewUrl }, 'mkb-thumb')}
        </div>
        <input type="hidden" data-field="${escAttr(field)}" value="${escAttr(url || '')}" />
        <div class="admin-media-row mkb-image-actions">
          <input type="file" accept="image/jpeg,image/png" data-image-input="${escAttr(field)}" hidden />
          <button type="button" class="action-btn btn-press products-create-btn" data-image-pick="${escAttr(field)}">Выбрать файл</button>
          <input type="text" class="admin-field-input mkb-url-input" data-image-url="${escAttr(field)}"
            value="${escAttr(url || '')}" placeholder="/products/dish.jpg или URL" />
        </div>
        <p class="mkb-image-spec">${esc(specHint)}</p>
        <p class="mkb-hint mkb-hint--inline">Файл сохраняется в <code>products/</code> автоматически</p>
      </div>
    `;
  }

  function renderDetailPanel(banner) {
    const locationSpecific = banner.locationMode === 'specific';
    const audienceGroups = banner.audienceMode === 'groups';

    return `
      <div class="avr-detail-inner mkb-detail-inner" id="mkb-detail-panel">
        ${renderAvrDetailStickyHead({
          title: isNew ? 'Новый баннер' : 'Редактирование баннера',
          cancelId: 'mkb-detail-cancel',
          saveId: 'mkb-save-btn',
          saveLabel: 'Сохранить баннер',
        })}

        <div class="avr-detail-body admin-form-stack mkb-detail-body">
          <section class="mkb-block card">
            <h3 class="mkb-block-title">Контент карточки</h3>
            ${renderFormatTabs(banner)}
            <div class="mkb-form-field" data-field-wrap="title">
              <label class="mkb-field-label">Заголовок акции${requiredStar()} <span class="mkb-char-hint">(до 40 символов)</span></label>
              <input type="text" class="avr-name-input mkb-input" data-field="title" maxlength="40"
                value="${escAttr(banner.title)}" placeholder="Насладитесь новинками меню" />
            </div>
            <div class="mkb-form-field" data-field-wrap="short-description">
              <label class="mkb-field-label">Короткое описание${requiredStar()}</label>
              <input type="text" class="avr-name-input mkb-input" data-field="short-description"
                value="${escAttr(banner.shortDescription)}" placeholder="-50% · Новинка!" />
            </div>
            <div class="mkb-form-field" data-field-wrap="full-description">
              <label class="mkb-field-label">Полное описание${requiredStar()}</label>
              <textarea class="mkb-textarea" data-field="full-description" rows="5"
                placeholder="Развёрнутый текст акции. Поддерживается простой HTML: &lt;b&gt;, &lt;br&gt;, &lt;ul&gt;…">${esc(banner.fullDescription)}</textarea>
            </div>
            <div id="mkb-format-dependent" class="mkb-format-dependent">
              ${renderFormatDependentFields(banner)}
            </div>
          </section>

          <section class="mkb-block card">
            <h3 class="mkb-block-title">Таргетинг</h3>
            <label class="mkb-form-field">
              <span class="mkb-field-label">Локации</span>
              <select data-field="location-mode" class="avr-select mkb-input">
                <option value="all" ${!locationSpecific ? 'selected' : ''}>Все точки</option>
                <option value="specific" ${locationSpecific ? 'selected' : ''}>Конкретные объекты</option>
              </select>
            </label>
            <div class="mkb-reveal ${locationSpecific ? 'mkb-reveal--visible' : ''}" data-location-fields>
              <div class="mkb-reveal-inner">
                ${renderLocationCheckboxes(banner.locationIds)}
              </div>
            </div>
            <label class="mkb-form-field">
              <span class="mkb-field-label">Аудитория</span>
              <select data-field="audience-mode" class="avr-select mkb-input">
                <option value="all" ${!audienceGroups ? 'selected' : ''}>Все сотрудники / клиенты</option>
                <option value="groups" ${audienceGroups ? 'selected' : ''}>Конкретные группы</option>
              </select>
            </label>
            <div class="mkb-reveal ${audienceGroups ? 'mkb-reveal--visible' : ''}" data-audience-fields>
              <div class="mkb-reveal-inner">
                ${userGroups.length
                  ? renderUserGroupCheckboxes(banner.targetUserGroupIds)
                  : '<p class="mkb-hint">Создайте группы клиентов в разделе CRM.</p>'}
              </div>
            </div>
          </section>

          <section class="mkb-block card">
            <h3 class="mkb-block-title">Ограничение по времени</h3>
            <label class="mkb-form-field">
              <span class="mkb-field-label">Расписание</span>
              <select data-field="schedule-id" class="avr-select mkb-input">
                ${renderScheduleOptions(banner.scheduleId)}
              </select>
            </label>
            <div class="mkb-date-row">
              <label class="mkb-form-field">
                <span class="mkb-field-label">Дата начала акции</span>
                <input type="date" class="avr-name-input mkb-input" data-field="date-start"
                  value="${escAttr(banner.campaignDateStart || '')}" />
              </label>
              <label class="mkb-form-field">
                <span class="mkb-field-label">Дата окончания</span>
                <input type="date" class="avr-name-input mkb-input" data-field="date-end"
                  value="${escAttr(banner.campaignDateEnd || '')}" />
              </label>
            </div>
            <div class="mkb-info-box" role="note">
              💡 Глобальные даты «С» и «По» задают общий период проведения акции. Выбранное расписание определяет точные часы и дни недели внутри этого периода, когда баннер будет виден пользователям.
            </div>
          </section>
        </div>

        ${!isNew ? `
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger avr-detail-danger">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="mkb-delete-confirm" />
                <span>Я подтверждаю удаление этого баннера</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="mkb-detail-delete" disabled>
                Удалить баннер
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
        <span class="avr-detail-empty-icon" aria-hidden="true">📣</span>
        <p class="avr-detail-empty-title">Выберите баннер</p>
        <p class="avr-detail-empty-hint">Создайте новый баннер или выберите существующий из списка.</p>
      </div>
    `;
  }

  function renderListRow(banner) {
    const active = banner.id === selectedId;
    const deprioritized = isBannerDeprioritized(banner);
    const thumbUrl = listBannerThumbUrl(banner);
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''} ${deprioritized ? 'cgr-row--hidden' : ''}" data-id="${escAttr(banner.id)}">
        <button type="button" class="avr-row-main btn-press cgr-row-main" data-action="select" aria-pressed="${active}">
          <span class="cgr-row-left">
            <span class="avr-row-thumb">${productThumbHtml({ name: banner.title, imageUrl: thumbUrl })}</span>
            <span class="avr-row-info">
              <span class="avr-row-name">${esc(banner.title)}</span>
              <span class="avr-row-meta">${listRowMetaHtml(banner)}</span>
            </span>
          </span>
          <span class="cgr-row-indicators">${channelIndicatorsHtml(banner)}</span>
        </button>
      </li>
    `;
  }

  function render() {
    const banner = selectedBanner();
    host.innerHTML = `
      <div class="avr-layout mkb-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Баннеры (${banners.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="mkb-create-btn">+ Новый баннер</button>
          </div>
          <ul class="avr-list" id="mkb-list">${renderListItemsHtml()}</ul>
          ${!banners.length ? '<p class="avr-list-empty">Нет баннеров. Создайте первый.</p>' : ''}
        </div>
        <aside class="avr-detail" aria-label="Редактор баннера">
          ${banner ? renderDetailPanel(banner) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateImagePreview(field, url) {
    const wrap = host.querySelector(`[data-image-field="${field}"] .mkb-image-preview`);
    const banner = selectedBanner();
    if (wrap && banner) {
      wrap.innerHTML = productThumbHtml({ name: banner.title, imageUrl: url }, 'mkb-thumb');
    }
  }

  function bindPanelEvents() {
    const panel = host.querySelector('#mkb-detail-panel');
    if (!panel) return;

    panel.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.closest('#mkb-format-dependent')) return;
      if (el.matches('[data-field="banner-format"]')) return;
      if (el.matches('[data-format-tab]')) return;
      el.addEventListener('input', () => {
        clearFieldError(el);
        syncPanelToState();
        updateListRow(selectedId);
      });
      el.addEventListener('change', () => {
        clearFieldError(el);
        syncPanelToState();
        updateListRow(selectedId);
      });
    });

    panel.querySelector('[data-field="location-mode"]')?.addEventListener('change', e => {
      const visible = e.target.value === 'specific';
      panel.querySelector('[data-location-fields]')?.classList.toggle('mkb-reveal--visible', visible);
      syncPanelToState();
    });

    panel.querySelector('[data-field="audience-mode"]')?.addEventListener('change', e => {
      const visible = e.target.value === 'groups';
      panel.querySelector('[data-audience-fields]')?.classList.toggle('mkb-reveal--visible', visible);
      syncPanelToState();
    });

    panel.querySelector('[data-field="schedule-id"]')?.addEventListener('change', () => {
      syncPanelToState();
      updateListRow(selectedId, { resort: true });
    });
    panel.querySelectorAll('[data-field="date-start"], [data-field="date-end"]').forEach(el => {
      el.addEventListener('change', () => {
        syncPanelToState();
        updateListRow(selectedId, { resort: true });
      });
    });

    bindFormatTabEvents();

    panel.querySelectorAll('[data-field="background-color"]').forEach(radio => {
      radio.addEventListener('change', () => {
        panel.querySelectorAll('.mkb-color-preset').forEach(el => {
          const input = el.querySelector('[data-field="background-color"]');
          el.classList.toggle('mkb-color-preset--active', input?.checked === true);
        });
        syncPanelToState();
      });
    });

    panel.querySelectorAll('[data-location-id], [data-user-group-id]').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('.mkb-chip')?.classList.toggle('mkb-chip--active', cb.checked);
        syncPanelToState();
      });
    });

    bindFormatDependentEvents();
    refreshAllImagePreviews();

    panel.querySelector('#mkb-delete-confirm')?.addEventListener('change', e => {
      const btn = panel.querySelector('#mkb-detail-delete');
      if (btn) btn.disabled = !e.target.checked;
    });

    panel.querySelector('#mkb-detail-delete')?.addEventListener('click', async () => {
      if (!selectedId || isNew) return;
      try {
        await deleteMarketingBanner(selectedId);
        showToast('Баннер удалён');
        banners = banners.filter(b => b.id !== selectedId);
        selectedId = banners[0]?.id || null;
        isNew = false;
        await onSaved?.();
        render();
      } catch (err) {
        showToast(err.message || 'Ошибка удаления', 'error');
      }
    });

    panel.querySelector('#mkb-save-btn')?.addEventListener('click', () => saveCurrentBanner());

    bindAvrDetailCancel(panel, 'mkb-detail-cancel', {
      isDirty: isFormDirty,
      discard: discardCurrentBannerChanges,
      save: () => saveCurrentBanner(),
      onClose: closeBannerEditor,
    });
  }

  function updateListRow(id, { resort = false } = {}) {
    if (resort) {
      refreshListOrder();
      return;
    }

    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const banner = banners.find(b => b.id === id);
    if (!row || !banner) return;

    const nameEl = row.querySelector('.avr-row-name');
    if (nameEl) nameEl.textContent = banner.title;

    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.innerHTML = listRowMetaHtml(banner);

    const indicators = row.querySelector('.cgr-row-indicators');
    if (indicators) indicators.innerHTML = channelIndicatorsHtml(banner);

    row.classList.toggle('cgr-row--hidden', isBannerDeprioritized(banner));

    const thumbEl = row.querySelector('.avr-row-thumb');
    if (thumbEl) {
      thumbEl.innerHTML = productThumbHtml({
        name: banner.title,
        imageUrl: listBannerThumbUrl(banner),
      });
    }
  }

  async function saveCurrentBanner() {
    const panel = host.querySelector('#mkb-detail-panel');
    if (!panel) return false;

    syncPanelToState();
    const banner = selectedBanner();
    if (!banner) return false;

    const formErrors = collectFormErrors(banner);
    if (formErrors.length) {
      applyFormErrors(panel, formErrors);
      return false;
    }

    clearFormErrors(panel);
    try {
      const validated = validateMarketingBanner(banner);
      const saved = await saveMarketingBanner(validated, isNew ? '' : selectedId);
      showToast(isNew ? 'Баннер создан' : 'Баннер сохранён');
      if (isNew) {
        banners = banners.filter(b => b.id !== selectedId);
      }
      banners = [...banners.filter(b => b.id !== saved.id), saved];
      selectedId = saved.id;
      isNew = false;
      draftBannerId = null;
      setPristineSnapshot(saved);
      await onSaved?.();
      render();
      return true;
    } catch (err) {
      const msg = err.message || 'Ошибка сохранения';
      const fieldMap = {
        'Укажите заголовок акции': 'title',
        'Укажите короткое описание': 'short-description',
        'Укажите полное описание': 'full-description',
        'Загрузите миниатюру для ленты «Историй»': 'thumbnail-url',
        'Загрузите широкоформатный баннер': 'banner-url',
        'Загрузите полноформатное изображение для модального окна': 'fullscreen-image-url',
        'Укажите корректную ссылку (http:// или https://)': 'click-url',
      };
      const field = fieldMap[msg];
      if (field) {
        applyFormErrors(panel, [{ field, message: 'Поле обязательно для заполнения' }]);
      } else {
        applyFormErrors(panel, [{ field: 'title', message: msg }]);
      }
      return false;
    }
  }

  function bindEvents() {
    host.querySelector('#mkb-create-btn')?.addEventListener('click', () => {
      attemptCreateBanner();
    });

    host.querySelectorAll('[data-action="select"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.closest('.avr-row')?.dataset.id || null;
        attemptSelectBanner(targetId);
      });
    });

    bindPanelEvents();
  }

  if (selectedId) {
    const initial = banners.find(b => b.id === selectedId);
    if (initial) setPristineSnapshot(initial);
  }

  render();

  return {
    destroy() {
      Object.values(previewObjectUrls).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
