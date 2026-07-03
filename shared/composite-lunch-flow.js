/**
 * Step-by-step composite lunch picker (kiosk / web / POS).
 * @param {object} p
 * @param {import('./composite-meals.js').CompositeLunchItem} p.lunch
 * @param {Array<{ id: string, name?: string, price?: number, imageUrl?: string }>} p.catalogItems
 * @param {(selections: Array<{ stepId: string, stepName: string, itemId: string, itemName: string }>) => void} p.onConfirm
 * @param {() => string} [p.resolveImageUrl]
 * @param {'default'|'pos'} [p.variant]
 */
export function openCompositeLunchModal({
  lunch,
  catalogItems,
  onConfirm,
  resolveImageUrl,
  variant = 'default',
}) {
  document.getElementById('composite-lunch-modal')?.remove();

  const isPos = variant === 'pos';
  const itemsById = new Map(catalogItems.map(i => [i.id, i]));
  const steps = lunch.lunchSteps || [];
  /** @type {Record<string, string[]>} */
  let picks = {};
  let currentStepIndex = 0;

  steps.forEach(step => {
    picks[step.id] = [];
  });

  const overlay = document.createElement('div');
  overlay.className = `composite-lunch-overlay${isPos ? ' composite-lunch-overlay--pos' : ''}`;
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

  function stepLimits(step) {
    const minPick = Math.max(1, Number(step.minPick) || 1);
    const maxPick = Math.max(minPick, Number(step.maxPick) || 1);
    return { minPick, maxPick };
  }

  function stepReady(step) {
    const { minPick } = stepLimits(step);
    return (picks[step.id] || []).length >= minPick;
  }

  function allPicked() {
    return steps.every(step => stepReady(step));
  }

  function visibleSteps() {
    if (isPos && steps.length) return [steps[currentStepIndex]];
    return steps;
  }

  function confirmButtonLabel() {
    if (!isPos) return 'Добавить в корзину';
    return currentStepIndex >= steps.length - 1 ? 'ПРИМЕНИТЬ' : 'ДАЛЕЕ';
  }

  function canConfirm() {
    if (isPos) {
      const step = steps[currentStepIndex];
      return step ? stepReady(step) : false;
    }
    return allPicked();
  }

  function renderStepHint(step) {
    const { minPick, maxPick } = stepLimits(step);
    const count = (picks[step.id] || []).length;
    if (minPick === maxPick) {
      return `Выберите ${minPick} ${minPick === 1 ? 'позицию' : 'позиции'}`;
    }
    return `Выбрано ${count} из ${minPick}–${maxPick}`;
  }

  function renderStepHeading(step, index) {
    const stepNumber = isPos ? currentStepIndex + 1 : index + 1;
    const hint = renderStepHint(step);
    if (isPos) {
      return `
        <h3 class="composite-lunch-step-title composite-lunch-step-title--pos">
          <span class="composite-lunch-step-title__label">Шаг ${stepNumber}: ${esc(step.name)}</span>
          <span class="composite-lunch-step-title__hint">${esc(hint)}</span>
        </h3>
      `;
    }
    return `
      <h3 class="composite-lunch-step-title">Шаг ${stepNumber}: ${esc(step.name)}</h3>
      <p class="composite-lunch-step-hint">${esc(hint)}</p>
    `;
  }

  function renderOptions(step) {
    const selected = new Set(picks[step.id] || []);
    return (step.itemIds || []).map(itemId => {
      const item = itemsById.get(itemId);
      if (!item) return '';
      const active = selected.has(itemId);
      const image = resolveImageUrl?.(item) || '';
      return `
        <button
          type="button"
          class="composite-lunch-option btn-press ${active ? 'composite-lunch-option--active' : ''}"
          data-step-id="${escAttr(step.id)}"
          data-item-id="${escAttr(itemId)}"
        >
          ${image
            ? `<img class="composite-lunch-option__img" src="${escAttr(image)}" alt="" />`
            : '<span class="composite-lunch-option__emoji" aria-hidden="true">🍽</span>'}
          <span class="composite-lunch-option__name">${esc(item.name || '—')}</span>
        </button>
      `;
    }).join('');
  }

  function renderHead() {
    if (isPos) {
      return `
        <div class="composite-lunch-head composite-lunch-head--pos">
          <span class="composite-lunch-badge composite-lunch-badge--pos">Комплекс</span>
          <h2 class="composite-lunch-title composite-lunch-title--pos">${esc(lunch.name)}</h2>
          <p class="composite-lunch-price composite-lunch-price--pos">${esc(formatPrice(lunch.price))}</p>
        </div>
      `;
    }
    return `
      <div class="composite-lunch-head">
        <div>
          <span class="composite-lunch-badge">Комплекс</span>
          <h2 class="composite-lunch-title">${esc(lunch.name)}</h2>
          <p class="composite-lunch-price">${esc(formatPrice(lunch.price))}</p>
        </div>
        <button type="button" class="composite-lunch-close btn-press" data-action="close" aria-label="Закрыть">✕</button>
      </div>
    `;
  }

  function renderFoot() {
    if (isPos) {
      return `
        <div class="composite-lunch-foot composite-lunch-foot--pos">
          <button type="button" class="composite-lunch-btn composite-lunch-btn--close btn-press" data-action="close">ЗАКРЫТЬ</button>
          <button type="button" class="composite-lunch-btn composite-lunch-btn--confirm btn-press" data-action="confirm" ${canConfirm() ? '' : 'disabled'}>
            ${esc(confirmButtonLabel())}
          </button>
        </div>
      `;
    }
    return `
      <div class="composite-lunch-foot">
        <button type="button" class="action-btn action-btn-secondary btn-press" data-action="close">Отмена</button>
        <button type="button" class="action-btn action-btn-primary btn-press" data-action="confirm" ${canConfirm() ? '' : 'disabled'}>
          Добавить в корзину
        </button>
      </div>
    `;
  }

  function render() {
    overlay.innerHTML = `
      <div class="composite-lunch-modal${isPos ? ' composite-lunch-modal--pos' : ' card'}" role="document">
        ${renderHead()}
        <div class="composite-lunch-body${isPos ? ' composite-lunch-body--pos' : ''}">
          ${visibleSteps().map((step, index) => `
            <section class="composite-lunch-step${isPos ? ' composite-lunch-step--pos' : ''}">
              ${renderStepHeading(step, index)}
              <div class="composite-lunch-options${isPos ? ' composite-lunch-options--grid' : ''}">${renderOptions(step)}</div>
            </section>
          `).join('')}
        </div>
        ${renderFoot()}
      </div>
    `;
    bindEvents();
  }

  function togglePick(stepId, itemId) {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    const { maxPick } = stepLimits(step);
    const current = [...(picks[stepId] || [])];
    const index = current.indexOf(itemId);
    if (index >= 0) {
      current.splice(index, 1);
    } else if (maxPick <= 1) {
      picks[stepId] = [itemId];
      render();
      return;
    } else if (current.length < maxPick) {
      current.push(itemId);
    }
    picks[stepId] = current;
    render();
  }

  function finalize() {
    /** @type {Array<{ stepId: string, stepName: string, itemId: string, itemName: string }>} */
    const selections = [];
    steps.forEach(step => {
      (picks[step.id] || []).forEach(itemId => {
        const item = itemsById.get(itemId);
        selections.push({
          stepId: step.id,
          stepName: step.name,
          itemId,
          itemName: item?.name || '—',
        });
      });
    });
    onConfirm(selections);
    close();
  }

  function bindEvents() {
    overlay.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', close);
    });

    overlay.querySelectorAll('.composite-lunch-option').forEach(btn => {
      btn.addEventListener('click', () => {
        togglePick(btn.dataset.stepId || '', btn.dataset.itemId || '');
      });
    });

    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      if (!canConfirm()) return;
      if (isPos && currentStepIndex < steps.length - 1) {
        currentStepIndex += 1;
        render();
        return;
      }
      finalize();
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  render();
}

/** @param {number|string} price */
function formatPrice(price) {
  const n = Number(price) || 0;
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
