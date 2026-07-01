/**
 * Step-by-step composite lunch picker (kiosk / web).
 * @param {object} p
 * @param {import('./composite-meals.js').CompositeLunchItem} p.lunch
 * @param {Array<{ id: string, name?: string, price?: number, imageUrl?: string }>} p.catalogItems
 * @param {(selections: Array<{ stepId: string, stepName: string, itemId: string, itemName: string }>) => void} p.onConfirm
 * @param {() => string} [p.resolveImageUrl]
 */
export function openCompositeLunchModal({ lunch, catalogItems, onConfirm, resolveImageUrl }) {
  document.getElementById('composite-lunch-modal')?.remove();

  const itemsById = new Map(catalogItems.map(i => [i.id, i]));
  const steps = lunch.lunchSteps || [];
  /** @type {Record<string, string>} */
  let picks = {};

  const overlay = document.createElement('div');
  overlay.className = 'composite-lunch-overlay';
  overlay.id = 'composite-lunch-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function allPicked() {
    return steps.every(step => picks[step.id]);
  }

  function renderOptions(step) {
    return (step.itemIds || []).map(itemId => {
      const item = itemsById.get(itemId);
      if (!item) return '';
      const active = picks[step.id] === itemId;
      const image = resolveImageUrl?.(item) || '';
      return `
        <button
          type="button"
          class="composite-lunch-option btn-press ${active ? 'composite-lunch-option--active' : ''}"
          data-step-id="${escAttr(step.id)}"
          data-item-id="${escAttr(itemId)}"
        >
          ${image ? `<img class="composite-lunch-option__img" src="${escAttr(image)}" alt="" />` : '<span class="composite-lunch-option__emoji" aria-hidden="true">🍽</span>'}
          <span class="composite-lunch-option__name">${esc(item.name || '—')}</span>
        </button>
      `;
    }).join('');
  }

  function render() {
    overlay.innerHTML = `
      <div class="composite-lunch-modal card" role="document">
        <div class="composite-lunch-head">
          <div>
            <span class="composite-lunch-badge">Комплекс</span>
            <h2 class="composite-lunch-title">${esc(lunch.name)}</h2>
            <p class="composite-lunch-price">${esc(String(lunch.price))} ₽</p>
          </div>
          <button type="button" class="composite-lunch-close btn-press" data-action="close" aria-label="Закрыть">✕</button>
        </div>
        <div class="composite-lunch-body">
          ${steps.map((step, index) => `
            <section class="composite-lunch-step">
              <h3 class="composite-lunch-step-title">Шаг ${index + 1}: ${esc(step.name)}</h3>
              <div class="composite-lunch-options">${renderOptions(step)}</div>
            </section>
          `).join('')}
        </div>
        <div class="composite-lunch-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" data-action="close">Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" data-action="confirm" ${allPicked() ? '' : 'disabled'}>
            Добавить в корзину
          </button>
        </div>
      </div>
    `;
    bindEvents();
  }

  function bindEvents() {
    overlay.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', close);
    });

    overlay.querySelectorAll('.composite-lunch-option').forEach(btn => {
      btn.addEventListener('click', () => {
        picks[btn.dataset.stepId] = btn.dataset.itemId;
        render();
      });
    });

    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      if (!allPicked()) return;
      const selections = steps.map(step => {
        const itemId = picks[step.id];
        const item = itemsById.get(itemId);
        return {
          stepId: step.id,
          stepName: step.name,
          itemId,
          itemName: item?.name || '—',
        };
      });
      onConfirm(selections);
      close();
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  render();
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
