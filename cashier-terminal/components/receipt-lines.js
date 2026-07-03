import { hasLunchSelections } from '../../shared/composite-order-display.js';
import { COMPOSITE_SET_MODES, resolveCatalogItemsById, resolveCompositeSetMode } from '../../shared/composite-meals.js';
import { esc, escAttr, formatMoneyShort } from '../core/format.js';
import { TOOL_ICONS } from './toolbar-icons.js';

/** @param {string} itemId @param {Map<string, object>} byId @param {string} [storedName] */
function resolveReceiptComponentName(itemId, byId, storedName = '') {
  const trimmed = String(storedName || '').trim();
  if (trimmed && trimmed !== '—') return trimmed;
  const name = byId.get(itemId)?.name;
  return name ? String(name).trim() : (trimmed || '—');
}

/**
 * @param {object} line
 * @param {object[]} [catalogItems]
 * @param {Map<string, object>|null} [catalogById]
 * @returns {import('../../shared/composite-order-display.js').LunchSelection[]}
 */
export function resolvePosReceiptComponents(line, catalogItems = [], catalogById = null) {
  const byId = resolveCatalogItemsById(catalogItems, catalogById);

  if (hasLunchSelections(line)) {
    return line.lunchSelections.map(sel => ({
      ...sel,
      itemName: resolveReceiptComponentName(sel.itemId, byId, sel.itemName),
    }));
  }

  const product = catalogItems.find(item => item.id === line.productId);
  if (!product?.isComposite) return [];

  if (resolveCompositeSetMode(product) === COMPOSITE_SET_MODES.FIXED && product.fixedItems?.length) {
    /** @type {import('../../shared/composite-order-display.js').LunchSelection[]} */
    const components = [];
    for (const entry of product.fixedItems) {
      const qty = Math.max(1, Number(entry.quantity) || 1);
      for (let unit = 0; unit < qty; unit += 1) {
        components.push({
          stepId: `fixed_${entry.itemId}_${unit}`,
          stepName: '',
          itemId: entry.itemId,
          itemName: resolveReceiptComponentName(entry.itemId, byId),
        });
      }
    }
    return components;
  }

  if (!product.lunchSteps?.length) return [];

  return product.lunchSteps.map(step => {
    const itemId = step.itemIds?.[0] || '';
    const item = itemId ? byId.get(itemId) : null;
    return {
      stepId: step.id,
      stepName: step.name,
      itemId,
      itemName: item?.name || step.name || '—',
    };
  });
}

/**
 * @param {object} line
 * @param {object[]} [catalogItems]
 * @param {Map<string, object>|null} [catalogById]
 */
export function isCompositeReceiptLine(line, catalogItems = [], catalogById = null) {
  return resolvePosReceiptComponents(line, catalogItems, catalogById).length > 0;
}

/**
 * @param {object} opts
 * @param {object} opts.line
 * @param {number} opts.index
 * @param {boolean} opts.selected
 * @param {string} opts.discountBadge
 * @param {number} opts.lineTotal
 * @param {object[]} [opts.catalogItems]
 * @param {Map<string, object>|null} [opts.catalogById]
 */
export function renderPosReceiptLineHtml({
  line,
  index,
  selected,
  discountBadge,
  lineTotal,
  catalogItems = [],
  catalogById = null,
}) {
  const components = resolvePosReceiptComponents(line, catalogItems, catalogById);
  const selectedClass = selected ? 'ct-receipt-item--selected' : '';
  const rowSelectedClass = selected ? 'ct-receipt-row--selected' : '';

  const parentRow = `
    <div class="ct-receipt-row ct-receipt-row--parent">
      <span class="ct-receipt-index">${index + 1}</span>
      <span class="ct-receipt-name-wrap">
        <span class="ct-receipt-name">${esc(line.name)}</span>
        ${line.honestSignCode ? '<span class="ct-receipt-badge ct-receipt-badge--hz" title="Марка Честный Знак">ЧЗ</span>' : ''}
      </span>
      <span class="ct-receipt-discount-col">${discountBadge}</span>
      <div class="ct-receipt-qty">
        <button type="button" class="ct-qty-btn btn-press" data-action="line-minus" data-id="${escAttr(line.id)}">${TOOL_ICONS.minus}</button>
        <button type="button" class="ct-qty-value btn-press" data-action="line-qty-input" data-id="${escAttr(line.id)}" aria-label="Изменить количество">${line.quantity}</button>
        <button type="button" class="ct-qty-btn btn-press" data-action="line-plus" data-id="${escAttr(line.id)}">${TOOL_ICONS.plus}</button>
      </div>
      <button type="button" class="ct-receipt-delete btn-press" data-action="line-delete" data-id="${escAttr(line.id)}" aria-label="Удалить">${TOOL_ICONS.trash}</button>
      <span class="ct-receipt-price">${formatMoneyShort(lineTotal)}</span>
    </div>
  `;

  if (!components.length) {
    return `
      <div class="ct-receipt-row ${rowSelectedClass}" data-line-id="${escAttr(line.id)}">
        <span class="ct-receipt-index">${index + 1}</span>
        <span class="ct-receipt-name-wrap">
          <span class="ct-receipt-name">${esc(line.name)}</span>
          ${line.honestSignCode ? '<span class="ct-receipt-badge ct-receipt-badge--hz" title="Марка Честный Знак">ЧЗ</span>' : ''}
        </span>
        <span class="ct-receipt-discount-col">${discountBadge}</span>
        <div class="ct-receipt-qty">
          <button type="button" class="ct-qty-btn btn-press" data-action="line-minus" data-id="${escAttr(line.id)}">${TOOL_ICONS.minus}</button>
          <button type="button" class="ct-qty-value btn-press" data-action="line-qty-input" data-id="${escAttr(line.id)}" aria-label="Изменить количество">${line.quantity}</button>
          <button type="button" class="ct-qty-btn btn-press" data-action="line-plus" data-id="${escAttr(line.id)}">${TOOL_ICONS.plus}</button>
        </div>
        <button type="button" class="ct-receipt-delete btn-press" data-action="line-delete" data-id="${escAttr(line.id)}" aria-label="Удалить">${TOOL_ICONS.trash}</button>
        <span class="ct-receipt-price">${formatMoneyShort(lineTotal)}</span>
      </div>
    `;
  }

  const componentsHtml = components.map(component => `
    <div class="ct-receipt-component">
      <span class="ct-receipt-component__name">
        <span class="ct-receipt-component__corner" aria-hidden="true">↳</span>${esc(component.itemName || '—')}
      </span>
    </div>
  `).join('');

  return `
    <div class="ct-receipt-item ct-receipt-item--composite ${selectedClass}" data-line-id="${escAttr(line.id)}">
      ${parentRow}
      <div class="ct-receipt-components">
        ${componentsHtml}
      </div>
    </div>
  `;
}
