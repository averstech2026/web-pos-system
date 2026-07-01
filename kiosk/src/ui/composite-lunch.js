import { openCompositeLunchModal } from '@shared/composite-lunch-flow.js';
import { getItemImageUrl, resolveProductImageUrl } from '@shared/item-images.js';
import { PRODUCTS, CATALOG_LOOKUP } from '../services/catalog.js';
import { addToCart } from '../core/cart.js';
import { state } from '../core/state.js';

function resolveImage(item) {
  return resolveProductImageUrl(item.imageUrl || item.image) || getItemImageUrl(item.name) || '';
}

/**
 * @param {string} productId
 */
export function tryAddProductToCart(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  if (product.isComposite && product.lunchSteps?.length) {
    openCompositeLunchModal({
      lunch: product,
      catalogItems: [...CATALOG_LOOKUP.values()],
      resolveImageUrl: item => resolveImage(item),
      onConfirm: selections => {
        if (!state.compositeSelections) state.compositeSelections = {};
        state.compositeSelections[productId] = selections;
        addToCart(productId);
      },
    });
    return;
  }

  addToCart(productId);
}

/**
 * @param {string} productId
 */
export function tryOpenProduct(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  if (product.isComposite && product.lunchSteps?.length) {
    tryAddProductToCart(productId);
    return;
  }

  return false;
}
