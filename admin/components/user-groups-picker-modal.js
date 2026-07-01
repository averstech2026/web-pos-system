/**
 * Multi-select picker for CRM user groups.
 * @param {object} p
 * @param {string} p.title
 * @param {string[]} p.selectedIds
 * @param {Array<{ id: string, name: string }>} p.groups
 * @param {(ids: string[]) => void|Promise<void>} [p.onApplied]
 */
export function openUserGroupsPickerModal({ title, selectedIds: initialIds, groups, onApplied }) {
  document.getElementById('user-groups-picker-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'user-groups-picker-modal';
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

  function filteredGroups() {
    const q = search.trim().toLowerCase();
    const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!q) return sorted;
    return sorted.filter(g => g.name.toLowerCase().includes(q));
  }

  function renderList() {
    const list = overlay.querySelector('#ugp-list');
    if (!list) return;

    const filtered = filteredGroups();
    if (!filtered.length) {
      list.innerHTML = '<p class="gpp-empty">Группы не найдены</p>';
      return;
    }

    list.innerHTML = filtered.map(group => `
      <label class="gpp-option">
        <input
          type="checkbox"
          data-group-id="${escAttr(group.id)}"
          ${selectedIds.has(group.id) ? 'checked' : ''}
        />
        <span class="gpp-option-name">${esc(group.name)}</span>
      </label>
    `).join('');
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md gpp-modal" role="document">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">${esc(title)}</h2>
          <button type="button" class="admin-modal-close btn-press" id="ugp-close" aria-label="Закрыть">×</button>
        </div>
        <div class="admin-modal-body gpp-body">
          <input type="search" class="admin-field-input gpp-search" id="ugp-search" placeholder="Поиск группы…" value="${escAttr(search)}" />
          <div class="gpp-list" id="ugp-list"></div>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="ugp-cancel">Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" id="ugp-apply">
            Применить (${selectedIds.size})
          </button>
        </div>
      </div>
    `;
    renderList();

    overlay.querySelector('#ugp-close')?.addEventListener('click', close);
    overlay.querySelector('#ugp-cancel')?.addEventListener('click', close);
    overlay.querySelector('#ugp-search')?.addEventListener('input', e => {
      search = e.target.value;
      renderList();
    });
    overlay.querySelector('#ugp-list')?.addEventListener('change', e => {
      const cb = e.target.closest('[data-group-id]');
      if (!cb) return;
      const id = cb.dataset.groupId;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      const applyBtn = overlay.querySelector('#ugp-apply');
      if (applyBtn) applyBtn.textContent = `Применить (${selectedIds.size})`;
    });
    overlay.querySelector('#ugp-apply')?.addEventListener('click', async () => {
      await onApplied?.([...selectedIds]);
      close();
    });
  }

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeydown);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  render();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}
