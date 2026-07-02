/**
 * Wallet catalog ↔ user instance helpers and payment eligibility checks.
 */

import { slugFromCategoryName } from './menu-catalog.js';
import { POS_PAYMENT_TYPE_IDS } from './pos-channel.js';
import {
  DEFAULT_WALLET_DEFS,
  normalizeWalletAllowedCategories,
  normalizeUserWallets,
  totalWalletBalance,
} from './schema.js';

/** POS / payment method id → wallet catalog id */
export const PAYMENT_METHOD_WALLET_IDS = {
  [POS_PAYMENT_TYPE_IDS.INTERNAL]: 'personal',
  [POS_PAYMENT_TYPE_IDS.DOTATION]: 'dotation',
  internal: 'personal',
  dotation: 'dotation',
};

/**
 * @param {string} methodId
 * @returns {string|null}
 */
export function walletIdFromPaymentMethod(methodId) {
  if (!methodId) return null;
  return PAYMENT_METHOD_WALLET_IDS[methodId] || null;
}

/**
 * @param {{ allowedUserGroups?: string[] }|null|undefined} wallet
 * @param {string|null|undefined} groupId
 */
export function isWalletCatalogAllowedForUserGroup(wallet, groupId) {
  const groups = wallet?.allowedUserGroups;
  if (!Array.isArray(groups) || !groups.length) return true;
  if (!groupId) return false;
  return groups.includes(groupId);
}

/**
 * @param {Array<{ id: string, allowedUserGroups?: string[] }>} walletCatalog
 * @param {string|null|undefined} groupId
 */
export function filterWalletCatalogForUserGroup(walletCatalog, groupId) {
  return (walletCatalog || []).filter(w => isWalletCatalogAllowedForUserGroup(w, groupId));
}

/** @param {object|null|undefined} wallet */
export function isUserWalletAvailable(wallet) {
  return wallet != null && wallet.available !== false;
}

/**
 * @param {Record<string, object>|null|undefined} wallets
 * @param {{ spendableOnly?: boolean, includeUnavailable?: boolean }} [opts]
 */
export function listUserWallets(wallets, opts = {}) {
  const { spendableOnly = false, includeUnavailable = true } = opts;
  const map = wallets && typeof wallets === 'object' ? wallets : {};
  return Object.entries(map)
    .map(([id, w]) => ({ id, ...w }))
    .filter(w => {
      if (spendableOnly && !isUserWalletAvailable(w)) return false;
      if (!includeUnavailable && !isUserWalletAvailable(w)) return false;
      return true;
    })
    .sort((a, b) => {
      const order = ['personal', 'dotation'];
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return (a.name || a.id).localeCompare(b.name || b.id, 'ru');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

/**
 * @param {Record<string, object>|null|undefined} wallets
 * @param {{ spendableOnly?: boolean }} [opts]
 */
export function sumWalletBalances(wallets, opts = {}) {
  const spendableOnly = opts.spendableOnly !== false;
  if (!spendableOnly) return totalWalletBalance(wallets, { spendableOnly: false });
  return listUserWallets(wallets, { spendableOnly: true }).reduce(
    (s, w) => s + (Number(w.balance) || 0),
    0,
  );
}

/**
 * Map order line categories to catalog group ids.
 * @param {Array<{ category?: string, categoryId?: string, dishId?: string }>} items
 * @param {Array<{ id: string, name: string }>} [categoryGroups]
 * @param {Map<string, string>|Record<string, string>} [dishCategoryById]
 */
export function resolveOrderCategoryGroupIds(items, categoryGroups = [], dishCategoryById = null) {
  const namesToId = new Map((categoryGroups || []).map(g => [g.name, g.id]));
  const ids = new Set();

  for (const item of items || []) {
    let raw = item.categoryId || item.category || '';
    if (!raw && dishCategoryById && item.dishId) {
      raw = dishCategoryById instanceof Map
        ? dishCategoryById.get(item.dishId) || ''
        : dishCategoryById[item.dishId] || '';
    }
    if (!raw) continue;

    if (namesToId.has(raw)) {
      ids.add(namesToId.get(raw));
      continue;
    }
    if ((categoryGroups || []).some(g => g.id === raw)) {
      ids.add(raw);
      continue;
    }
    const slug = slugFromCategoryName(raw);
    if ((categoryGroups || []).some(g => g.id === slug)) {
      ids.add(slug);
    } else {
      ids.add(slug);
    }
  }

  return [...ids];
}

/** @param {object|null|undefined} wallet @param {string[]} categoryGroupIds */
export function walletCoversCategoryGroups(wallet, categoryGroupIds) {
  const allowed = normalizeWalletAllowedCategories(wallet);
  if (!allowed.length) return true;
  if (!categoryGroupIds.length) return true;
  return categoryGroupIds.every(id => allowed.includes(id));
}

/**
 * @param {object|null|undefined} wallet
 * @param {string[]} categoryGroupIds
 */
export function walletCategoryRestrictionLabel(wallet, categoryGroupIds = []) {
  const allowed = normalizeWalletAllowedCategories(wallet);
  if (!allowed.length) return 'Все категории';
  if (!categoryGroupIds.length) return `${allowed.length} кат.`;
  return walletCoversCategoryGroups(wallet, categoryGroupIds)
    ? `${allowed.length} кат.`
    : 'Недоступен для состава заказа';
}

/**
 * @param {object|null|undefined} wallet
 * @param {string[]} categoryGroupIds
 */
export function canSpendFromWallet(wallet, categoryGroupIds = []) {
  if (!wallet) return false;
  if (!isUserWalletAvailable(wallet)) return false;
  if ((Number(wallet.balance) || 0) <= 0) return false;
  return walletCoversCategoryGroups(wallet, categoryGroupIds);
}

/**
 * @param {Record<string, object>|null|undefined} wallets
 * @param {string[]} categoryGroupIds
 */
export function getSpendableWallets(wallets, categoryGroupIds = []) {
  return listUserWallets(wallets, { spendableOnly: false })
    .filter(w => canSpendFromWallet(w, categoryGroupIds));
}

/**
 * Pick wallet for payment: explicit id, or first spendable by priority.
 * @param {Record<string, object>|null|undefined} wallets
 * @param {object} [opts]
 * @param {string|null} [opts.walletId]
 * @param {string[]} [opts.categoryGroupIds]
 * @param {string[]} [opts.priority]
 */
export function resolvePaymentWallet(wallets, opts = {}) {
  const {
    walletId = null,
    categoryGroupIds = [],
    priority = ['personal', 'dotation'],
  } = opts;

  if (walletId) {
    const wallet = wallets?.[walletId];
    if (!canSpendFromWallet(wallet, categoryGroupIds)) {
      throw new Error('Выбранный кошелёк недоступен для оплаты');
    }
    return { walletId, wallet };
  }

  const spendable = getSpendableWallets(wallets, categoryGroupIds);
  if (!spendable.length) return null;

  for (const id of priority) {
    const hit = spendable.find(w => w.id === id);
    if (hit) return { walletId: hit.id, wallet: hit };
  }
  const first = spendable[0];
  return { walletId: first.id, wallet: first };
}

/**
 * Build catalog-backed wallet instance for a user.
 * @param {string} walletId
 * @param {object|null|undefined} existing
 * @param {object|null|undefined} catalog
 * @param {boolean} available
 */
export function buildUserWalletInstance(walletId, existing, catalog, available) {
  const defaultName = DEFAULT_WALLET_DEFS[walletId]?.name || walletId;
  return {
    name: catalog?.name || defaultName,
    balance: Number(existing?.balance) || 0,
    allowedCategories: normalizeWalletAllowedCategories(catalog ?? {}),
    available: available === true,
  };
}

/**
 * Merge group assignment with catalog; keep removed wallets as unavailable.
 * @param {Record<string, object>|null|undefined} currentWallets
 * @param {string[]} allowedWalletIds
 * @param {Map<string, object>} catalogById
 */
export function buildWalletsForAllowedIds(currentWallets, allowedWalletIds, catalogById) {
  const current = currentWallets && typeof currentWallets === 'object' ? currentWallets : {};
  const allowedSet = new Set(allowedWalletIds || []);
  const allIds = new Set([...allowedSet, ...Object.keys(current)]);

  /** @type {Record<string, { balance: number, name: string, allowedCategories: string[], available: boolean }>} */
  const result = {};

  for (const walletId of allIds) {
    const existing = current[walletId];
    const isAvailable = allowedSet.has(walletId);
    if (!isAvailable && !existing) continue;

    const catalog = catalogById.get(walletId);
    result[walletId] = buildUserWalletInstance(walletId, existing, catalog, isAvailable);
  }

  return result;
}

/**
 * Apply catalog metadata to all user wallets that reference a catalog id.
 * @param {Record<string, object>} wallets
 * @param {object} catalogEntry
 */
export function applyCatalogEntryToUserWallets(wallets, catalogEntry) {
  if (!wallets?.[catalogEntry.id]) return wallets;
  const existing = wallets[catalogEntry.id];
  return {
    ...wallets,
    [catalogEntry.id]: {
      ...existing,
      name: catalogEntry.name || existing.name,
      allowedCategories: normalizeWalletAllowedCategories(catalogEntry),
    },
  };
}

/**
 * @param {object} user
 * @param {string} walletId
 */
export function getUserWallet(user, walletId) {
  const wallets = normalizeUserWallets(user);
  return wallets[walletId] || null;
}

/**
 * @param {object} user
 * @param {string} walletId
 */
export function assertWalletSpendable(user, walletId) {
  const wallet = getUserWallet(user, walletId);
  if (!wallet) throw new Error('Кошелёк не найден');
  if (!isUserWalletAvailable(wallet)) throw new Error('Кошелёк недоступен');
  return wallet;
}
