/** @typedef {Record<string, boolean>} LogoInvertSlots */

/** @type {{ id: string; label: string; location: string; defaultEnabled: boolean }[]} */
export const LOGO_INVERT_SLOT_META = [
  { id: 'adminSidebar', label: 'Админка', location: 'Боковое меню (тёмный sidebar)', defaultEnabled: true },
  { id: 'adminAuth', label: 'Админка', location: 'Экран входа', defaultEnabled: false },
  { id: 'clientLkHeader', label: 'Личный кабинет', location: 'Шапка главной и разделов', defaultEnabled: false },
  { id: 'clientLkAuth', label: 'Личный кабинет', location: 'Экран входа', defaultEnabled: false },
  { id: 'kitchenHeader', label: 'Кухня', location: 'Шапка терминала', defaultEnabled: false },
  { id: 'deliveryHeader', label: 'Терминал выдачи', location: 'Шапка терминала', defaultEnabled: false },
  { id: 'queueHeader', label: 'Табло очереди', location: 'Шапка табло', defaultEnabled: false },
  { id: 'validatorHeader', label: 'Валидатор', location: 'Шапка рабочего экрана', defaultEnabled: false },
  { id: 'validatorIdle', label: 'Валидатор', location: 'Idle-экран «Приложите пропуск»', defaultEnabled: false },
  { id: 'cashierHeader', label: 'Касса', location: 'Шапка модуля', defaultEnabled: false },
  { id: 'kioskWelcome', label: 'Киоск', location: 'Экран приветствия', defaultEnabled: false },
  { id: 'kioskHeader', label: 'Киоск', location: 'Фиксированный логотип на экранах меню', defaultEnabled: false },
];

/** @type {LogoInvertSlots} */
export const DEFAULT_LOGO_INVERT = Object.fromEntries(
  LOGO_INVERT_SLOT_META.map(slot => [slot.id, slot.defaultEnabled]),
);

/** @param {Partial<LogoInvertSlots> | null | undefined} value @returns {LogoInvertSlots} */
export function normalizeLogoInvertSlots(value) {
  /** @type {LogoInvertSlots} */
  const base = { ...DEFAULT_LOGO_INVERT };
  if (!value || typeof value !== 'object') return base;

  for (const slot of LOGO_INVERT_SLOT_META) {
    if (typeof value[slot.id] === 'boolean') base[slot.id] = value[slot.id];
  }
  return base;
}

/** @param {LogoInvertSlots} slots */
export function applyLogoInvertSlots(slots) {
  const root = document.documentElement;
  for (const slot of LOGO_INVERT_SLOT_META) {
    root.classList.toggle(`preset-logo-invert-${slot.id}`, Boolean(slots[slot.id]));
  }
}
