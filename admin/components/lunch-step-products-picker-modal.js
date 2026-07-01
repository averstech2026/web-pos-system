/**
 * Pick catalog items for a lunch step.
 * @param {object} p
 * @param {string} p.stepName
 * @param {string[]} p.selectedIds
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {(itemIds: string[]) => void|Promise<void>} [p.onApplied]
 */
export function openLunchStepProductsPickerModal({ stepName, selectedIds: initialIds, items, onApplied }) {
  document.getElementById('lunch-step-products-picker-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'lunch-step-products-picker-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  /** @type {Set<string>} */
  let selectedIds = new Set(initialIds || []);
  let search = '';

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function filteredItems() {
    const q = search.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    if (!q) return sorted;
    return sorted.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
  }

  function applyCountLabel(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'товар'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'товара'
        : 'товаров';
    return `Применить (${n} ${word})`;
  }

  function renderList() {
    const list = overlay.querySelector('#lsp-list');
    if (!list) return;

    const filtered = filteredItems();
    if (!filtered.length) {
      list.innerHTML = '<p class="gpp-empty">Товары не найдены</p>';
      return;
    }

    list.innerHTML = filtered.map(item => `
      <label class="gpp-option">
        <input
          type="checkbox"
          data-product-id="${escAttr(item.id)}"
          ${selectedIds.has(item.id) ? 'checked' : ''}
        />
        <span class="gpp-option-name">${esc(item.name || '—')}</span>
        ${item.category ? `<span class="gpp-option-cat">${esc(item.category)}</span>` : ''}
      </label>
    `).join('');
  }

  function updateApplyBtn() {
    const btn = overlay.querySelector('#lsp-apply');
    if (btn) btn.textContent = applyCountLabel(selectedIds.size);
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md gpp-modal" role="document">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Товары для «${esc(stepName)}»</h2>
          <button type="button" class="admin-modal-close btn-press" id="lsp-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body gpp-modal-body">
          <input
            type="search"
            class="gpp-search"
            id="lsp-search"
            placeholder="Поиск по названию…"
            value="${escAttr(search)}"
            autofocus
          />
          <div class="gpp-list-wrap">
            <div class="gpp-list" id="lsp-list"></div>
          </div>
          <p class="ifm-error" id="lsp-error" hidden></p>
        </div>
        <div class="admin-modal-foot gpp-modal-foot">
          <p class="gpp-hint">Отметьте блюда, которые гость сможет выбрать на этом шаге обеда.</p>
          <div class="gpp-modal-actions">
            <button type="button" class="action-btn action-btn-secondary btn-press" id="lsp-cancel">Отмена</button>
            <button type="button" class="action-btn action-btn-primary btn-press" id="lsp-apply">${applyCountLabel(selectedIds.size)}</button>
          </div>
        </div>
      </div>
    `;

    renderList();
    bindEvents();
  }

  function bindEvents() {
    overlay.querySelector('#lsp-close')?.addEventListener('click', close);
    overlay.querySelector('#lsp-cancel')?.addEventListener('click', close);
    overlay.querySelector('#lsp-search')?.addEventListener('input', e => {
      search = e.target.value;
      renderList();
    });

    overlay.querySelector('#lsp-list')?.addEventListener('change', e => {
      const cb = e.target.closest('[data-product-id]');
      if (!cb) return;
      const id = cb.dataset.productId;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateApplyBtn();
    });

    overlay.querySelector('#lsp-apply')?.addEventListener('click', async () => {
      await onApplied?.([...selectedIds]);
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
