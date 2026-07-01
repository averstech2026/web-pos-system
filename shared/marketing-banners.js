/**
 * Marketing banners (collection: marketing_banners).
 * Stories + hero promos for the client personal account.
 */

import { isAvailableByRule, rulesToMap } from './availability-rules.js';

/** @typedef {import('./marketing-banners.d.ts').MarketingBannerPlacement} MarketingBannerPlacement */
/** @typedef {import('./marketing-banners.d.ts').MarketingLocationMode} MarketingLocationMode */
/** @typedef {import('./marketing-banners.d.ts').MarketingAudienceMode} MarketingAudienceMode */
/** @typedef {import('./marketing-banners.d.ts').MarketingBanner} MarketingBanner */
/** @typedef {import('./marketing-banners.d.ts').MarketingBannerFilterContext} MarketingBannerFilterContext */

export const MARKETING_DEFAULT_LOCATION_ID = '__default__';

export const MARKETING_FORMAT_OPTIONS = [
  { id: 'square', label: 'Квадратный (Stories)' },
  { id: 'wide', label: 'Широкоформатный горизонтальный' },
];

export const MARKETING_SQUARE_PLACEMENT_OPTIONS = [
  { id: 'story', label: 'Только в ленте «Историй»' },
];

export const MARKETING_WIDE_PLACEMENT_OPTIONS = [
  { id: 'hero', label: 'Только главный баннер' },
  { id: 'promo_horizontal', label: 'Горизонтальный промо-баннер' },
];

/** @deprecated Legacy list — use format-specific options in the editor */
export const MARKETING_PLACEMENT_OPTIONS = [
  ...MARKETING_SQUARE_PLACEMENT_OPTIONS,
  ...MARKETING_WIDE_PLACEMENT_OPTIONS,
  { id: 'card', label: 'Горизонтальная промо-карточка' },
  { id: 'both', label: 'Истории и главный баннер' },
];

export const MARKETING_CLICK_ACTION_OPTIONS = [
  { id: 'fullscreen_image', label: 'Открыть полноформатное изображение (1920×1080)' },
  { id: 'url', label: 'Перейти по ссылке (URL)' },
];

export const MARKETING_STORY_SORT_HINT =
  'Определяет позицию в карусели историй (1, 2, 3…). На клиенте истории выстраиваются друг за другом и автоматически скроллируются в горизонтальную карусель при нехватке ширины экрана.';

export const MARKETING_DEVICE_OPTIONS = [
  { id: 'lk', label: 'Личный кабинет' },
  { id: 'kiosk', label: 'Киоск самообслуживания' },
];

/** Channel visibility modes (aligned with products / category groups) */
export const MARKETING_CHANNEL_MODES = [
  { id: 'everywhere', label: 'Везде' },
  { id: 'web_only', label: 'Только Веб' },
  { id: 'kiosk_only', label: 'Только Киоск' },
  { id: 'hidden', label: 'Скрыт' },
];

export const MARKETING_BACKGROUND_COLORS = [
  { id: '#7cb9bc', label: 'Бирюзовый' },
  { id: '#f5d565', label: 'Жёлтый' },
  { id: '#f4a9b8', label: 'Розовый' },
  { id: '#94a3b8', label: 'Серый' },
];

/** @type {readonly string[]} */
export const MARKETING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

export const MARKETING_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const MARKETING_BANNER_MAX_BYTES = 5 * 1024 * 1024;
export const MARKETING_FULLSCREEN_MAX_BYTES = 8 * 1024 * 1024;

export const MARKETING_THUMBNAIL_SPEC_HINT =
  'Формат: JPG, PNG. Макс. размер: 2 МБ. Соотношение сторон: 1:1 (Рекомендуется 1024×1024 px).';

export const MARKETING_BANNER_SPEC_HINT =
  'Формат: JPG, PNG. Макс. размер: 5 МБ. Соотношение сторон: 4:1 (Рекомендуется 1920×480 px).';

export const MARKETING_FULLSCREEN_SPEC_HINT =
  'Формат: JPG, PNG. Макс. размер: 8 МБ. Рекомендуемое разрешение: 1920×1080 px (или пропорции 16:9). Эта картинка откроется на весь экран в личном кабинете или на киоске при клике на баннер.';

export const MARKETING_ACCENT_COLORS = [
  { id: '#22c55e', label: 'Зелёный' },
  { id: '#eab308', label: 'Жёлтый' },
  { id: '#3b82f6', label: 'Синий' },
  { id: '#f97316', label: 'Оранжевый' },
  { id: '#a855f7', label: 'Фиолетовый' },
  { id: '#ef4444', label: 'Красный' },
];

const PLACEMENTS = MARKETING_PLACEMENT_OPTIONS.map(o => o.id);
const FORMATS = MARKETING_FORMAT_OPTIONS.map(o => o.id);
const CLICK_ACTIONS = MARKETING_CLICK_ACTION_OPTIONS.map(o => o.id);
const TITLE_MAX = 40;

/** @param {MarketingBannerPlacement} [placement] */
export function inferBannerFormat(placement) {
  if (placement === 'hero' || placement === 'promo_horizontal') return 'wide';
  if (placement === 'story' || placement === 'card') return 'square';
  return 'square';
}

/** @param {Partial<MarketingBanner>} banner */
export function sanitizeBannerForFormat(banner) {
  const format = FORMATS.includes(banner?.bannerFormat)
    ? banner.bannerFormat
    : inferBannerFormat(banner?.placement);

  if (format === 'square') {
    return {
      ...banner,
      bannerFormat: 'square',
      placement: 'story',
      bannerUrl: null,
    };
  }

  const placement = banner?.placement === 'promo_horizontal' ? 'promo_horizontal' : 'hero';
  return {
    ...banner,
    bannerFormat: 'wide',
    placement,
    thumbnailUrl: null,
    accentColor: banner?.accentColor || MARKETING_ACCENT_COLORS[0].id,
  };
}

/** @param {string|null|undefined} url */
export function isValidMarketingClickUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** @param {MarketingBannerPlacement} placement */
export function placementNeedsThumbnail(placement) {
  return placement === 'story' || placement === 'both' || placement === 'card';
}

/** @param {MarketingBannerPlacement} placement */
export function placementNeedsBanner(placement) {
  return placement === 'hero' || placement === 'both' || placement === 'promo_horizontal';
}

/** @param {MarketingBannerPlacement} placement */
export function isPromoHorizontalPlacement(placement) {
  return placement === 'promo_horizontal';
}

/**
 * @param {File} file
 * @param {'thumbnail'|'banner'|'fullscreen'} kind
 */
export function validateMarketingImageFile(file, kind) {
  if (!file) throw new Error('Файл не выбран');

  const type = (file.type || '').toLowerCase();
  if (!MARKETING_IMAGE_TYPES.includes(type)) {
    throw new Error('Допустимы только изображения JPG и PNG');
  }

  const limits = {
    thumbnail: { bytes: MARKETING_THUMBNAIL_MAX_BYTES, label: '2 МБ' },
    banner: { bytes: MARKETING_BANNER_MAX_BYTES, label: '5 МБ' },
    fullscreen: { bytes: MARKETING_FULLSCREEN_MAX_BYTES, label: '8 МБ' },
  };
  const { bytes: maxBytes, label: maxLabel } = limits[kind] || limits.banner;
  if (file.size > maxBytes) {
    throw new Error(`Размер файла не должен превышать ${maxLabel}`);
  }
}

/** @returns {MarketingBanner} */
export function createDefaultMarketingBanner(id = '') {
  return {
    id: id || `banner-${Date.now()}`,
    bannerFormat: 'square',
    title: 'Новый баннер (черновик)',
    shortDescription: '',
    fullDescription: '',
    thumbnailUrl: null,
    bannerUrl: null,
    isActive: false,
    placement: 'story',
    targetDevices: ['lk', 'kiosk'],
    visibleInWeb: true,
    visibleInKiosk: true,
    locationMode: 'all',
    locationIds: [],
    audienceMode: 'all',
    targetUserGroupIds: [],
    scheduleId: null,
    campaignDateStart: null,
    campaignDateEnd: null,
    sortOrder: 1,
    accentColor: MARKETING_ACCENT_COLORS[0].id,
    backgroundColor: MARKETING_BACKGROUND_COLORS[0].id,
    badgeText: null,
    clickAction: 'fullscreen_image',
    clickUrl: null,
    fullscreenImageUrl: null,
  };
}

/** @param {string|null|undefined} raw */
function normalizeDeviceList(raw) {
  if (raw == null) return ['lk', 'kiosk'];
  if (!Array.isArray(raw)) return ['lk', 'kiosk'];
  const allowed = new Set(MARKETING_DEVICE_OPTIONS.map(o => o.id));
  return [...new Set(raw.map(v => String(v || '').trim()).filter(v => allowed.has(v)))];
}

/** @param {boolean} visibleInWeb @param {boolean} visibleInKiosk */
export function targetDevicesFromChannelFlags(visibleInWeb, visibleInKiosk) {
  const devices = [];
  if (visibleInWeb !== false) devices.push('lk');
  if (visibleInKiosk === true) devices.push('kiosk');
  return devices;
}

/** @param {string[]|null|undefined} targetDevices */
export function channelFlagsFromTargetDevices(targetDevices) {
  const devices = normalizeDeviceList(targetDevices);
  return {
    visibleInWeb: devices.includes('lk'),
    visibleInKiosk: devices.includes('kiosk'),
  };
}

/** @param {boolean} [visibleInWeb] @param {boolean} [visibleInKiosk] */
export function resolveMarketingChannelMode(visibleInWeb, visibleInKiosk) {
  const web = visibleInWeb !== false;
  const kiosk = visibleInKiosk === true;
  if (web && kiosk) return 'everywhere';
  if (web && !kiosk) return 'web_only';
  if (!web && kiosk) return 'kiosk_only';
  return 'hidden';
}

/** @param {string} mode */
export function marketingChannelFlagsFromMode(mode) {
  switch (mode) {
    case 'everywhere':
      return { visibleInWeb: true, visibleInKiosk: true };
    case 'web_only':
      return { visibleInWeb: true, visibleInKiosk: false };
    case 'kiosk_only':
      return { visibleInWeb: false, visibleInKiosk: true };
    case 'hidden':
      return { visibleInWeb: false, visibleInKiosk: false };
    default:
      return { visibleInWeb: true, visibleInKiosk: false };
  }
}

/** @param {string|null|undefined} raw */
function normalizeIdList(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(v => String(v || '').trim()).filter(Boolean))];
}

/** @param {string|null|undefined} url */
export function sanitizePersistedImageUrl(url) {
  const raw = url ? String(url).trim() : '';
  if (!raw) return null;
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return null;
  return raw;
}

/** @param {Partial<MarketingBanner>|null|undefined} raw @param {string} [docId] */
export function normalizeMarketingBanner(raw, docId = '') {
  const id = String(raw?.id || docId || '').trim();
  const placement = PLACEMENTS.includes(raw?.placement) ? raw.placement : 'story';
  const bannerFormat = FORMATS.includes(raw?.bannerFormat)
    ? raw.bannerFormat
    : inferBannerFormat(placement);
  const clickAction = CLICK_ACTIONS.includes(raw?.clickAction) ? raw.clickAction : 'fullscreen_image';

  let visibleInWeb;
  let visibleInKiosk;
  if (raw?.visibleInWeb !== undefined || raw?.visibleInKiosk !== undefined) {
    visibleInWeb = raw?.visibleInWeb !== false;
    visibleInKiosk = raw?.visibleInKiosk === true;
  } else {
    const flags = channelFlagsFromTargetDevices(raw?.targetDevices);
    visibleInWeb = flags.visibleInWeb;
    visibleInKiosk = flags.visibleInKiosk;
  }
  const targetDevices = targetDevicesFromChannelFlags(visibleInWeb, visibleInKiosk);
  const isActive = (raw?.visibleInWeb !== undefined || raw?.visibleInKiosk !== undefined)
    ? (visibleInWeb || visibleInKiosk)
    : raw?.isActive === true;

  return sanitizeBannerForFormat({
    id,
    bannerFormat,
    title: String(raw?.title || '').trim().slice(0, TITLE_MAX) || 'Без названия',
    shortDescription: String(raw?.shortDescription || '').trim(),
    fullDescription: String(raw?.fullDescription || '').trim(),
    thumbnailUrl: sanitizePersistedImageUrl(raw?.thumbnailUrl),
    bannerUrl: sanitizePersistedImageUrl(raw?.bannerUrl),
    isActive,
    placement,
    targetDevices,
    visibleInWeb,
    visibleInKiosk,
    locationMode: raw?.locationMode === 'specific' ? 'specific' : 'all',
    locationIds: normalizeIdList(raw?.locationIds),
    audienceMode: raw?.audienceMode === 'groups' ? 'groups' : 'all',
    targetUserGroupIds: normalizeIdList(raw?.targetUserGroupIds),
    scheduleId: raw?.scheduleId ? String(raw.scheduleId).trim() : null,
    campaignDateStart: raw?.campaignDateStart || null,
    campaignDateEnd: raw?.campaignDateEnd || null,
    sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Number(raw.sortOrder) : 0,
    accentColor: raw?.accentColor ? String(raw.accentColor).trim() : MARKETING_ACCENT_COLORS[0].id,
    backgroundColor: raw?.backgroundColor
      ? String(raw.backgroundColor).trim()
      : MARKETING_BACKGROUND_COLORS[0].id,
    badgeText: raw?.badgeText ? String(raw.badgeText).trim() : null,
    clickAction,
    clickUrl: raw?.clickUrl ? String(raw.clickUrl).trim() : null,
    fullscreenImageUrl: sanitizePersistedImageUrl(raw?.fullscreenImageUrl),
  });
}

/** @param {string} dateStr @param {string|null} start @param {string|null} end */
function isWithinCampaignDates(dateStr, start, end) {
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

/**
 * Whether a banner passes schedule + campaign date filters at the given moment.
 *
 * @param {Partial<MarketingBanner>} banner
 * @param {MarketingBannerFilterContext} [ctx]
 */
export function isMarketingBannerActiveNow(banner, ctx = {}) {
  if (!banner?.isActive) return false;

  const slot = ctx.slot || {};
  const dateStr = slot.date || new Date().toISOString().slice(0, 10);

  if (!isWithinCampaignDates(dateStr, banner.campaignDateStart, banner.campaignDateEnd)) {
    return false;
  }

  if (banner.scheduleId) {
    const rulesMap = rulesToMap(ctx.allRules || []);
    const schedule = rulesMap.get(banner.scheduleId);
    if (schedule && !isAvailableByRule(schedule, slot)) return false;
  }

  return true;
}

/**
 * @param {Partial<MarketingBanner>} banner
 * @param {MarketingBannerFilterContext} [ctx]
 */
export function matchesMarketingLocation(banner, ctx = {}) {
  if (banner?.locationMode !== 'specific') return true;
  const locationId = ctx.currentLocationId || MARKETING_DEFAULT_LOCATION_ID;
  const allowed = normalizeIdList(banner.locationIds);
  if (!allowed.length) return true;
  return allowed.includes(locationId);
}

/**
 * @param {Partial<MarketingBanner>} banner
 * @param {MarketingBannerFilterContext} [ctx]
 */
export function matchesMarketingDevice(banner, ctx = {}) {
  const n = normalizeMarketingBanner(banner, banner?.id);
  if (ctx.device === 'kiosk') return n.visibleInKiosk === true;
  return n.visibleInWeb !== false;
}

/**
 * @param {Partial<MarketingBanner>} banner
 * @param {MarketingBannerFilterContext} [ctx]
 */
export function matchesMarketingAudience(banner, ctx = {}) {
  if (banner?.audienceMode !== 'groups') return true;
  const groups = normalizeIdList(banner.targetUserGroupIds);
  if (!groups.length) return true;
  const userGroupId = ctx.userGroupId || '';
  return groups.includes(userGroupId);
}

/**
 * Full client-side visibility check for a single banner.
 *
 * @param {Partial<MarketingBanner>} banner
 * @param {MarketingBannerFilterContext} [ctx]
 */
export function isMarketingBannerVisible(banner, ctx = {}) {
  return isMarketingBannerActiveNow(banner, ctx)
    && matchesMarketingLocation(banner, ctx)
    && matchesMarketingAudience(banner, ctx)
    && matchesMarketingDevice(banner, ctx);
}

/**
 * @param {Partial<MarketingBanner>[]} banners
 * @param {MarketingBannerFilterContext} [ctx]
 * @returns {MarketingBanner[]}
 */
export function filterMarketingBannersForUser(banners, ctx = {}) {
  return (banners || [])
    .map(b => normalizeMarketingBanner(b, b.id))
    .filter(b => isMarketingBannerVisible(b, ctx))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'));
}

/** @param {Partial<MarketingBanner>} banner */
export function isMarketingBannerHidden(banner) {
  const n = normalizeMarketingBanner(banner, banner?.id);
  if (!n.isActive) return true;
  return resolveMarketingChannelMode(n.visibleInWeb, n.visibleInKiosk) === 'hidden';
}

/** @param {Partial<MarketingBanner>} banner */
export function formatMarketingBannerSummary(banner) {
  const parts = [];
  if (banner.bannerFormat === 'square' || banner.placement === 'story') {
    const idx = Number.isFinite(Number(banner.sortOrder)) && banner.sortOrder >= 1
      ? banner.sortOrder
      : 1;
    parts.push(`[Stories #${idx}]`);
  } else if (banner.placement === 'promo_horizontal') {
    parts.push('Промо-баннер');
  } else if (banner.placement === 'hero') {
    parts.push('Главный баннер');
  } else if (banner.placement === 'card') {
    parts.push('Промо-карточка');
  } else {
    parts.push('Истории + баннер');
  }
  return parts.join(' · ') || 'Баннер';
}

/** @param {Partial<MarketingBanner>} banner */
export function formatMarketingBannerScheduleHint(banner) {
  if (banner.scheduleId) return '⏱ По расписанию';
  const start = banner.campaignDateStart;
  const end = banner.campaignDateEnd;
  if (start || end) {
    const fmt = (/** @type {string|null|undefined} */ iso) => {
      if (!iso) return '…';
      const p = iso.split('-');
      return p.length === 3 ? `${p[2]}.${p[1]}` : iso;
    };
    return `⏱ ${fmt(start)} - ${fmt(end)}`;
  }
  return '⏱ Всегда';
}

/** @param {Partial<MarketingBanner>} banner */
export function validateMarketingBanner(banner) {
  const normalized = sanitizeBannerForFormat(normalizeMarketingBanner(banner, banner.id));

  if (!normalized.title.trim()) {
    throw new Error('Укажите заголовок акции');
  }
  if (normalized.title.length > TITLE_MAX) {
    throw new Error(`Заголовок не длиннее ${TITLE_MAX} символов`);
  }
  if (!normalized.shortDescription.trim()) {
    throw new Error('Укажите короткое описание');
  }
  if (!normalized.fullDescription.trim()) {
    throw new Error('Укажите полное описание');
  }
  if (normalized.bannerFormat === 'square') {
    if (!normalized.thumbnailUrl) {
      throw new Error('Загрузите миниатюру для ленты «Историй»');
    }
    if (!Number.isFinite(normalized.sortOrder) || normalized.sortOrder < 1) {
      throw new Error('Укажите порядок сортировки от 1 и выше');
    }
  } else if (!normalized.bannerUrl) {
    throw new Error('Загрузите широкоформатный баннер');
  }

  if (normalized.clickAction === 'url') {
    if (!isValidMarketingClickUrl(normalized.clickUrl)) {
      throw new Error('Укажите корректную ссылку (http:// или https://)');
    }
  } else if (!normalized.fullscreenImageUrl) {
    throw new Error('Загрузите полноформатное изображение для модального окна');
  }
  if (normalized.locationMode === 'specific' && !normalized.locationIds.length) {
    throw new Error('Выберите хотя бы одну локацию');
  }
  if (normalized.audienceMode === 'groups' && !normalized.targetUserGroupIds.length) {
    throw new Error('Выберите хотя бы одну группу клиентов');
  }
  if (normalized.campaignDateStart && normalized.campaignDateEnd
    && normalized.campaignDateStart > normalized.campaignDateEnd) {
    throw new Error('Дата начала не может быть позже даты окончания');
  }

  return normalized;
}

/** @param {Partial<MarketingBanner>} banner */
export function buildMarketingBannerPayload(banner) {
  const normalized = validateMarketingBanner(banner);
  return {
    bannerFormat: normalized.bannerFormat,
    title: normalized.title,
    shortDescription: normalized.shortDescription,
    fullDescription: normalized.fullDescription,
    thumbnailUrl: normalized.thumbnailUrl,
    bannerUrl: normalized.bannerUrl,
    isActive: normalized.isActive,
    placement: normalized.placement,
    targetDevices: normalized.targetDevices,
    visibleInWeb: normalized.visibleInWeb,
    visibleInKiosk: normalized.visibleInKiosk,
    locationMode: normalized.locationMode,
    locationIds: normalized.locationIds,
    audienceMode: normalized.audienceMode,
    targetUserGroupIds: normalized.targetUserGroupIds,
    scheduleId: normalized.scheduleId,
    campaignDateStart: normalized.campaignDateStart,
    campaignDateEnd: normalized.campaignDateEnd,
    sortOrder: normalized.sortOrder,
    accentColor: normalized.accentColor,
    backgroundColor: normalized.backgroundColor,
    badgeText: normalized.badgeText,
    clickAction: normalized.clickAction,
    clickUrl: normalized.clickAction === 'url' ? normalized.clickUrl : null,
    fullscreenImageUrl: normalized.clickAction === 'fullscreen_image'
      ? normalized.fullscreenImageUrl
      : null,
  };
}

/**
 * Renders subtitle with optional `{badge}` placeholder for horizontal promo.
 * @param {string} shortDescription
 * @param {string|null|undefined} badgeText
 */
export function renderPromoSubtitleHtml(shortDescription, badgeText) {
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const desc = String(shortDescription || '');
  const badge = String(badgeText || '').trim();
  if (!badge) return esc(desc);

  const token = '{badge}';
  if (desc.includes(token)) {
    const [before = '', after = ''] = desc.split(token);
    return `${esc(before)}<span class="mkt-promo-badge">${esc(badge)}</span>${esc(after)}`;
  }
  return `${esc(desc)} <span class="mkt-promo-badge">${esc(badge)}</span>`;
}

/**
 * Read preferred dining location from localStorage (LK).
 * @returns {string}
 */
export function getStoredLocationId() {
  try {
    const stored = localStorage.getItem('lk_preferred_location');
    return stored || MARKETING_DEFAULT_LOCATION_ID;
  } catch {
    return MARKETING_DEFAULT_LOCATION_ID;
  }
}

/** @param {string} locationId */
export function setStoredLocationId(locationId) {
  try {
    localStorage.setItem('lk_preferred_location', locationId || MARKETING_DEFAULT_LOCATION_ID);
  } catch { /* ignore */ }
}
