/**
 * Promo rules (collection: promo_rules).
 * Flexible promotion constructor for food service.
 */

/** @typedef {'cart_amount'|'item_quantity'|'happy_hour'|'client_segment'} PromoTriggerType */

/** @typedef {'all'|'new'|'vip'|'staff'} ClientGroupId */

/**
 * @typedef {object} PromoConditions
 * @property {number} [minSum] - cart_amount
 * @property {string} [requiredItemId] - item_quantity
 * @property {string} [requiredGroupId] - item_quantity (category group id)
 * @property {number} [requiredQty] - item_quantity
 */

/**
 * @typedef {object} PromoActionDiscountPercent
 * @property {'discount_percent'} type
 * @property {number} value - 0–100
 * @property {'cart'|'group'} [target] - default 'cart'
 * @property {string|null} [targetGroupId] - when target === 'group'
 */

/**
 * @typedef {object} PromoActionDiscountFixed
 * @property {'discount_fixed'} type
 * @property {number} value - rubles off cart
 */

/**
 * @typedef {object} PromoActionGift
 * @property {'gift_item'} type
 * @property {string} giftItemId
 */

/**
 * @typedef {object} PromoActionBonusPoints
 * @property {'bonus_points'} type
 * @property {'points'|'percent'} mode
 * @property {number} value
 */

/** @typedef {PromoActionDiscountPercent|PromoActionDiscountFixed|PromoActionGift|PromoActionBonusPoints} PromoAction */

/**
 * @typedef {object} PromoRuleDoc
 * @property {string} id
 * @property {string} name
 * @property {boolean} isActive
 * @property {string|null} availabilityRuleId
 * @property {PromoTriggerType} triggerType
 * @property {PromoConditions} conditions
 * @property {PromoAction} action
 * @property {ClientGroupId[]} [targetClientGroups] - client_segment trigger
 */

export const PROMO_TRIGGER_OPTIONS = [
  { id: 'cart_amount', label: 'Сумма чека более X руб.' },
  { id: 'item_quantity', label: 'Покупка конкретного количества товаров (например, 3+1)' },
  { id: 'happy_hour', label: 'Просто по времени / Счастливый час' },
  { id: 'client_segment', label: 'Определенная группа клиентов' },
];

export const PROMO_ACTION_OPTIONS = [
  { id: 'gift_item', label: 'Подарок (Товар бесплатно)' },
  { id: 'discount_percent', label: 'Скидка в %' },
  { id: 'discount_fixed', label: 'Фиксированная скидка в рублях (на чек)' },
  { id: 'bonus_points', label: 'Начисление бонусных баллов (Кэшбэк)' },
];

export const CLIENT_GROUP_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые клиенты' },
  { id: 'vip', label: 'VIP-клиенты' },
  { id: 'staff', label: 'Сотрудники' },
];

const TRIGGER_TYPES = PROMO_TRIGGER_OPTIONS.map(o => o.id);
const ACTION_TYPES = PROMO_ACTION_OPTIONS.map(o => o.id);
const CLIENT_GROUP_IDS = CLIENT_GROUP_OPTIONS.map(o => o.id);

/** @returns {PromoRuleDoc} */
export function createDefaultPromoRule(id = '') {
  return {
    id: id || `promo-${Date.now()}`,
    name: 'Новая акция',
    isActive: false,
    availabilityRuleId: null,
    triggerType: 'happy_hour',
    conditions: {},
    action: { type: 'discount_percent', value: 10, target: 'cart', targetGroupId: null },
    targetClientGroups: [],
  };
}

/** @param {unknown[]} raw */
function normalizeClientGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(g => CLIENT_GROUP_IDS.includes(g)))];
}

/** @param {Partial<PromoConditions>|null|undefined} raw */
export function normalizePromoConditions(raw) {
  const conditions = { ...(raw || {}) };
  if (conditions.minSum != null) {
    conditions.minSum = Math.max(0, Number(conditions.minSum) || 0);
  }
  if (conditions.requiredQty != null) {
    conditions.requiredQty = Math.max(1, Math.floor(Number(conditions.requiredQty) || 1));
  }
  if (conditions.requiredItemId === '') conditions.requiredItemId = undefined;
  if (conditions.requiredGroupId === '') conditions.requiredGroupId = undefined;
  return conditions;
}

/** @param {Partial<PromoAction>|null|undefined} raw */
export function normalizePromoAction(raw) {
  const type = ACTION_TYPES.includes(raw?.type) ? raw.type : 'discount_percent';

  if (type === 'gift_item') {
    return {
      type: 'gift_item',
      giftItemId: String(raw?.giftItemId || '').trim(),
    };
  }

  if (type === 'discount_fixed') {
    return {
      type: 'discount_fixed',
      value: Math.max(0, Number(raw?.value) || 0),
    };
  }

  if (type === 'bonus_points') {
    const mode = raw?.mode === 'percent' ? 'percent' : 'points';
    return {
      type: 'bonus_points',
      mode,
      value: Math.max(0, Number(raw?.value) || 0),
    };
  }

  const value = Math.min(100, Math.max(0, Number(raw?.value) || 0));
  const target = raw?.target === 'group' ? 'group' : 'cart';
  const targetGroupId = target === 'group' ? (raw?.targetGroupId || null) : null;

  return { type: 'discount_percent', value, target, targetGroupId };
}

/** Strip irrelevant fields when trigger/action type changes. */
export function sanitizePromoRuleFields(rule) {
  /** @type {PromoConditions} */
  const conditions = {};

  if (rule.triggerType === 'cart_amount') {
    conditions.minSum = rule.conditions?.minSum;
  } else if (rule.triggerType === 'item_quantity') {
    if (rule.conditions?.requiredItemId) {
      conditions.requiredItemId = rule.conditions.requiredItemId;
      conditions.requiredQty = rule.conditions.requiredQty;
    } else if (rule.conditions?.requiredGroupId) {
      conditions.requiredGroupId = rule.conditions.requiredGroupId;
      conditions.requiredQty = rule.conditions.requiredQty;
    }
  }

  const action = normalizePromoAction(rule.action);

  return {
    ...rule,
    conditions: normalizePromoConditions(conditions),
    action,
    targetClientGroups: rule.triggerType === 'client_segment'
      ? normalizeClientGroups(rule.targetClientGroups)
      : [],
  };
}

/** @param {Partial<PromoRuleDoc>|null|undefined} raw @param {string} [docId] */
export function normalizePromoRuleDoc(raw, docId = '') {
  const id = String(raw?.id || docId || '').trim();
  const triggerType = TRIGGER_TYPES.includes(raw?.triggerType) ? raw.triggerType : 'happy_hour';

  const draft = {
    id,
    name: String(raw?.name || '').trim() || 'Без названия',
    isActive: raw?.isActive === true,
    availabilityRuleId: raw?.availabilityRuleId || null,
    triggerType,
    conditions: normalizePromoConditions(raw?.conditions),
    action: normalizePromoAction(raw?.action),
    targetClientGroups: normalizeClientGroups(raw?.targetClientGroups),
  };

  return sanitizePromoRuleFields(draft);
}

const CLIENT_GROUP_LABELS = Object.fromEntries(CLIENT_GROUP_OPTIONS.map(o => [o.id, o.label]));

/** @param {PromoRuleDoc} rule @param {import('./menu-catalog.js').CategoryGroup[]} [groups] @param {Array<{ id: string, name?: string }>} [items] */
export function formatPromoRuleSummary(rule, groups = [], items = []) {
  const parts = [];

  if (rule.triggerType === 'cart_amount' && rule.conditions.minSum) {
    parts.push(`от ${rule.conditions.minSum} ₽`);
  } else if (rule.triggerType === 'item_quantity') {
    const qty = rule.conditions.requiredQty || 1;
    if (rule.conditions.requiredItemId) {
      const item = items.find(i => i.id === rule.conditions.requiredItemId);
      parts.push(`${qty}× ${item?.name || 'товар'}`);
    } else if (rule.conditions.requiredGroupId) {
      const group = groups.find(g => g.id === rule.conditions.requiredGroupId);
      parts.push(`${qty}× ${group?.name || 'группа'}`);
    } else {
      parts.push(`${qty} шт.`);
    }
  } else if (rule.triggerType === 'happy_hour') {
    parts.push('по расписанию');
  } else if (rule.triggerType === 'client_segment' && rule.targetClientGroups?.length) {
    const labels = rule.targetClientGroups.map(g => CLIENT_GROUP_LABELS[g] || g);
    parts.push(labels.join(', '));
  }

  if (rule.action.type === 'discount_percent') {
    const target = rule.action.target === 'group'
      ? groups.find(g => g.id === rule.action.targetGroupId)?.name || 'группа'
      : 'весь чек';
    parts.push(`−${rule.action.value}% на ${target}`);
  } else if (rule.action.type === 'discount_fixed') {
    parts.push(`−${rule.action.value} ₽`);
  } else if (rule.action.type === 'gift_item') {
    const gift = items.find(i => i.id === rule.action.giftItemId);
    parts.push(`подарок: ${gift?.name || 'товар'}`);
  } else if (rule.action.type === 'bonus_points') {
    const suffix = rule.action.mode === 'percent' ? '% кэшбэк' : ' баллов';
    parts.push(`+${rule.action.value}${suffix}`);
  }

  return parts.join(' · ') || 'Акция';
}

/** @param {Partial<PromoRuleDoc>} rule */
export function validatePromoRuleDoc(rule) {
  const normalized = sanitizePromoRuleFields(normalizePromoRuleDoc(rule, rule.id));

  if (!normalized.name.trim()) {
    throw new Error('Укажите название акции');
  }

  if (normalized.triggerType === 'cart_amount') {
    if (!normalized.conditions.minSum || normalized.conditions.minSum <= 0) {
      throw new Error('Укажите минимальную сумму чека');
    }
  }

  if (normalized.triggerType === 'item_quantity') {
    if (!normalized.conditions.requiredItemId && !normalized.conditions.requiredGroupId) {
      throw new Error('Выберите товар или группу для условия количества');
    }
    if (!normalized.conditions.requiredQty || normalized.conditions.requiredQty < 1) {
      throw new Error('Укажите требуемое количество');
    }
  }

  if (normalized.triggerType === 'client_segment') {
    if (!normalized.targetClientGroups?.length) {
      throw new Error('Выберите хотя бы одну категорию клиентов');
    }
  }

  if (normalized.action.type === 'discount_percent') {
    if (normalized.action.value <= 0) {
      throw new Error('Укажите процент скидки больше 0');
    }
    if (normalized.action.target === 'group' && !normalized.action.targetGroupId) {
      throw new Error('Выберите группу товаров для скидки');
    }
  }

  if (normalized.action.type === 'discount_fixed') {
    if (!normalized.action.value || normalized.action.value <= 0) {
      throw new Error('Укажите сумму скидки в рублях');
    }
  }

  if (normalized.action.type === 'gift_item') {
    if (!normalized.action.giftItemId) {
      throw new Error('Выберите товар-подарок');
    }
  }

  if (normalized.action.type === 'bonus_points') {
    if (!normalized.action.value || normalized.action.value <= 0) {
      throw new Error('Укажите количество баллов или процент кэшбэка');
    }
    if (normalized.action.mode === 'percent' && normalized.action.value > 100) {
      throw new Error('Процент кэшбэка не может превышать 100');
    }
  }

  return normalized;
}

/** @param {PromoRuleDoc} rule */
export function buildPromoRulePayload(rule) {
  const normalized = validatePromoRuleDoc(rule);
  const payload = {
    name: normalized.name,
    isActive: normalized.isActive,
    availabilityRuleId: normalized.availabilityRuleId || null,
    triggerType: normalized.triggerType,
    conditions: normalized.conditions,
    action: normalized.action,
  };
  if (normalized.triggerType === 'client_segment' && normalized.targetClientGroups?.length) {
    payload.targetClientGroups = normalized.targetClientGroups;
  }
  return payload;
}

/** @param {ClientGroupId[]} targetGroups @param {ClientGroupId} [clientGroup] */
export function matchesClientSegment(targetGroups, clientGroup = 'all') {
  const groups = normalizeClientGroups(targetGroups);
  if (!groups.length) return false;
  if (groups.includes('all')) return true;
  return groups.includes(clientGroup);
}
