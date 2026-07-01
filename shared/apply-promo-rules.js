import { isItemAvailable } from './availability-rules.js';
import { matchesClientSegment } from './promo-rules.js';

/**
 * @typedef {object} CartLine
 * @property {string} dishId
 * @property {string} name
 * @property {number} price
 * @property {number} [originalPrice]
 * @property {number} quantity
 * @property {object} [nutrition]
 * @property {boolean} [isGift]
 * @property {string} [promoRuleId]
 * @property {string} [promoLabel]
 */

/**
 * @typedef {object} BonusGrant
 * @property {string} promoRuleId
 * @property {'points'|'percent'} mode
 * @property {number} value
 * @property {number} [computedPoints]
 */

/**
 * @param {CartLine[]} lines
 */
function cloneLines(lines) {
  return lines.map(l => ({ ...l }));
}

/**
 * @param {CartLine[]} lines
 */
function cartSubtotal(lines) {
  return lines
    .filter(l => !l.isGift)
    .reduce((sum, l) => sum + l.price * l.quantity, 0);
}

/**
 * @param {CartLine[]} lines
 * @param {import('./promo-rules.js').PromoConditions} conditions
 * @param {Map<string, { id: string, category?: string }>} itemsById
 * @param {Map<string, { id: string, name: string }>} groupsById
 */
function countMatchingQuantity(lines, conditions, itemsById, groupsById) {
  const paid = lines.filter(l => !l.isGift);

  if (conditions.requiredItemId) {
    return paid
      .filter(l => l.dishId === conditions.requiredItemId)
      .reduce((s, l) => s + l.quantity, 0);
  }

  if (conditions.requiredGroupId) {
    const group = groupsById.get(conditions.requiredGroupId);
    if (!group) return 0;
    return paid
      .filter(l => {
        const item = itemsById.get(l.dishId);
        return item?.category === group.name;
      })
      .reduce((s, l) => s + l.quantity, 0);
  }

  return 0;
}

/**
 * @param {import('./promo-rules.js').PromoRuleDoc} promo
 * @param {CartLine[]} lines
 * @param {Map<string, { id: string, category?: string }>} itemsById
 * @param {Map<string, { id: string, name: string }>} groupsById
 * @param {import('./promo-rules.js').ClientGroupId} [clientSegment]
 */
function isPromoConditionMet(promo, lines, itemsById, groupsById, clientSegment = 'all') {
  const { triggerType, conditions } = promo;

  if (triggerType === 'happy_hour') return true;

  if (triggerType === 'client_segment') {
    return matchesClientSegment(promo.targetClientGroups, clientSegment);
  }

  if (triggerType === 'cart_amount') {
    const minSum = conditions.minSum || 0;
    return cartSubtotal(lines) >= minSum;
  }

  if (triggerType === 'item_quantity') {
    const required = conditions.requiredQty || 1;
    return countMatchingQuantity(lines, conditions, itemsById, groupsById) >= required;
  }

  return false;
}

/**
 * @param {CartLine[]} lines
 * @param {import('./promo-rules.js').PromoActionDiscountPercent} action
 * @param {string} promoRuleId
 * @param {Map<string, { id: string, category?: string }>} itemsById
 * @param {Map<string, { id: string, name: string }>} groupsById
 */
function applyPercentDiscount(lines, action, promoRuleId, itemsById, groupsById) {
  const factor = 1 - action.value / 100;
  const targetGroup = action.target === 'group' && action.targetGroupId
    ? groupsById.get(action.targetGroupId)
    : null;

  for (const line of lines) {
    if (line.isGift) continue;

    const item = itemsById.get(line.dishId);
    const inTarget = action.target === 'cart'
      || (targetGroup && item?.category === targetGroup.name);

    if (!inTarget) continue;

    const basePrice = line.originalPrice ?? line.price;
    if (line.originalPrice == null) line.originalPrice = basePrice;
    line.price = Math.round(basePrice * factor * 100) / 100;
    line.promoRuleId = promoRuleId;
  }
}

/**
 * @param {CartLine[]} lines
 * @param {import('./promo-rules.js').PromoActionDiscountFixed} action
 * @param {string} promoRuleId
 */
function applyFixedDiscount(lines, action, promoRuleId) {
  const subtotal = cartSubtotal(lines);
  const discount = Math.min(action.value, subtotal);
  if (discount <= 0) return;

  for (const line of lines) {
    if (line.isGift) continue;
    const base = line.originalPrice ?? line.price;
    const lineTotal = base * line.quantity;
    const share = subtotal > 0 ? lineTotal / subtotal : 0;
    const perUnit = (discount * share) / line.quantity;
    if (line.originalPrice == null) line.originalPrice = base;
    line.price = Math.max(0, Math.round((base - perUnit) * 100) / 100);
    line.promoRuleId = promoRuleId;
  }
}

/**
 * @param {CartLine[]} lines
 * @param {import('./promo-rules.js').PromoActionGift} action
 * @param {string} promoRuleId
 * @param {Map<string, { id: string, name: string, price?: number, nutrition?: object }>} itemsById
 */
function applyGift(lines, action, promoRuleId, itemsById) {
  const giftItem = itemsById.get(action.giftItemId);
  if (!giftItem) return;

  const giftKey = `gift:${promoRuleId}:${action.giftItemId}`;
  const existing = lines.find(l => l.dishId === giftKey);

  if (existing) {
    existing.quantity = 1;
    return;
  }

  lines.push({
    dishId: giftKey,
    name: giftItem.name,
    price: 0,
    originalPrice: giftItem.price ?? 0,
    quantity: 1,
    nutrition: giftItem.nutrition || undefined,
    isGift: true,
    promoRuleId,
    promoLabel: 'Подарок',
    giftItemId: action.giftItemId,
  });
}

/**
 * @param {import('./promo-rules.js').PromoActionBonusPoints} action
 * @param {string} promoRuleId
 * @param {number} cartTotal
 * @returns {BonusGrant}
 */
function buildBonusGrant(action, promoRuleId, cartTotal) {
  const computedPoints = action.mode === 'percent'
    ? Math.round(cartTotal * action.value / 100)
    : Math.round(action.value);
  return {
    promoRuleId,
    mode: action.mode,
    value: action.value,
    computedPoints,
  };
}

/**
 * Applies active promo rules to a cart.
 *
 * @param {CartLine[]} cart
 * @param {import('./promo-rules.js').PromoRuleDoc[]} activePromos
 * @param {import('./availability-rules.js').AvailabilityRuleDoc[]} allAvailabilityRules
 * @param {object} [options]
 * @param {Array<{ id: string, name: string, price?: number, category?: string, nutrition?: object }>} [options.catalogItems]
 * @param {import('./menu-catalog.js').CategoryGroup[]} [options.categoryGroups]
 * @param {{ date?: string, time?: string }} [options.slot]
 * @param {import('./promo-rules.js').ClientGroupId} [options.clientSegment]
 * @param {'web'|'kiosk'} [options.channel]
 * @returns {{ items: CartLine[], appliedPromoIds: string[], discountTotal: number, bonusGrants: BonusGrant[] }}
 */
export function applyPromoRules(cart, activePromos, allAvailabilityRules, options = {}) {
  const {
    catalogItems = [],
    categoryGroups = [],
    slot = {},
    clientSegment = 'all',
    channel = 'web',
  } = options;

  const itemsById = new Map(catalogItems.map(i => [i.id, i]));
  const groupsById = new Map(categoryGroups.map(g => [g.id, g]));

  const baseLines = cloneLines(
    (cart || []).filter(l => !l.isGift && !String(l.dishId || '').startsWith('gift:')),
  );

  const lines = cloneLines(baseLines);
  const appliedPromoIds = [];
  /** @type {BonusGrant[]} */
  const bonusGrants = [];

  const eligiblePromos = (activePromos || []).filter(p => {
    if (!p?.isActive) return false;
    if (channel === 'kiosk') return p.visibleInKiosk === true;
    if (channel === 'web') return p.visibleInWeb !== false;
    if (!p.availabilityRuleId) return true;
    return isItemAvailable(p.availabilityRuleId, null, allAvailabilityRules, slot);
  });

  for (const promo of eligiblePromos) {
    if (!isPromoConditionMet(promo, lines, itemsById, groupsById, clientSegment)) continue;

    if (promo.action.type === 'discount_percent') {
      applyPercentDiscount(lines, promo.action, promo.id, itemsById, groupsById);
      appliedPromoIds.push(promo.id);
    } else if (promo.action.type === 'discount_fixed') {
      applyFixedDiscount(lines, promo.action, promo.id);
      appliedPromoIds.push(promo.id);
    } else if (promo.action.type === 'gift_item') {
      applyGift(lines, promo.action, promo.id, itemsById);
      appliedPromoIds.push(promo.id);
    } else if (promo.action.type === 'bonus_points') {
      const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
      bonusGrants.push(buildBonusGrant(promo.action, promo.id, total));
      appliedPromoIds.push(promo.id);
    }
  }

  const subtotalBefore = baseLines.reduce((s, l) => s + (l.originalPrice ?? l.price) * l.quantity, 0);
  const subtotalAfter = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discountTotal = Math.max(0, Math.round((subtotalBefore - subtotalAfter) * 100) / 100);

  return { items: lines, appliedPromoIds, discountTotal, bonusGrants };
}
