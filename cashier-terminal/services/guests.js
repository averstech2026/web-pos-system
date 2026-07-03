import { fetchAllValidationRules } from '../../admin/services/validation-rules-data.js';
import { fetchUserGroups } from '../../admin/services/crm-ref-data.js';
import { fetchCrmUsers, filterCrmUsers } from '../../admin/services/users-data.js';
import { USER_STATUS, normalizeUserWallets } from '../../shared/schema.js';
import {
  canSpendFromWallet,
  isUserWalletAvailable,
  listUserWallets,
  sumWalletBalances,
} from '../../shared/wallets.js';
import { esc, escAttr, formatMoney } from '../core/format.js';

/** Demo clients for ?demo=1 (same shape as CRM users). */
export const DEMO_POS_CLIENTS = [
  {
    id: 'demo-vld-ivanov',
    name: 'Иванов Петр Сергеевич',
    qrCode: '048291',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'askona',
    balance: 5000,
    wallets: { dotation: { balance: 5000, name: 'Дотация', available: true } },
  },
  {
    id: 'demo-vld-petrov',
    name: 'Петров Алексей Иванович',
    qrCode: '048292',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'office_romashka',
    balance: 3200,
    wallets: { dotation: { balance: 150, name: 'Дотация', available: true } },
  },
  {
    id: 'demo-vld-sidorov',
    name: 'Сидоров Николай Петрович',
    qrCode: '048293',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'production',
    balance: 1100,
    wallets: { dotation: { balance: 100, name: 'Дотация', available: true } },
  },
];

export const DEMO_POS_GROUPS = {
  askona: 'Аскона',
  office_romashka: 'Офис Ромашка',
  production: 'Производство',
};

/**
 * Клиенты с активным правилом валидации для их группы (как в validator-terminal).
 * @param {object[]} users
 * @param {import('../../shared/validation-rules.js').ValidationRuleDoc[]} rules
 */
export function filterPosClients(users, rules) {
  const groupIdsWithRules = new Set(
    rules
      .filter(r => r.isActive && r.targetUserGroupIds?.length)
      .flatMap(r => r.targetUserGroupIds),
  );

  return users
    .filter(u =>
      u.status === USER_STATUS.ACTIVE
      && u.qrCode
      && u.userGroupId
      && groupIdsWithRules.has(u.userGroupId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} user @param {Map<string, string>|Record<string, string>} groupsById */
export function clientPickerCardParts(user, groupsById) {
  const fullName = String(user.name || '').trim();
  const displayName = fullName || '—';
  const tag = groupsById instanceof Map
    ? groupsById.get(user.userGroupId) || ''
    : groupsById[user.userGroupId] || '';
  const identifier = user.qrCode
    ? `карта: ${user.qrCode}`
    : user.phone
      ? `тел: ${user.phone}`
      : '';
  return { displayName, tag, identifier };
}

/** @param {object} user @param {Map<string, string>|Record<string, string>} groupsById */
export function clientButtonParts(user, groupsById) {
  const parts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const name = parts[0] || user.name || '—';
  const tag = groupsById instanceof Map
    ? groupsById.get(user.userGroupId) || ''
    : groupsById[user.userGroupId] || '';
  return { name, tag };
}

/**
 * @param {object} user
 * @param {string[]} [categoryGroupIds]
 */
function resolveGuestWallets(user, categoryGroupIds = []) {
  const normalized = normalizeUserWallets(user);
  return listUserWallets(normalized, { spendableOnly: true }).map(w => ({
    id: w.id,
    name: w.name,
    balance: Number(w.balance) || 0,
    allowedCategories: w.allowedCategories || [],
    available: isUserWalletAvailable(w),
    canPay: canSpendFromWallet(w, categoryGroupIds),
  }));
}

/** @param {object} user @param {string[]} [categoryGroupIds] */
function resolveGuestLimit(user, categoryGroupIds = []) {
  const wallets = normalizeUserWallets(user);
  const spendable = listUserWallets(wallets, { spendableOnly: true })
    .filter(w => canSpendFromWallet(w, categoryGroupIds));
  if (spendable.length) {
    return Math.max(...spendable.map(w => Number(w.balance) || 0));
  }
  return Number(user.balance) || 0;
}

/**
 * @param {object} user
 * @param {Map<string, string>|Record<string, string>} groupsById
 * @param {string[]} [categoryGroupIds]
 */
export function crmUserToGuest(user, groupsById, categoryGroupIds = []) {
  const { name, tag } = clientButtonParts(user, groupsById);
  const wallets = resolveGuestWallets(user, categoryGroupIds);
  return {
    id: user.id,
    card: user.qrCode,
    name,
    fullName: user.name || name,
    balance: sumWalletBalances(normalizeUserWallets(user), { spendableOnly: true }),
    limit: resolveGuestLimit(user, categoryGroupIds),
    group: tag,
    userGroupId: user.userGroupId,
    phone: user.phone || null,
    email: user.email || null,
    wallets,
  };
}

const GUEST_RECEIPT_ICON = `<svg class="ct-receipt-guest-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#3b82f6"/><circle cx="12" cy="9" r="3.5" fill="#fff"/><path d="M5.5 19.5c.8-3 3-5 6.5-5s5.7 2 6.5 5" fill="#fff"/></svg>`;

/** @param {object} guest */
function renderGuestWalletListHtml(guest) {
  const wallets = guest.wallets?.length
    ? guest.wallets.filter(w => w.available !== false && w.canPay !== false)
    : [];

  if (!wallets.length) return '';

  return wallets.map((wallet, index) => `
    ${index > 0 ? '<span class="ct-receipt-guest-wallet-sep" aria-hidden="true">·</span>' : ''}
    <span class="ct-receipt-guest-wallet">
      <span class="ct-receipt-guest-wallet-name">${esc(wallet.name)}</span>
      <span class="ct-receipt-guest-wallet-balance">${formatMoney(wallet.balance)} ₽</span>
    </span>
  `).join('');
}

/** @param {object|null|undefined} guest */
export function renderPosGuestReceiptRow(guest) {
  if (!guest) return '';

  const displayName = guest.fullName || guest.name || '—';
  const walletsHtml = renderGuestWalletListHtml(guest);

  return `
    <div class="ct-receipt-guest-row">
      <span class="ct-receipt-guest-icon">${GUEST_RECEIPT_ICON}</span>
      <div class="ct-receipt-guest-content">
        <span class="ct-receipt-guest-name" title="${escAttr(displayName)}">${esc(displayName)}</span>
        ${guest.group ? `
          <span class="ct-receipt-guest-group-sep" aria-hidden="true">·</span>
          <span class="ct-receipt-guest-group">${esc(guest.group)}</span>
        ` : ''}
        ${walletsHtml ? `<span class="ct-receipt-guest-group-sep" aria-hidden="true">·</span>${walletsHtml}` : ''}
      </div>
    </div>
  `;
}

function guestDetailValue(value) {
  const text = String(value || '').trim();
  return text ? esc(text) : '<span class="ct-guest-detail-empty">—</span>';
}

/** @param {{ id?: string, name: string }} wallet */
function guestDetailWalletVariant(wallet) {
  if (wallet.id === 'personal') return 'personal';
  const name = String(wallet.name || '').toLowerCase();
  if (name.includes('личн')) return 'personal';
  return 'subsidy';
}

/** @param {object} guest */
export function renderGuestDetailsBody(guest) {
  const wallets = guest.wallets?.length
    ? guest.wallets
    : [
      { id: 'personal', name: 'Личные средства', balance: guest.balance || 0 },
      ...(guest.limit != null && guest.limit !== guest.balance
        ? [{ id: 'dotation', name: 'Дотация', balance: guest.limit }]
        : []),
    ];

  const walletsHtml = wallets.map(wallet => {
    const variant = guestDetailWalletVariant(wallet);
    return `
      <article class="ct-guest-detail-wallet-card ct-guest-detail-wallet-card--${variant}">
        <span class="ct-guest-detail-wallet-card__label">${esc(wallet.name)}</span>
        <strong class="ct-guest-detail-wallet-card__amount">${formatMoney(wallet.balance)} ₽</strong>
      </article>
    `;
  }).join('');

  return `
    <div class="ct-guest-detail">
      <dl class="ct-guest-detail-profile">
        <div class="ct-guest-detail-row">
          <dt>ФИО</dt>
          <dd>${esc(guest.fullName || guest.name || '—')}</dd>
        </div>
        <div class="ct-guest-detail-row">
          <dt>Группа</dt>
          <dd>${guestDetailValue(guest.group)}</dd>
        </div>
        <div class="ct-guest-detail-row">
          <dt>Карта</dt>
          <dd>${guestDetailValue(guest.card)}</dd>
        </div>
        <div class="ct-guest-detail-row">
          <dt>Телефон</dt>
          <dd>${guestDetailValue(guest.phone)}</dd>
        </div>
        <div class="ct-guest-detail-row">
          <dt>Email</dt>
          <dd>${guestDetailValue(guest.email)}</dd>
        </div>
      </dl>
      <section class="ct-guest-detail-balances" aria-labelledby="ct-guest-detail-balances-label">
        <h3 class="ct-guest-detail-balances__label" id="ct-guest-detail-balances-label">Балансы</h3>
        <div class="ct-guest-detail-wallet-grid">${walletsHtml}</div>
      </section>
    </div>
  `;
}

/** @param {object} user @param {string[]} [categoryGroupIds] */
export function getClientPickerWallets(user, categoryGroupIds = []) {
  return resolveGuestWallets(user, categoryGroupIds);
}

/**
 * @param {object[]} clients
 * @param {Map<string, string>|Record<string, string>} groupsById
 * @param {string} search
 */
export function filterClientsForPicker(clients, groupsById, search = '') {
  const map = groupsById instanceof Map ? groupsById : new Map(Object.entries(groupsById));
  const q = search.trim().toLowerCase();
  const active = filterCrmUsers(clients, { activeOnly: true });

  const filtered = !q
    ? active
    : active.filter(user => {
      const { displayName, tag, identifier } = clientPickerCardParts(user, map);
      const hay = [
        displayName,
        tag,
        identifier,
        user.name,
        user.email,
        user.phone,
        user.qrCode,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

  return filtered.map(user => ({
    user,
    ...clientPickerCardParts(user, map),
    wallets: getClientPickerWallets(user),
  }));
}

/** @returns {Promise<{ clients: object[], groupsById: Map<string, string> }>} */
export async function loadPosGuests() {
  const [rules, groups, users] = await Promise.all([
    fetchAllValidationRules(),
    fetchUserGroups(),
    fetchCrmUsers(),
  ]);
  const groupsById = new Map(groups.map(g => [g.id, g.name]));
  const clients = filterPosClients(users, rules);
  return { clients, groupsById };
}

/** @returns {{ clients: object[], groupsById: Map<string, string> }} */
export function getDemoPosGuests() {
  const groupsById = new Map(Object.entries(DEMO_POS_GROUPS));
  return { clients: DEMO_POS_CLIENTS, groupsById };
}
