const SEARCH_ICON = `<svg class="cgms-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;

/**
 * @param {object} p
 * @param {string} p.fieldName
 * @param {string} [p.label]
 * @param {Array<{ id: string, name: string }>} p.groups
 * @param {string[]} [p.selectedIds]
 * @param {string} [p.placeholder]
 */
export function renderCategoryGroupMultiSelect({
  fieldName,
  label = 'Группы товаров',
  groups = [],
  selectedIds = [],
  placeholder = 'Поиск группы товаров...',
}) {
  const selected = new Set(selectedIds.filter(Boolean));
  const selectedGroups = groups.filter(g => selected.has(g.id));

  return `
    <div class="admin-field-block cgms-field" data-cgms-field="${escAttr(fieldName)}">
      ${label ? `<span class="admin-field-label">${esc(label)}</span>` : ''}
      <div class="cgms-combobox" data-cgms-combobox>
        <div class="cgms-input-wrap">
          ${selectedGroups.map(g => `
            <span class="cgms-tag" data-cgms-tag="${escAttr(g.id)}">
              <span class="cgms-tag__label">${esc(g.name)}</span>
              <button
                type="button"
                class="cgms-tag__remove btn-press"
                data-action="cgms-remove"
                data-group-id="${escAttr(g.id)}"
                aria-label="Убрать «${escAttr(g.name)}»"
              >&times;</button>
            </span>
          `).join('')}
          <span class="cgms-search-row">
            ${SEARCH_ICON}
            <input
              type="search"
              class="cgms-search"
              data-cgms-search
              placeholder="${escAttr(placeholder)}"
              autocomplete="off"
              aria-label="${escAttr(placeholder)}"
            />
          </span>
        </div>
        <div class="cgms-dropdown" data-cgms-dropdown hidden>
          ${renderDropdownOptions(groups, selected, '')}
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {Array<{ id: string, name: string }>} groups
 * @param {Set<string>} selected
 * @param {string} query
 */
function renderDropdownOptions(groups, selected, query) {
  const q = query.trim().toLowerCase();
  const filtered = groups.filter(g => {
    if (selected.has(g.id)) return false;
    if (!q) return true;
    return g.name.toLowerCase().includes(q);
  });

  if (!filtered.length) {
    return `<p class="cgms-empty">${q ? 'Ничего не найдено' : 'Все группы уже выбраны'}</p>`;
  }

  return `
    <ul class="cgms-options" role="listbox">
      ${filtered.map(g => `
        <li>
          <button
            type="button"
            class="cgms-option btn-press"
            data-action="cgms-add"
            data-group-id="${escAttr(g.id)}"
            role="option"
          >${esc(g.name)}</button>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {object} p
 * @param {string} p.fieldName
 * @param {Array<{ id: string, name: string }>} p.groups
 * @param {() => void} [p.onChange]
 */
export function bindCategoryGroupMultiSelect(root, { fieldName, groups, onChange }) {
  const field = root.querySelector(`[data-cgms-field="${CSS.escape(fieldName)}"]`);
  if (!field) return { readSelectedIds: () => [] };

  const combobox = field.querySelector('[data-cgms-combobox]');
  const searchInput = field.querySelector('[data-cgms-search]');
  const dropdown = field.querySelector('[data-cgms-dropdown]');
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

  function groupsById() {
    return new Map(groups.map(g => [g.id, g]));
  }

  function renderTags() {
    const wrap = combobox.querySelector('.cgms-input-wrap');
    const searchRow = combobox.querySelector('.cgms-search-row');
    if (!wrap || !searchRow) return;

    wrap.querySelectorAll('[data-cgms-tag]').forEach(el => el.remove());

    const map = groupsById();
    for (const id of selected) {
      const group = map.get(id);
      if (!group) continue;
      const tag = document.createElement('span');
      tag.className = 'cgms-tag';
      tag.dataset.cgmsTag = id;
      tag.innerHTML = `
        <span class="cgms-tag__label">${esc(group.name)}</span>
        <button
          type="button"
          class="cgms-tag__remove btn-press"
          data-action="cgms-remove"
          data-group-id="${escAttr(id)}"
          aria-label="Убрать «${escAttr(group.name)}»"
        >&times;</button>
      `;
      wrap.insertBefore(tag, searchRow);
    }
  }

  function refreshDropdown() {
    dropdown.innerHTML = renderDropdownOptions(groups, selected, searchInput.value);
  }

  function openDropdown() {
    dropdown.hidden = false;
    combobox.classList.add('cgms-combobox--open');
    refreshDropdown();
  }

  function closeDropdown() {
    dropdown.hidden = true;
    combobox.classList.remove('cgms-combobox--open');
  }

  function addGroup(id) {
    if (!id || selected.has(id)) return;
    selected.add(id);
    renderTags();
    searchInput.value = '';
    refreshDropdown();
    onChange?.();
  }

  function removeGroup(id) {
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

  combobox.addEventListener('click', e => {
    const addBtn = e.target.closest('[data-action="cgms-add"]');
    if (addBtn) {
      e.preventDefault();
      addGroup(addBtn.dataset.groupId || '');
      searchInput.focus();
      return;
    }

    const removeBtn = e.target.closest('[data-action="cgms-remove"]');
    if (removeBtn) {
      e.preventDefault();
      removeGroup(removeBtn.dataset.groupId || '');
    }
  });

  document.addEventListener('click', e => {
    if (!field.contains(e.target)) closeDropdown();
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDropdown();
      searchInput.blur();
      return;
    }
    if (e.key === 'Backspace' && !searchInput.value && selected.size) {
      const last = [...selected].pop();
      if (last) removeGroup(last);
    }
  });

  return { readSelectedIds };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
