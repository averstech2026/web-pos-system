const SEARCH_ICON = `<svg class="cgms-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

/** @param {HTMLElement} dropdown @param {HTMLElement} anchor */
function positionFloatingDropdown(dropdown, anchor) {
  const rect = anchor.getBoundingClientRect();
  const padding = 8;
  const spaceBelow = window.innerHeight - rect.bottom - padding;
  const maxHeight = Math.min(240, Math.max(120, spaceBelow - 4));

  dropdown.classList.add('pcs-dropdown--floating');
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${Math.max(padding, rect.left)}px`;
  dropdown.style.width = `${Math.min(rect.width, window.innerWidth - padding * 2)}px`;
  dropdown.style.maxHeight = `${maxHeight}px`;
  dropdown.style.right = 'auto';
  dropdown.style.zIndex = '600';
}

/** @param {HTMLElement} dropdown */
function resetFloatingDropdown(dropdown) {
  dropdown.classList.remove('pcs-dropdown--floating');
  dropdown.style.position = '';
  dropdown.style.top = '';
  dropdown.style.left = '';
  dropdown.style.width = '';
  dropdown.style.maxHeight = '';
  dropdown.style.right = '';
  dropdown.style.zIndex = '';
}

/**
 * @param {HTMLElement} anchor
 * @param {() => void} onReposition
 */
function bindDropdownReposition(anchor, onReposition) {
  const handler = () => onReposition();
  window.addEventListener('scroll', handler, true);
  window.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('scroll', handler, true);
    window.removeEventListener('resize', handler);
  };
}

/**
 * @param {HTMLElement} field
 * @param {(e: MouseEvent) => void} onOutside
 */
function bindOutsideClose(field, onOutside) {
  const handler = (e) => {
    if (!field.contains(e.target)) onOutside();
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}

/**
 * @param {object} p
 * @param {string} p.fieldKey
 * @param {string} [p.label]
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {string[]} [p.selectedIds]
 * @param {string} [p.placeholder]
 */
export function renderProductCatalogMultiSelect({
  fieldKey,
  label = '',
  items = [],
  selectedIds = [],
  placeholder = 'Поиск и добавление товаров...',
}) {
  const selected = new Set(selectedIds.filter(Boolean));
  const selectedItems = items.filter(item => selected.has(item.id));

  return `
    <div class="admin-field-block cgms-field pcs-field" data-pcs-field="${escAttr(fieldKey)}">
      ${label ? `<span class="admin-field-label">${esc(label)}</span>` : ''}
      <div class="cgms-combobox" data-pcs-combobox>
        <div class="cgms-input-wrap">
          ${selectedItems.map(item => `
            <span class="cgms-tag" data-cgms-tag="${escAttr(item.id)}">
              <span class="cgms-tag__label">${esc(item.name || '—')}</span>
              <button
                type="button"
                class="cgms-tag__remove btn-press"
                data-action="pcs-remove"
                data-item-id="${escAttr(item.id)}"
                aria-label="Убрать «${escAttr(item.name || '—')}»"
              >&times;</button>
            </span>
          `).join('')}
          <span class="cgms-search-row">
            ${SEARCH_ICON}
            <input
              type="search"
              class="cgms-search"
              data-pcs-search
              placeholder="${escAttr(placeholder)}"
              autocomplete="off"
              aria-label="${escAttr(placeholder)}"
            />
          </span>
        </div>
        <div class="cgms-dropdown" data-pcs-dropdown hidden>
          ${renderMultiDropdownOptions(items, selected, '')}
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {object} p
 * @param {string} p.fieldKey
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {string} [p.selectedId]
 * @param {string} [p.placeholder]
 */
export function renderProductCatalogSingleSelect({
  fieldKey,
  items = [],
  selectedId = '',
  placeholder = 'Поиск товара...',
}) {
  const selected = items.find(item => item.id === selectedId);

  return `
    <div class="pcs-single" data-pcs-single="${escAttr(fieldKey)}" data-selected-id="${escAttr(selectedId)}">
      <div class="cgms-combobox pcs-single-combobox" data-pcs-single-combobox>
        <div class="cgms-input-wrap pcs-single-input-wrap">
          ${selected
            ? `<span class="pcs-single-value">${esc(selected.name || '—')}</span>`
            : ''}
          <span class="cgms-search-row pcs-single-search-row">
            ${SEARCH_ICON}
            <input
              type="search"
              class="cgms-search pcs-single-search"
              data-pcs-single-search
              placeholder="${escAttr(selected ? selected.name : placeholder)}"
              autocomplete="off"
              aria-label="${escAttr(placeholder)}"
            />
          </span>
        </div>
        <div class="cgms-dropdown" data-pcs-single-dropdown hidden>
          ${renderSingleDropdownOptions(items, selectedId, '')}
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {Array<{ id: string, name?: string, category?: string }>} items
 * @param {Set<string>} selected
 * @param {string} query
 */
function renderMultiDropdownOptions(items, selected, query) {
  const q = query.trim().toLowerCase();
  const filtered = items.filter(item => {
    if (selected.has(item.id)) return false;
    if (!q) return true;
    return item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    return `<p class="cgms-empty">${q ? 'Ничего не найдено' : 'Все товары уже выбраны'}</p>`;
  }

  return `
    <ul class="cgms-options" role="listbox">
      ${filtered.map(item => `
        <li>
          <button
            type="button"
            class="cgms-option btn-press"
            data-action="pcs-add"
            data-item-id="${escAttr(item.id)}"
            role="option"
          >
            <span class="pcs-option-name">${esc(item.name || '—')}</span>
            ${item.category ? `<span class="pcs-option-cat">${esc(item.category)}</span>` : ''}
          </button>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * @param {Array<{ id: string, name?: string, category?: string }>} items
 * @param {string} selectedId
 * @param {string} query
 */
function renderSingleDropdownOptions(items, selectedId, query) {
  const q = query.trim().toLowerCase();
  const filtered = items.filter(item => {
    if (!q) return true;
    return item.name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    return `<p class="cgms-empty">Ничего не найдено</p>`;
  }

  return `
    <ul class="cgms-options" role="listbox">
      ${filtered.map(item => `
        <li>
          <button
            type="button"
            class="cgms-option btn-press ${item.id === selectedId ? 'pcs-option--active' : ''}"
            data-action="pcs-single-pick"
            data-item-id="${escAttr(item.id)}"
            role="option"
          >
            <span class="pcs-option-name">${esc(item.name || '—')}</span>
            ${item.category ? `<span class="pcs-option-cat">${esc(item.category)}</span>` : ''}
          </button>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {object} p
 * @param {string} p.fieldKey
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {() => void} [p.onChange]
 */
export function bindProductCatalogMultiSelect(root, { fieldKey, items, onChange }) {
  const field = root.querySelector(`[data-pcs-field="${CSS.escape(fieldKey)}"]`);
  if (!field) return { readSelectedIds: () => [] };

  const combobox = field.querySelector('[data-pcs-combobox]');
  const searchInput = field.querySelector('[data-pcs-search]');
  const dropdown = field.querySelector('[data-pcs-dropdown]');
  if (!combobox || !searchInput || !dropdown) return { readSelectedIds: () => [] };

  /** @type {Set<string>} */
  const selected = new Set(
    [...field.querySelectorAll('[data-cgms-tag]')]
      .map(el => el.dataset.cgmsTag)
      .filter(Boolean),
  );

  function readSelectedIds() {
    return [...selected];
  }

  function itemsById() {
    return new Map(items.map(item => [item.id, item]));
  }

  function renderTags() {
    const wrap = combobox.querySelector('.cgms-input-wrap');
    const searchRow = combobox.querySelector('.cgms-search-row');
    if (!wrap || !searchRow) return;

    wrap.querySelectorAll('[data-cgms-tag]').forEach(el => el.remove());

    const map = itemsById();
    for (const id of selected) {
      const item = map.get(id);
      if (!item) continue;
      const tag = document.createElement('span');
      tag.className = 'cgms-tag';
      tag.dataset.cgmsTag = id;
      tag.innerHTML = `
        <span class="cgms-tag__label">${esc(item.name || '—')}</span>
        <button
          type="button"
          class="cgms-tag__remove btn-press"
          data-action="pcs-remove"
          data-item-id="${escAttr(id)}"
          aria-label="Убрать «${escAttr(item.name || '—')}»"
        >&times;</button>
      `;
      wrap.insertBefore(tag, searchRow);
    }
  }

  function refreshDropdown() {
    dropdown.innerHTML = renderMultiDropdownOptions(items, selected, searchInput.value);
  }

  function openDropdown() {
    dropdown.hidden = false;
    combobox.classList.add('cgms-combobox--open');
    refreshDropdown();
    positionFloatingDropdown(dropdown, combobox.querySelector('.cgms-input-wrap') || combobox);
  }

  function closeDropdown() {
    dropdown.hidden = true;
    combobox.classList.remove('cgms-combobox--open');
    resetFloatingDropdown(dropdown);
  }

  const stopReposition = bindDropdownReposition(combobox, () => {
    if (!dropdown.hidden) {
      positionFloatingDropdown(dropdown, combobox.querySelector('.cgms-input-wrap') || combobox);
    }
  });
  const stopOutside = bindOutsideClose(field, closeDropdown);

  function addItem(id) {
    if (!id || selected.has(id)) return;
    selected.add(id);
    renderTags();
    searchInput.value = '';
    refreshDropdown();
    onChange?.();
  }

  function removeItem(id) {
    if (!selected.delete(id)) return;
    renderTags();
    refreshDropdown();
    onChange?.();
  }

  searchInput.addEventListener('focus', openDropdown);
  searchInput.addEventListener('input', () => {
    openDropdown();
    refreshDropdown();
  });

  combobox.addEventListener('mousedown', e => {
    if (e.target.closest('[data-pcs-search], .cgms-search-row, .cgms-input-wrap')) {
      openDropdown();
    }
  });

  combobox.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-action="pcs-add"]');
    if (addBtn) {
      e.preventDefault();
      addItem(addBtn.dataset.itemId || '');
      searchInput.focus();
      return;
    }

    const removeBtn = e.target.closest('[data-action="pcs-remove"]');
    if (removeBtn) {
      e.preventDefault();
      removeItem(removeBtn.dataset.itemId || '');
    }
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDropdown();
      searchInput.blur();
      return;
    }
    if (e.key === 'Backspace' && !searchInput.value && selected.size) {
      const last = [...selected].pop();
      if (last) removeItem(last);
    }
  });

  return {
    readSelectedIds,
    destroy() {
      stopReposition();
      stopOutside();
    },
  };
}

/**
 * @param {HTMLElement} root
 * @param {object} p
 * @param {string} p.fieldKey
 * @param {Array<{ id: string, name?: string, category?: string }>} p.items
 * @param {() => void} [p.onChange]
 */
export function bindProductCatalogSingleSelect(root, { fieldKey, items, onChange }) {
  const field = root.querySelector(`[data-pcs-single="${CSS.escape(fieldKey)}"]`);
  if (!field) return { readSelectedId: () => '' };

  const combobox = field.querySelector('[data-pcs-single-combobox]');
  const searchInput = field.querySelector('[data-pcs-single-search]');
  const dropdown = field.querySelector('[data-pcs-single-dropdown]');
  const inputWrap = field.querySelector('.pcs-single-input-wrap');
  if (!combobox || !searchInput || !dropdown || !inputWrap) return { readSelectedId: () => '' };

  let selectedId = field.dataset.selectedId || '';

  function readSelectedId() {
    return selectedId;
  }

  function itemsById() {
    return new Map(items.map(item => [item.id, item]));
  }

  function renderSelected() {
    const selected = itemsById().get(selectedId);
    inputWrap.querySelector('.pcs-single-value')?.remove();
    if (selected) {
      const valueEl = document.createElement('span');
      valueEl.className = 'pcs-single-value';
      valueEl.textContent = selected.name || '—';
      const searchRow = inputWrap.querySelector('.pcs-single-search-row');
      if (searchRow) inputWrap.insertBefore(valueEl, searchRow);
      searchInput.placeholder = selected.name || 'Поиск товара...';
    } else {
      searchInput.placeholder = 'Поиск товара...';
    }
    field.dataset.selectedId = selectedId;
  }

  function refreshDropdown() {
    dropdown.innerHTML = renderSingleDropdownOptions(items, selectedId, searchInput.value);
  }

  function openDropdown() {
    dropdown.hidden = false;
    combobox.classList.add('cgms-combobox--open');
    inputWrap.querySelector('.pcs-single-value')?.classList.add('pcs-single-value--hidden');
    refreshDropdown();
    positionFloatingDropdown(dropdown, inputWrap);
  }

  function closeDropdown() {
    dropdown.hidden = true;
    combobox.classList.remove('cgms-combobox--open');
    inputWrap.querySelector('.pcs-single-value')?.classList.remove('pcs-single-value--hidden');
    resetFloatingDropdown(dropdown);
  }

  const stopReposition = bindDropdownReposition(inputWrap, () => {
    if (!dropdown.hidden) positionFloatingDropdown(dropdown, inputWrap);
  });
  const stopOutside = bindOutsideClose(field, closeDropdown);

  function pickItem(id) {
    selectedId = id;
    searchInput.value = '';
    renderSelected();
    closeDropdown();
    onChange?.();
  }

  searchInput.addEventListener('focus', () => {
    searchInput.value = '';
    openDropdown();
  });
  searchInput.addEventListener('input', () => {
    openDropdown();
    refreshDropdown();
  });

  combobox.addEventListener('mousedown', e => {
    if (e.target.closest('[data-pcs-single-search], .pcs-single-search-row, .cgms-input-wrap')) {
      e.preventDefault();
      searchInput.focus();
      openDropdown();
    }
  });

  combobox.addEventListener('click', e => {
    const pickBtn = e.target.closest('[data-action="pcs-single-pick"]');
    if (pickBtn) {
      e.preventDefault();
      pickItem(pickBtn.dataset.itemId || '');
    }
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDropdown();
      searchInput.blur();
    }
  });

  renderSelected();

  return {
    readSelectedId,
    destroy() {
      stopReposition();
      stopOutside();
    },
  };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
