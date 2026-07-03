import { fetchDiscountSettings } from '../../admin/services/discount-settings-data.js';
import {
  createDefaultDiscountSettings,
  formatCashierDiscountLabel,
  normalizeDiscountSettings,
} from '../../shared/discount-settings.js';
import { ROLES } from '../../shared/schema.js';

export { formatCashierDiscountLabel };

/** @param {object|null|undefined} cashier */
function resolveCashierRole(cashier) {
  if (!cashier) return ROLES.CASHIER;
  if (cashier.role && Object.values(ROLES).includes(cashier.role)) return cashier.role;
  const login = String(cashier.login || '').toLowerCase();
  if (login.includes('admin')) return ROLES.ADMIN;
  if (login.includes('manager')) return ROLES.MANAGER;
  return ROLES.CASHIER;
}

/**
 * @param {import('../../shared/discount-settings.js').CashierDiscountPreset} preset
 * @param {string} role
 */
function isPresetAllowedForRole(preset, role) {
  if (!preset.applyOnPos) return false;
  if (!preset.activeOnCashier) return false;
  if (preset.allowedRole === 'all') return true;
  return preset.allowedRole === role;
}

/**
 * Active cashier discount presets from admin settings.
 * @param {import('../../shared/discount-settings.js').DiscountSettingsDoc|null|undefined} discountSettings
 * @param {object|null|undefined} cashier
 */
export function resolvePosDiscountPresets(discountSettings, cashier) {
  const role = resolveCashierRole(cashier);
  const presets = discountSettings?.cashierPresets?.length
    ? discountSettings.cashierPresets
    : createDefaultDiscountSettings().cashierPresets;

  return presets
    .filter(preset => isPresetAllowedForRole(preset, role))
    .sort((a, b) => a.percent - b.percent);
}

/** @returns {import('../../shared/discount-settings.js').DiscountSettingsDoc} */
export function getDemoDiscountSettings() {
  return normalizeDiscountSettings(createDefaultDiscountSettings());
}

/** @returns {Promise<import('../../shared/discount-settings.js').DiscountSettingsDoc>} */
export async function loadPosDiscountSettings() {
  try {
    return await fetchDiscountSettings();
  } catch (err) {
    console.warn('[cashier-terminal] discount settings', err);
    return getDemoDiscountSettings();
  }
}
