import { fetchAllValidationRules } from '../../admin/services/validation-rules-data.js';
import { fetchUserGroups } from '../../admin/services/crm-ref-data.js';
import { fetchCrmUsers, filterCrmUsers } from '../../admin/services/users-data.js';
import { USER_STATUS, normalizeUserWallets } from '../../shared/schema.js';
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
    wallets: { dotation: { balance: 5000, name: 'Дотация' } },
  },
  {
    id: 'demo-vld-petrov',
    name: 'Петров Алексей Иванович',
    qrCode: '048292',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'office_romashka',
    balance: 3200,
    wallets: { dotation: { balance: 150, name: 'Субсидия' } },
  },
  {
    id: 'demo-vld-sidorov',
    name: 'Сидоров Николай Петрович',
    qrCode: '048293',
    status: USER_STATUS.ACTIVE,
    userGroupId: 'production',
    balance: 1100,
    wallets: { dotation: { balance: 100, name: 'Дотация' } },
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
export function clientButtonParts(user, groupsById) {
  const parts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const name = parts[0] || user.name || '—';
  const tag = groupsById instanceof Map
    ? groupsById.get(user.userGroupId) || ''
    : groupsById[user.userGroupId] || '';
  return { name, tag };
}

/** @param {object} user */
function resolveGuestWallets(user) {
  const normalized = normalizeUserWallets(user);
  const order = ['personal', 'dotation'];
  const entries = Object.entries(normalized).map(([id, w]) => ({
    id,
    name: w.name,
    balance: Number(w.balance) || 0,
  }));
  entries.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, 'ru');
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return entries;
}

/** @param {object} user */
function resolveGuestLimit(user) {
  const wallets = user.wallets || {};
  const balances = Object.values(wallets)
    .map(w => Number(w?.balance))
    .filter(n => Number.isFinite(n));
  if (balances.length) return Math.max(...balances);
  return Number(user.balance) || 0;
}

/** @param {object} user @param {Map<string, string>|Record<string, string>} groupsById */
export function crmUserToGuest(user, groupsById) {
  const { name, tag } = clientButtonParts(user, groupsById);
  const wallets = resolveGuestWallets(user);
  return {
    id: user.id,
    card: user.qrCode,
    name,
    fullName: user.name || name,
    balance: Number(user.balance) || 0,
    limit: resolveGuestLimit(user),
    group: tag,
    userGroupId: user.userGroupId,
    phone: user.phone || null,
    email: user.email || null,
    wallets,
  };
}

const GUEST_ROW_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 19.5c.9-3.2 3.2-5.5 6.5-5.5s5.6 2.3 6.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** @param {object|null|undefined} guest */
export function renderPosGuestTotalsLine(guest) {
  if (!guest) {
    return `
      <div class="ct-totals-guest-line ct-totals-guest-line--empty">
        <span class="ct-totals-guest-hint">Клиент не выбран</span>
      </div>
    `;
  }

  const wallets = guest.wallets?.length
    ? guest.wallets
    : [
      { name: 'Личные средства', balance: guest.balance || 0 },
      ...(guest.limit != null && guest.limit !== guest.balance
        ? [{ name: 'Дотация', balance: guest.limit }]
        : []),
    ];

  const walletsHtml = wallets.map((wallet, index) => `
    ${index > 0 ? '<span class="ct-totals-guest-wallet-sep" aria-hidden="true">·</span>' : ''}
    <span class="ct-totals-guest-wallet">
      <span class="ct-totals-guest-wallet-name">${esc(wallet.name)}</span>
      <span class="ct-totals-guest-wallet-balance">${formatMoney(wallet.balance)} ₽</span>
    </span>
  `).join('');

  const displayName = guest.fullName || guest.name;

  return `
    <div class="ct-totals-guest-line ct-totals-guest-line--active">
      <span class="ct-totals-guest-icon">${GUEST_ROW_ICON}</span>
      <div class="ct-totals-guest-main">
        <span class="ct-totals-guest-name" title="${escAttr(displayName)}">${esc(displayName)}</span>
        ${guest.group ? `
          <span class="ct-totals-guest-group-sep" aria-hidden="true">·</span>
          <span class="ct-totals-guest-group">${esc(guest.group)}</span>
        ` : ''}
      </div>
      <div class="ct-totals-guest-wallets">${walletsHtml}</div>
    </div>
  `;
}

function guestDetailValue(value) {
  const text = String(value || '').trim();
  return text ? esc(text) : '<span class="ct-guest-detail-empty">—</span>';
}

/** @param {object} guest */
export function renderGuestDetailsBody(guest) {
  const wallets = guest.wallets?.length
    ? guest.wallets
    : [
      { name: 'Личные средства', balance: guest.balance || 0 },
      ...(guest.limit != null && guest.limit !== guest.balance
        ? [{ name: 'Дотация', balance: guest.limit }]
        : []),
    ];

  const walletsHtml = wallets.map(wallet => `
    <div class="ct-guest-detail-wallet">
      <span class="ct-guest-detail-wallet-name">${esc(wallet.name)}</span>
      <strong class="ct-guest-detail-wallet-balance">${formatMoney(wallet.balance)} ₽</strong>
    </div>
  `).join('');

  return `
    <dl class="ct-guest-detail">
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
      <div class="ct-guest-detail-row ct-guest-detail-row--wallets">
        <dt>Балансы</dt>
        <dd class="ct-guest-detail-wallets">${walletsHtml}</dd>
      </div>
    </dl>
  `;
}

/**
 * @param {object[]} clients
 * @param {Map<string, string>|Record<string, string>} groupsById
 * @param {string} search
 */
export function filterClientsForPicker(clients, groupsById, search = '') {
  const filtered = filterCrmUsers(clients, { search, activeOnly: true });
  const map = groupsById instanceof Map ? groupsById : new Map(Object.entries(groupsById));
  return filtered.map(u => ({ user: u, ...clientButtonParts(u, map) }));
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
