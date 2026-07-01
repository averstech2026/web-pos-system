/**
 * Display and expansion of composite lunch selections in orders and carts.
 */

/** @typedef {{ stepId?: string, stepName?: string, itemId?: string, itemName?: string }} LunchSelection */

/** @param {object} [item] */
export function hasLunchSelections(item) {
  return Array.isArray(item?.lunchSelections) && item.lunchSelections.length > 0;
}

/** @param {LunchSelection[]} selections */
export function formatLunchSelectionsInline(selections = []) {
  return selections.map(s => s.itemName).filter(Boolean).join(', ');
}

/** @param {LunchSelection[]} selections */
export function formatLunchSelectionsDetailed(selections = []) {
  return selections
    .map(s => (s.stepName ? `${s.stepName}: ${s.itemName || '—'}` : (s.itemName || '—')))
    .join(' · ');
}

/**
 * @param {LunchSelection[]} selections
 * @param {object} [opts]
 * @param {string} [opts.className]
 */
export function renderLunchSelectionsHtml(selections = [], { className = 'order-line-composition' } = {}) {
  if (!selections?.length) return '';
  return `
    <ul class="${className}">
      ${selections.map(s => `
        <li class="${className}__item">
          ${s.stepName ? `<span class="${className}__step">${esc(s.stepName)}:</span> ` : ''}
          <span class="${className}__dish">${esc(s.itemName || '—')}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * Expand order items into kitchen / delivery lines.
 * Composite items with lunchSelections become one line per selected dish.
 * @param {Array<{ dishId: string, name: string, price?: number, quantity?: number, lunchSelections?: LunchSelection[] }>} items
 */
export function expandOrderItemLines(items = []) {
  /** @type {Array<{ key: string, dishId: string, name: string, price?: number, parentName?: string, stepName?: string, isCompositePart?: boolean }>} */
  const lines = [];

  items.forEach(item => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    for (let unit = 0; unit < qty; unit += 1) {
      if (hasLunchSelections(item)) {
        item.lunchSelections.forEach((sel, index) => {
          lines.push({
            key: `${item.dishId}:${unit}:part:${sel.itemId || index}`,
            dishId: item.dishId,
            name: sel.itemName || '—',
            price: item.price,
            parentName: item.name,
            stepName: sel.stepName || '',
            isCompositePart: true,
          });
        });
      } else {
        lines.push({
          key: `${item.dishId}:${unit}`,
          dishId: item.dishId,
          name: item.name,
          price: item.price,
        });
      }
    }
  });

  return lines;
}

/**
 * @param {{ name: string, parentName?: string, stepName?: string }} line
 */
export function renderTerminalLineNameHtml(line) {
  const name = esc(line.name || '—');
  if (!line.parentName) return name;
  const meta = [line.parentName, line.stepName].filter(Boolean).join(' · ');
  return `${name}<span class="order-line-composite-meta">${esc(meta)}</span>`;
}

/**
 * @param {object} item
 * @param {object} [opts]
 * @param {string} [opts.className]
 */
export function renderCartItemCompositionHtml(item, { className = 'order-line-composition' } = {}) {
  if (!hasLunchSelections(item)) return '';
  return renderLunchSelectionsHtml(item.lunchSelections, { className });
}

/** @param {string} s */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
