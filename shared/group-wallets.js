import {
  DEFAULT_WALLET_DEFS,
  normalizeWalletAllowedCategories,
  totalWalletBalance,
} from './schema.js';

/** Wallet IDs used when a group has no explicit selection (backward compatible). */
export const DEFAULT_GROUP_WALLET_IDS = ['personal', 'dotation'];

/**
 * @param {{ allowedWalletIds?: string[] }|null|undefined} group
 * @returns {string[]}
 */
export function resolveGroupAllowedWalletIds(group) {
  const ids = group?.allowedWalletIds;
  if (Array.isArray(ids) && ids.length) return [...ids];
  return [...DEFAULT_GROUP_WALLET_IDS];
}

/**
 * @param {object} group
 * @returns {string[]}
 */
export function normalizeGroupAllowedWalletIds(group = {}) {
  if (Array.isArray(group.allowedWalletIds)) return [...group.allowedWalletIds];
  return [...DEFAULT_GROUP_WALLET_IDS];
}

/**
 * Build user wallets limited to the group's allowed wallet IDs.
 * Preserves existing balances; initializes missing wallets from the catalog.
 *
 * @param {Record<string, object>|null|undefined} currentWallets
 * @param {string[]} allowedWalletIds
 * @param {Map<string, { id?: string, name?: string, allowedCategories?: string[] }>} catalogById
 * @returns {Record<string, { balance: number, name: string, allowedCategories: string[] }>}
 */
export function buildWalletsForAllowedIds(currentWallets, allowedWalletIds, catalogById) {
  const current = currentWallets && typeof currentWallets === 'object' ? currentWallets : {};
  /** @type {Record<string, { balance: number, name: string, allowedCategories: string[] }>} */
  const result = {};

  for (const walletId of allowedWalletIds) {
    const existing = current[walletId];
    const catalog = catalogById.get(walletId);
    const defaultName = DEFAULT_WALLET_DEFS[walletId]?.name || walletId;

    result[walletId] = {
      name: existing?.name || catalog?.name || defaultName,
      balance: Number(existing?.balance) || 0,
      allowedCategories: normalizeWalletAllowedCategories(existing ?? catalog ?? {}),
    };
  }

  return result;
}

/**
 * @param {Record<string, object>|null|undefined} currentWallets
 * @param {{ allowedWalletIds?: string[] }|null|undefined} group
 * @param {Array<{ id: string, name?: string, allowedCategories?: string[] }>} walletCatalog
 */
export function buildUserWalletsFromGroup(currentWallets, group, walletCatalog) {
  const catalogById = new Map(walletCatalog.map(w => [w.id, w]));
  const allowedWalletIds = resolveGroupAllowedWalletIds(group);
  return buildWalletsForAllowedIds(currentWallets, allowedWalletIds, catalogById);
}

/**
 * @param {Record<string, { balance?: number }>} wallets
 */
export function totalBalanceFromWallets(wallets) {
  return totalWalletBalance(wallets);
}
