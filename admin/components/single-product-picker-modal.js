/**
 * Single-product picker modal — reuses gpp-modal styles from group products picker.
 *
 * @param {object} p
 * @param {string} [p.title]
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {string} [p.selectedId]
 * @param {(itemId: string) => void|Promise<void>} p.onSelect
 */
export function openSingleProductPickerModal({
  title = 'Выбрать товар',
  items,
  selectedId: initialId = '',
  onSelect,
}) {
  document.getElementById('single-product-picker-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'single-product-picker-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let selectedId = initialId || '';
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
    return sorted.filter(i =>
      i.name?.toLowerCase().includes(q)
      || i.category?.toLowerCase().includes(q),
    );
  }

  function applyLabel() {
    return selectedId ? 'Применить (1 товар)' : 'Применить';
  }

  function renderList() {
    const list = overlay.querySelector('#spp-list');
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
          ${item.id === selectedId ? 'checked' : ''}
        />
        <span class="gpp-option-name">${esc(item.name || '—')}</span>
        ${item.category ? `<span class="gpp-option-cat">${esc(item.category)}</span>` : ''}
      </label>
    `).join('');
  }

  function updateApplyBtn() {
    const btn = overlay.querySelector('#spp-apply');
    if (btn) {
      btn.textContent = applyLabel();
      btn.disabled = !selectedId;
    }
  }

  function selectProduct(id) {
    selectedId = id;
    overlay.querySelectorAll('[data-product-id]').forEach(inp => {
      inp.checked = inp.dataset.productId === id;
    });
    updateApplyBtn();
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md gpp-modal" role="document">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">${esc(title)}</h2>
          <button type="button" class="admin-modal-close btn-press" id="spp-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body gpp-modal-body">
          <input
            type="search"
            class="gpp-search"
            id="spp-search"
            placeholder="Поиск по названию…"
            value="${escAttr(search)}"
            autofocus
          />
          <div class="gpp-list-wrap">
            <div class="gpp-list" id="spp-list"></div>
          </div>
        </div>
        <div class="admin-modal-foot gpp-modal-foot">
          <p class="gpp-hint">Выберите один товар из списка. Отметьте строку или нажмите на чекбокс.</p>
          <div class="gpp-modal-actions">
            <button type="button" class="btn btn-outline btn-press" id="spp-cancel">Отмена</button>
            <button type="button" class="btn btn-primary btn-press" id="spp-apply" ${selectedId ? '' : 'disabled'}>
              ${applyLabel()}
            </button>
          </div>
        </div>
      </div>
    `;

    renderList();
    bindEvents();
  }

  function bindEvents() {
    const dialog = overlay.querySelector('.admin-modal');

    overlay.querySelector('#spp-close')?.addEventListener('click', close);
    overlay.querySelector('#spp-cancel')?.addEventListener('click', close);
    overlay.querySelector('#spp-apply')?.addEventListener('click', apply);

    overlay.querySelector('#spp-search')?.addEventListener('input', e => {
      search = e.target.value;
      renderList();
    });

    overlay.querySelector('#spp-list')?.addEventListener('change', e => {
      if (!e.target.matches('[data-product-id]')) return;
      if (e.target.checked) {
        selectProduct(e.target.dataset.productId);
      } else if (e.target.dataset.productId === selectedId) {
        selectedId = '';
        updateApplyBtn();
      }
    });

    overlay.querySelector('#spp-list')?.addEventListener('click', e => {
      const row = e.target.closest('.gpp-option');
      if (!row || e.target.matches('[data-product-id]')) return;
      const input = row.querySelector('[data-product-id]');
      if (input) selectProduct(input.dataset.productId);
    });

    dialog?.addEventListener('click', e => e.stopPropagation());
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  function apply() {
    if (!selectedId) return;
    close();
    onSelect?.(selectedId);
  }

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);
  render();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
