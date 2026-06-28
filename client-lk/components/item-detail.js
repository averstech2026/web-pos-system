/**
 * Item detail modal — opens on photo tap in menu grid.
 * @param {object} item — Firestore item doc
 * @param {{ imageUrl: string|null, emoji: string, getQty: () => number, onAdd: () => void, onDec: () => void }} ctx
 */
import { renderNutritionGrid } from '../../shared/nutrition.js';

export function renderItemDetailModal(item, { imageUrl, emoji, getQty }) {
  const qty = getQty();
  const media = imageUrl
    ? `<img class="item-detail-image" src="${imageUrl}" alt="${item.name}" />`
    : `<div class="item-detail-emoji">${emoji}</div>`;

  const actionHtml = qty === 0
    ? `<button class="btn btn-primary btn-pill btn-press item-detail-add" type="button" id="item-detail-add">В корзину</button>`
    : `<div class="item-detail-qty">
         <button class="qty-btn btn-press" type="button" id="item-detail-dec">−</button>
         <span class="qty-val" id="item-detail-qty">${qty}</span>
         <button class="qty-btn btn-press" type="button" id="item-detail-inc">+</button>
       </div>`;

  return `
    <div class="modal-overlay" id="item-detail-modal" role="dialog" aria-modal="true">
      <div class="modal card item-detail-modal">
        <div class="modal-header">
          <span class="modal-title">Блюдо</span>
          <button class="modal-close" id="btn-item-detail-close" type="button" aria-label="Закрыть">✕</button>
        </div>

        <div class="item-detail-body">
          <div class="item-detail-media">${media}</div>

          <span class="item-detail-category">${item.category}</span>
          <h2 class="item-detail-name">${item.name}</h2>
          <div class="item-detail-price">${item.price} ₽</div>

          ${item.description ? `
            <div class="item-detail-section">
              <div class="item-detail-section-title">Состав</div>
              <p class="item-detail-desc">${item.description}</p>
            </div>
          ` : ''}

          ${renderNutritionSection(item)}
        </div>

        <div class="item-detail-footer" id="item-detail-action">${actionHtml}</div>
      </div>
    </div>
  `;
}

function renderNutritionSection(item) {
  const grid = renderNutritionGrid(item.nutrition);
  if (!grid) return '';
  return `
    <div class="item-detail-section">
      <div class="item-detail-section-title">Пищевая ценность на порцию</div>
      ${grid}
    </div>
  `;
}

function bindActionButtons({ onAdd, onDec, refreshAction }) {
  document.getElementById('item-detail-add')?.addEventListener('click', () => {
    onAdd();
    refreshAction();
  });
  document.getElementById('item-detail-dec')?.addEventListener('click', () => {
    onDec();
    refreshAction();
  });
  document.getElementById('item-detail-inc')?.addEventListener('click', () => {
    onAdd();
    refreshAction();
  });
}

/** Mount modal and wire handlers */
export function openItemDetailModal(item, ctx) {
  document.getElementById('item-detail-modal')?.remove();

  const mount = () => {
    document.body.insertAdjacentHTML('beforeend', renderItemDetailModal(item, ctx));
  };

  const refreshAction = () => {
    const wrap = document.getElementById('item-detail-action');
    if (!wrap) return;
    const qty = ctx.getQty();
    wrap.innerHTML = qty === 0
      ? `<button class="btn btn-primary btn-pill btn-press item-detail-add" type="button" id="item-detail-add">В корзину</button>`
      : `<div class="item-detail-qty">
           <button class="qty-btn btn-press" type="button" id="item-detail-dec">−</button>
           <span class="qty-val" id="item-detail-qty">${qty}</span>
           <button class="qty-btn btn-press" type="button" id="item-detail-inc">+</button>
         </div>`;
    bindActionButtons({ ...ctx, refreshAction });
  };

  mount();

  const modal = document.getElementById('item-detail-modal');
  const hide = () => modal?.remove();

  document.getElementById('btn-item-detail-close').addEventListener('click', hide);
  modal.addEventListener('click', e => {
    if (e.target === modal) hide();
  });

  bindActionButtons({ ...ctx, refreshAction });
}
