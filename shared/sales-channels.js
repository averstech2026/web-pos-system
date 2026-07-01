import { ORDER_SOURCE } from './schema.js';

/** @type {Record<string, string>} */
export const SALES_CHANNEL_STATUS = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
};

/** Fixed sales channel ids — align with ORDER_SOURCE */
export const SALES_CHANNEL_IDS = {
  KIOSK: ORDER_SOURCE.KIOSK,
  WEB: ORDER_SOURCE.WEB,
};

/** @type {Array<{ id: string, name: string, shortName: string }>} */
export const DEFAULT_SALES_CHANNELS = [
  {
    id: SALES_CHANNEL_IDS.KIOSK,
    name: 'Информационный киоск',
    shortName: 'Киоск',
  },
  {
    id: SALES_CHANNEL_IDS.WEB,
    name: 'Веб-витрина (Сайт/Приложение)',
    shortName: 'Веб-витрина',
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
  const status = raw.status === SALES_CHANNEL_STATUS.HIDDEN
    ? SALES_CHANNEL_STATUS.HIDDEN
    : SALES_CHANNEL_STATUS.ACTIVE;
  const name = String(raw.name ?? '').trim() || def?.name || raw.id || 'Канал';
  const scheduleId = raw.scheduleId ? String(raw.scheduleId).trim() : null;
  const maintenanceMessage = String(raw.maintenanceMessage ?? '').trim();

  return {
    id: raw.id || fallbackId,
    name,
    shortName: String(raw.shortName ?? '').trim() || def?.shortName || name,
    status,
    sendToKitchen: raw.sendToKitchen !== false,
    sendToDelivery: raw.sendToDelivery !== false,
    scheduleId: scheduleId || null,
    maintenanceMessage,
  };
}

/** @param {{ maintenanceMessage?: string }} channel */
export function resolveMaintenanceMessage(channel) {
  return String(channel?.maintenanceMessage ?? '').trim() || DEFAULT_MAINTENANCE_MESSAGE;
}

/** Plain object for Firestore — always includes editable fields. */
export function toPersistedSalesChannel(raw, fallbackId = '') {
  const n = normalizeSalesChannel(raw, fallbackId);
  return {
    id: n.id,
    name: n.name,
    shortName: n.shortName,
    status: n.status,
    sendToKitchen: n.sendToKitchen,
    sendToDelivery: n.sendToDelivery,
    scheduleId: n.scheduleId,
    maintenanceMessage: n.maintenanceMessage,
  };
}

/** @returns {import('./sales-channels.d.ts').SalesChannel[]} */
export function createDefaultSalesChannels() {
  return DEFAULT_SALES_CHANNELS.map(def => normalizeSalesChannel({
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    status: SALES_CHANNEL_STATUS.ACTIVE,
    sendToKitchen: true,
    sendToDelivery: true,
    scheduleId: null,
    maintenanceMessage: '',
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
