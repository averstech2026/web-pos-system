/** @typedef {{ protein?: number, fat?: number, carbs?: number, kcal?: number }} Nutrition */

export const NUTRITION_CELLS = [
  { key: 'protein', label: 'белки', icon: '🍗', tone: 'green' },
  { key: 'fat', label: 'жиры', icon: '💧', tone: 'yellow' },
  { key: 'carbs', label: 'углеводы', icon: '🌾', tone: 'blue' },
  { key: 'kcal', label: 'ккал', icon: '🔥', tone: 'pink' },
];

/** @param {Nutrition|null|undefined} n */
export function hasNutrition(n) {
  if (!n || typeof n !== 'object') return false;
  return [n.protein, n.fat, n.carbs, n.kcal].some(v => typeof v === 'number' && v > 0);
}

/** @param {number} n */
export function fmtNutrient(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Sum KBJU across order/cart lines.
 * @param {Array<{ nutrition?: Nutrition, quantity?: number }>} items
 * @returns {Nutrition|null}
 */
export function sumNutrition(items = []) {
  const sum = { protein: 0, fat: 0, carbs: 0, kcal: 0 };
  let hasAny = false;

  for (const item of items) {
    const n = item.nutrition;
    if (!hasNutrition(n)) continue;
    hasAny = true;
    const q = item.quantity || 1;
    sum.protein += (n.protein || 0) * q;
    sum.fat += (n.fat || 0) * q;
    sum.carbs += (n.carbs || 0) * q;
    sum.kcal += (n.kcal || 0) * q;
  }

  if (!hasAny) return null;

  return {
    protein: Math.round(sum.protein * 10) / 10,
    fat: Math.round(sum.fat * 10) / 10,
    carbs: Math.round(sum.carbs * 10) / 10,
    kcal: Math.round(sum.kcal),
  };
}

/**
 * @param {Nutrition|null|undefined} nutrition
 * @param {{ compact?: boolean, title?: string|null, className?: string }} [opts]
 */
export function renderNutritionGrid(nutrition, opts = {}) {
  const { compact = false, title = null, className = '' } = opts;
  if (!hasNutrition(nutrition)) return '';

  const gridCls = [
    'item-detail-nutrition',
    compact ? 'nutrition-grid--compact' : '',
    className,
  ].filter(Boolean).join(' ');

  const titleHtml = title
    ? `<div class="item-detail-section-title${compact ? ' item-detail-section-title--compact' : ''}">${title}</div>`
    : '';

  return `
    ${titleHtml}
    <div class="${gridCls}">
      ${NUTRITION_CELLS.map(c => `
        <div class="item-detail-nutrition-cell item-detail-nutrition-cell--${c.tone}">
          <span class="item-detail-nutrition-icon">${c.icon}</span>
          <span class="item-detail-nutrition-val">${fmtNutrient(nutrition[c.key])}</span>
          <span class="item-detail-nutrition-label">${c.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}
