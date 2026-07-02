import { ORDER_SOURCE } from './schema.js';
import {
  normalizePosChannelSettings,
  toPersistedPosChannelSettings,
} from './pos-channel.js';

/** @type {Record<string, string>} */
export const SALES_CHANNEL_STATUS = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
};

/** Fixed sales channel ids — align with ORDER_SOURCE where applicable */
export const SALES_CHANNEL_IDS = {
  KIOSK: ORDER_SOURCE.KIOSK,
  WEB: ORDER_SOURCE.WEB,
  POS: ORDER_SOURCE.POS,
  KITCHEN: 'kitchen',
  DELIVERY: 'delivery',
  QUEUE: 'queue',
  VALIDATOR: 'validator',
};

/** @typedef {'sales'|'internal'} SalesChannelKind */

export const SALES_CHANNEL_KIND = {
  SALES: 'sales',
  INTERNAL: 'internal',
};

/** User-facing channels with order routing */
export const SALES_POINT_CHANNEL_IDS = [
  SALES_CHANNEL_IDS.KIOSK,
  SALES_CHANNEL_IDS.VALIDATOR,
  SALES_CHANNEL_IDS.WEB,
  SALES_CHANNEL_IDS.POS,
];

/** Staff terminals — no sales, no order routing */
export const INTERNAL_CHANNEL_IDS = [
  SALES_CHANNEL_IDS.KITCHEN,
  SALES_CHANNEL_IDS.DELIVERY,
  SALES_CHANNEL_IDS.QUEUE,
];

/** @deprecated use INTERNAL_CHANNEL_IDS */
export const STAFF_TERMINAL_CHANNEL_IDS = INTERNAL_CHANNEL_IDS;

/** Row tag labels for internal interfaces */
export const INTERNAL_CHANNEL_ROW_LABELS = {
  [SALES_CHANNEL_IDS.KITCHEN]: 'Терминал кухни',
  [SALES_CHANNEL_IDS.DELIVERY]: 'Терминал выдачи',
  [SALES_CHANNEL_IDS.QUEUE]: 'Экран очереди',
};

/** @deprecated */
export const STAFF_TERMINAL_ROW_LABELS = INTERNAL_CHANNEL_ROW_LABELS;

/** List grouping in admin «Каналы продаж» */
export const SALES_CHANNEL_LIST_GROUPS = [
  {
    id: SALES_CHANNEL_KIND.SALES,
    label: 'Каналы продаж',
    hint: 'Интерфейс для клиента · маршрутизация заказов',
    channelIds: SALES_POINT_CHANNEL_IDS,
  },
  {
    id: SALES_CHANNEL_KIND.INTERNAL,
    label: 'Внутренние интерфейсы',
    hint: 'Терминалы персонала · без продаж',
    channelIds: INTERNAL_CHANNEL_IDS,
  },
];

/** @param {string} channelId @returns {SalesChannelKind} */
export function getSalesChannelKind(channelId) {
  return INTERNAL_CHANNEL_IDS.includes(channelId)
    ? SALES_CHANNEL_KIND.INTERNAL
    : SALES_CHANNEL_KIND.SALES;
}

/** @param {string} channelId */
export function isInternalChannel(channelId) {
  return INTERNAL_CHANNEL_IDS.includes(channelId);
}

/** @param {string} channelId */
export function isSalesPointChannel(channelId) {
  return SALES_POINT_CHANNEL_IDS.includes(channelId);
}

/** @param {string} channelId */
export function isStaffTerminalChannel(channelId) {
  return isInternalChannel(channelId);
}

/** Public GitHub Pages base for terminal launch links in admin */
export const SALES_CHANNEL_PUBLIC_BASE = 'https://averstech2026.github.io/web-pos-system';

/** Launch info shown in admin channel settings */
export const SALES_CHANNEL_TERMINAL_INFO = {
  [SALES_CHANNEL_IDS.KIOSK]: { slug: 'kiosk', label: 'Открыть киоск' },
  [SALES_CHANNEL_IDS.WEB]: { slug: 'client-lk', label: 'Открыть веб-витрину' },
  [SALES_CHANNEL_IDS.POS]: { slug: 'cashier-terminal', label: 'Открыть кассовый модуль' },
  [SALES_CHANNEL_IDS.KITCHEN]: { slug: 'kitchen-terminal', label: 'Открыть кухонный монитор' },
  [SALES_CHANNEL_IDS.DELIVERY]: { slug: 'delivery-terminal', label: 'Открыть монитор выдачи' },
  [SALES_CHANNEL_IDS.QUEUE]: { slug: 'queue-screen', label: 'Открыть экран очереди' },
  [SALES_CHANNEL_IDS.VALIDATOR]: { slug: 'validator-terminal', label: 'Открыть валидатор' },
};

/** @param {string} channelId */
export function getSalesChannelLaunchUrl(channelId) {
  const info = SALES_CHANNEL_TERMINAL_INFO[channelId];
  if (!info?.slug) return null;
  return `${SALES_CHANNEL_PUBLIC_BASE}/${info.slug}/`;
}

/** Default payment methods per sales channel (payment_methods ids) */
export const DEFAULT_SALES_CHANNEL_PAYMENT_METHODS = {
  [SALES_CHANNEL_IDS.KIOSK]: ['card', 'internal'],
  [SALES_CHANNEL_IDS.WEB]: ['card', 'internal'],
  [SALES_CHANNEL_IDS.VALIDATOR]: ['internal'],
  [SALES_CHANNEL_IDS.POS]: ['cash', 'card', 'internal', 'dotation'],
};

/** @param {object} raw @param {string} channelId */
export function normalizeAllowedPaymentMethods(raw, channelId) {
  if (!isSalesPointChannel(channelId)) return [];
  if (Array.isArray(raw?.allowedPaymentMethods)) {
    return [...new Set(raw.allowedPaymentMethods.map(String).filter(Boolean))];
  }
  return [...(DEFAULT_SALES_CHANNEL_PAYMENT_METHODS[channelId] || ['cash', 'card', 'internal'])];
}

/** @type {Array<{ id: string, name: string, shortName: string, sendToKitchen?: boolean, sendToDelivery?: boolean, allowedPaymentMethods?: string[] }>} */
export const DEFAULT_SALES_CHANNELS = [
  {
    id: SALES_CHANNEL_IDS.KIOSK,
    name: 'Информационный киоск',
    shortName: 'Киоск',
    allowedPaymentMethods: DEFAULT_SALES_CHANNEL_PAYMENT_METHODS[SALES_CHANNEL_IDS.KIOSK],
  },
  {
    id: SALES_CHANNEL_IDS.VALIDATOR,
    name: 'Терминал валидатора',
    shortName: 'Валидатор',
    allowedPaymentMethods: DEFAULT_SALES_CHANNEL_PAYMENT_METHODS[SALES_CHANNEL_IDS.VALIDATOR],
  },
  {
    id: SALES_CHANNEL_IDS.WEB,
    name: 'Веб-витрина (Сайт/Приложение)',
    shortName: 'Веб-витрина',
    allowedPaymentMethods: DEFAULT_SALES_CHANNEL_PAYMENT_METHODS[SALES_CHANNEL_IDS.WEB],
  },
  {
    id: SALES_CHANNEL_IDS.POS,
    name: 'Касса / Кассовый модуль',
    shortName: 'Касса',
    allowedPaymentMethods: DEFAULT_SALES_CHANNEL_PAYMENT_METHODS[SALES_CHANNEL_IDS.POS],
    operationMode: 'cashier',
    screenFormat: '1024x768',
    catalogDisplay: 'folders',
    showProductPhotos: false,
    showQueueNumber: false,
    posPaymentTypes: ['cash', 'card', 'internal', 'dotation'],
  },
  {
    id: SALES_CHANNEL_IDS.KITCHEN,
    name: 'Кухонный монитор',
    shortName: 'Кухня',
    sendToKitchen: true,
    sendToDelivery: false,
  },
  {
    id: SALES_CHANNEL_IDS.DELIVERY,
    name: 'Монитор выдачи',
    shortName: 'Выдача',
    sendToKitchen: false,
    sendToDelivery: true,
  },
  {
    id: SALES_CHANNEL_IDS.QUEUE,
    name: 'Экран очереди',
    shortName: 'Очередь',
    sendToKitchen: false,
    sendToDelivery: false,
  },
];

/** @type {Array<{ id: string, label: string }>} */
export const SALES_CHANNEL_STATUS_OPTIONS = [
  { id: SALES_CHANNEL_STATUS.ACTIVE, label: 'Активен' },
  { id: SALES_CHANNEL_STATUS.HIDDEN, label: 'Отключен' },
];

export const DEFAULT_MAINTENANCE_MESSAGE =
  'Приносим извинения за неудобства. Канал продаж временно приостановил работу. '
  + 'Заказы можно оформить на кассе или в других доступных сервисах.';

export const DEFAULT_MAINTENANCE_TITLE_OFFLINE = 'Сервис временно недоступен';
export const DEFAULT_MAINTENANCE_TITLE_SCHEDULE = 'Ведутся технические работы';

/** @typedef {'everywhere'|'kitchen'|'delivery'|'nowhere'} SalesChannelRoutingMode */

/** @type {Array<{ id: SalesChannelRoutingMode, label: string }>} */
export const SALES_CHANNEL_ROUTING_MODES = [
  { id: 'everywhere', label: 'Везде' },
  { id: 'kitchen', label: 'Кухонный монитор' },
  { id: 'delivery', label: 'Выдача' },
  { id: 'nowhere', label: 'Нигде' },
];

/** @param {boolean} [sendToKitchen] @param {boolean} [sendToDelivery] */
export function resolveSalesChannelRoutingMode(sendToKitchen, sendToDelivery) {
  const kitchen = sendToKitchen !== false;
  const delivery = sendToDelivery !== false;
  if (kitchen && delivery) return 'everywhere';
  if (kitchen && !delivery) return 'kitchen';
  if (!kitchen && delivery) return 'delivery';
  return 'nowhere';
}

/** @param {SalesChannelRoutingMode|string} mode */
export function routingFlagsFromMode(mode) {
  switch (mode) {
    case 'everywhere':
      return { sendToKitchen: true, sendToDelivery: true };
    case 'kitchen':
    case 'kiosk':
      return { sendToKitchen: true, sendToDelivery: false };
    case 'delivery':
    case 'web':
      return { sendToKitchen: false, sendToDelivery: true };
    case 'nowhere':
      return { sendToKitchen: false, sendToDelivery: false };
    default:
      return { sendToKitchen: true, sendToDelivery: true };
  }
}

/** @param {SalesChannelRoutingMode|string} mode */
export function salesChannelRoutingModeLabel(mode) {
  const normalized = mode === 'web' ? 'delivery' : mode === 'kiosk' ? 'kitchen' : mode;
  return SALES_CHANNEL_ROUTING_MODES.find(m => m.id === normalized)?.label || 'Везде';
}

/**
 * @param {object} raw
 * @param {string} [fallbackId]
 */
export function normalizeSalesChannel(raw, fallbackId = '') {
  const def = DEFAULT_SALES_CHANNELS.find(c => c.id === (raw.id || fallbackId));
  const channelId = raw.id || fallbackId;
  const status = raw.status === SALES_CHANNEL_STATUS.HIDDEN
    ? SALES_CHANNEL_STATUS.HIDDEN
    : SALES_CHANNEL_STATUS.ACTIVE;
  const name = String(raw.name ?? '').trim() || def?.name || channelId || 'Канал';
  const scheduleId = raw.scheduleId ? String(raw.scheduleId).trim() : null;
  const maintenanceMessage = String(raw.maintenanceMessage ?? '').trim();

  const isInternal = isInternalChannel(channelId);
  let sendToKitchen = isInternal && def?.sendToKitchen !== undefined
    ? def.sendToKitchen
    : raw.sendToKitchen !== false;
  let sendToDelivery = isInternal && def?.sendToDelivery !== undefined
    ? def.sendToDelivery
    : raw.sendToDelivery !== false;

  if (!isInternal && channelId !== SALES_CHANNEL_IDS.POS
    && sendToKitchen === false && sendToDelivery === false) {
    sendToKitchen = true;
    sendToDelivery = true;
  }

  const base = {
    id: channelId,
    name,
    shortName: String(raw.shortName ?? '').trim() || def?.shortName || name,
    status,
    sendToKitchen,
    sendToDelivery,
    scheduleId: scheduleId || null,
    maintenanceMessage,
    allowedPaymentMethods: normalizeAllowedPaymentMethods(raw, channelId),
  };

  if (channelId === SALES_CHANNEL_IDS.POS) {
    return { ...base, ...normalizePosChannelSettings(raw) };
  }

  return base;
}

/** @param {{ maintenanceMessage?: string }} channel */
export function resolveMaintenanceMessage(channel) {
  return String(channel?.maintenanceMessage ?? '').trim() || DEFAULT_MAINTENANCE_MESSAGE;
}

/** Plain object for Firestore — always includes editable fields. */
export function toPersistedSalesChannel(raw, fallbackId = '') {
  const n = normalizeSalesChannel(raw, fallbackId);
  const payload = {
    id: n.id,
    name: n.name,
    shortName: n.shortName,
    status: n.status,
    sendToKitchen: n.sendToKitchen,
    sendToDelivery: n.sendToDelivery,
    scheduleId: n.scheduleId,
    maintenanceMessage: n.maintenanceMessage,
  };
  if (isSalesPointChannel(n.id)) {
    payload.allowedPaymentMethods = n.allowedPaymentMethods;
  }
  if (n.id === SALES_CHANNEL_IDS.POS) {
    Object.assign(payload, toPersistedPosChannelSettings(n));
  }
  return payload;
}

/** @returns {import('./sales-channels.d.ts').SalesChannel[]} */
export function createDefaultSalesChannels() {
  return DEFAULT_SALES_CHANNELS.map(def => normalizeSalesChannel({
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    status: SALES_CHANNEL_STATUS.ACTIVE,
    sendToKitchen: def.sendToKitchen !== undefined ? def.sendToKitchen : true,
    sendToDelivery: def.sendToDelivery !== undefined ? def.sendToDelivery : true,
    scheduleId: null,
    maintenanceMessage: '',
    allowedPaymentMethods: def.allowedPaymentMethods,
  }));
}

/** @param {import('./sales-channels.d.ts').SalesChannel} channel */
export function salesChannelStatusLabel(channel) {
  if (channel.status === SALES_CHANNEL_STATUS.HIDDEN) return 'Отключен';
  return 'Активен';
}

/** @param {import('./sales-channels.d.ts').SalesChannel} channel */
export function salesChannelRoutingTags(channel) {
  const tags = [];
  const mode = resolveSalesChannelRoutingMode(channel.sendToKitchen, channel.sendToDelivery);
  if (mode !== 'everywhere') {
    tags.push(salesChannelRoutingModeLabel(mode));
  }
  if (channel.scheduleId) tags.push('По расписанию');
  return tags;
}

/** @param {import('./sales-channels.d.ts').SalesChannel} channel */
export function salesChannelListMeta(channel) {
  const parts = [salesChannelStatusLabel(channel)];
  const routing = salesChannelRoutingTags(channel);
  if (routing.length) parts.push(routing.join(' · '));
  return parts.join(' · ');
}
