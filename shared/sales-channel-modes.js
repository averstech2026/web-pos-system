/** @typedef {'everywhere'|'web'|'kiosk'|'pos'|'hidden'} SalesChannelMode */

export const SALES_POINT_MODES = [
  { id: 'everywhere', label: 'Везде' },
  { id: 'kiosk', label: 'Киоск' },
  { id: 'web', label: 'Веб' },
  { id: 'pos', label: 'Касса' },
  { id: 'hidden', label: 'Нигде' },
];

/**
 * @param {boolean|undefined} visibleInWeb
 * @param {boolean|undefined} visibleInKiosk
 * @param {boolean|undefined} visibleInPos
 * @returns {SalesChannelMode}
 */
export function resolveSalesChannelMode(visibleInWeb, visibleInKiosk, visibleInPos) {
  const web = visibleInWeb !== false;
  const kiosk = visibleInKiosk === true;
  const pos = visibleInPos === true;

  if (!web && !kiosk && !pos) return 'hidden';
  if (web && kiosk && pos) return 'everywhere';
  if (web && !kiosk && !pos) return 'web';
  if (!web && kiosk && !pos) return 'kiosk';
  if (!web && !kiosk && pos) return 'pos';
  if (web && kiosk && !pos) return 'everywhere';
  if (!web && kiosk && pos) return 'kiosk';
  return 'everywhere';
}

/** @param {SalesChannelMode|string} mode */
export function salesChannelFlagsFromMode(mode) {
  switch (mode) {
    case 'everywhere':
      return { visibleInWeb: true, visibleInKiosk: true, visibleInPos: true, isAvailable: true };
    case 'web':
      return { visibleInWeb: true, visibleInKiosk: false, visibleInPos: false, isAvailable: true };
    case 'kiosk':
      return { visibleInWeb: false, visibleInKiosk: true, visibleInPos: false, isAvailable: true };
    case 'pos':
      return { visibleInWeb: false, visibleInKiosk: false, visibleInPos: true, isAvailable: true };
    case 'hidden':
      return { visibleInWeb: false, visibleInKiosk: false, visibleInPos: false, isAvailable: false };
    default:
      return { visibleInWeb: true, visibleInKiosk: false, visibleInPos: false, isAvailable: true };
  }
}

/**
 * @param {boolean|undefined} visibleInWeb
 * @param {boolean|undefined} visibleInKiosk
 * @param {boolean|undefined} visibleInPos
 */
export function isVisibleOnAnySalesChannel(visibleInWeb, visibleInKiosk, visibleInPos) {
  return visibleInWeb !== false || visibleInKiosk === true || visibleInPos === true;
}
