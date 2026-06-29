import { USER_STATUS } from '../../shared/schema.js';

const STATUS_LABELS = {
  [USER_STATUS.ACTIVE]: 'Активен',
  [USER_STATUS.BLOCKED]: 'Заблокирован',
  [USER_STATUS.FIRED]: 'Уволен',
};

const STATUS_BADGE = {
  [USER_STATUS.ACTIVE]: 'crm-badge--active',
  [USER_STATUS.BLOCKED]: 'crm-badge--blocked',
  [USER_STATUS.FIRED]: 'crm-badge--fired',
};

export function userStatusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

export function userStatusBadgeClass(status) {
  return STATUS_BADGE[status] || 'crm-badge--fired';
}

/** @param {string|null|undefined} categoryId @param {Map<string, object>} [byId] */
export function loyaltyLabel(categoryId, byId) {
  if (!categoryId) return '—';
  return byId?.get(categoryId)?.name || categoryId;
}

/** @param {string|null|undefined} categoryId */
export function loyaltyBadgeClass(categoryId) {
  if (!categoryId) return 'crm-loyalty--none';
  if (categoryId.includes('gold')) return 'crm-loyalty--gold';
  if (categoryId.includes('silver')) return 'crm-loyalty--silver';
  if (categoryId.includes('bronze')) return 'crm-loyalty--bronze';
  return 'crm-loyalty--default';
}

export function walletOpLabel(type) {
  const t = type === 'deposit' || type === 'credit' ? 'deposit' : 'withdraw';
  return t === 'deposit' ? 'Пополнение' : 'Списание';
}

export function walletOpClass(type) {
  const t = type === 'deposit' || type === 'credit' ? 'deposit' : 'withdraw';
  return t === 'deposit' ? 'crm-op--credit' : 'crm-op--debit';
}

export function walletOpSign(type) {
  const t = type === 'deposit' || type === 'credit' ? 'deposit' : 'withdraw';
  return t === 'deposit' ? '+' : '−';
}

/** @param {string} [iso] YYYY-MM-DD */
export function fmtBirthDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** @param {Array<{ name: string, quantity?: number }>} items */
export function briefOrderItems(items = [], max = 3) {
  if (!items.length) return '—';
  const names = items.slice(0, max).map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
  const rest = items.length > max ? ` +${items.length - max}` : '';
  return names.join(', ') + rest;
}
