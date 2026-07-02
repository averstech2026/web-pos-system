import { totalWalletBalance } from './schema.js';
import { buildWalletsForAllowedIds } from './wallets.js';

export { buildWalletsForAllowedIds } from './wallets.js';

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
  return totalWalletBalance(wallets, { spendableOnly: true });
}
