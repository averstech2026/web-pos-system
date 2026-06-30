import { batchSetItemCategories } from '../services/products-data.js';

/**
 * @param {object} p
 * @param {string} p.groupName
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {(updates: Array<{ id: string, category: string }>) => void|Promise<void>} [p.onApplied]
 * @param {boolean} [p.deferPersistence] — only update in-memory state; persist on parent Save
 */
export function openGroupProductsPickerModal({ groupName, items, onApplied, deferPersistence = false }) {
  document.getElementById('group-products-picker-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'group-products-picker-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  /** @type {Set<string>} */
  let selectedIds = new Set(items.filter(i => i.category === groupName).map(i => i.id));
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
    return sorted.filter(i => i.name?.toLowerCase().includes(q));
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
    const list = overlay.querySelector('#gpp-list');
    if (!list) return;

    const filtered = filteredItems();
    if (!filtered.length) {
      list.innerHTML = '<p class="gpp-empty">Товары не найдены</p>';
      return;
    }

    list.innerHTML = filtered.map(item => {
      const inGroup = item.category === groupName;
      const otherCat = item.category && !inGroup ? item.category : '';
      return `
        <label class="gpp-option">
          <input
            type="checkbox"
            data-product-id="${escAttr(item.id)}"
            ${selectedIds.has(item.id) ? 'checked' : ''}
          />
          <span class="gpp-option-name">${esc(item.name || '—')}</span>
          ${otherCat ? `<span class="gpp-option-cat">${esc(otherCat)}</span>` : ''}
        </label>
      `;
    }).join('');
  }

  function updateApplyBtn() {
    const btn = overlay.querySelector('#gpp-apply');
    if (btn) btn.textContent = applyCountLabel(selectedIds.size);
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md gpp-modal" role="document">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Добавить товары в «${esc(groupName)}»</h2>
          <button type="button" class="admin-modal-close btn-press" id="gpp-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body gpp-modal-body">
          <input
            type="search"
            class="gpp-search"
            id="gpp-search"
            placeholder="Поиск по названию…"
            value="${escAttr(search)}"
            autofocus
          />
          <div class="gpp-list-wrap">
            <div class="gpp-list" id="gpp-list"></div>
          </div>
          <p class="ifm-error" id="gpp-error" hidden></p>
        </div>
        <div class="admin-modal-foot gpp-modal-foot">
          <p class="gpp-hint">Отметьте товары, которые должны входить в группу. Снятая галочка у текущих товаров группы перенесёт их в «Прочее».</p>
          <div class="gpp-modal-actions">
            <button type="button" class="action-btn action-btn-secondary btn-press" id="gpp-cancel">Отмена</button>
            <button type="button" class="action-btn action-btn-primary btn-press" id="gpp-apply">${applyCountLabel(selectedIds.size)}</button>
          </div>
        </div>
      </div>
    `;

    renderList();
    bindEvents();
  }

  function bindEvents() {
    const dialog = overlay.querySelector('.admin-modal');

    overlay.querySelector('#gpp-close')?.addEventListener('click', close);
    overlay.querySelector('#gpp-cancel')?.addEventListener('click', close);
    overlay.querySelector('#gpp-apply')?.addEventListener('click', apply);

    overlay.querySelector('#gpp-search')?.addEventListener('input', e => {
      search = e.target.value;
      renderList();
    });

    overlay.querySelector('#gpp-list')?.addEventListener('change', e => {
      if (!e.target.matches('[data-product-id]')) return;
      const id = e.target.dataset.productId;
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateApplyBtn();
    });

    dialog?.addEventListener('click', e => e.stopPropagation());
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  async function apply() {
    const errEl = overlay.querySelector('#gpp-error');
    const btn = overlay.querySelector('#gpp-apply');
    if (errEl) errEl.hidden = true;

    /** @type {Array<{ id: string, category: string }>} */
    const updates = [];

    for (const item of items) {
      const selected = selectedIds.has(item.id);
      const inGroup = item.category === groupName;

      if (selected && !inGroup) {
        updates.push({ id: item.id, category: groupName });
      } else if (!selected && inGroup) {
        updates.push({ id: item.id, category: 'Прочее' });
      }
    }

    if (btn) btn.disabled = true;

    try {
      if (!deferPersistence && updates.length) {
        await batchSetItemCategories(updates);
      }
      close();
      await onApplied?.(updates);
    } catch (err) {
      console.error('[group-products-picker]', err);
      if (errEl) {
        errEl.textContent = err.message || 'Не удалось обновить состав группы';
        errEl.hidden = false;
      }
      if (btn) btn.disabled = false;
    }
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
