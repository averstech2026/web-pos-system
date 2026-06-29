/**
 * @param {object} p
 * @param {Array<object>} p.users
 * @param {Map<string, string>|Record<string, string>} [p.groupsById]
 * @param {Set<string>|string[]} [p.initialSelectedIds]
 * @param {(userIds: string[]) => void|Promise<void>} [p.onApplied]
 */
export function openClientsPickerModal({
  users,
  groupsById = {},
  initialSelectedIds = [],
  onApplied,
}) {
  document.getElementById('clients-picker-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'clients-picker-modal';
  overlay.style.zIndex = '1002';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  /** @type {Set<string>} */
  let selectedIds = new Set(
    Array.isArray(initialSelectedIds) ? initialSelectedIds : [...initialSelectedIds],
  );
  let search = '';

  function groupName(id) {
    if (!id) return '';
    if (groupsById instanceof Map) return groupsById.get(id) || '';
    return groupsById[id] || '';
  }

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function filteredUsers() {
    const q = search.trim().toLowerCase();
    const sorted = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    if (!q) return sorted;
    return sorted.filter(u => {
      const hay = [u.name, u.email, u.phone].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function applyCountLabel(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'пользователь'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'пользователя'
        : 'пользователей';
    return `Применить (${n} ${word})`.toUpperCase();
  }

  function renderList() {
    const list = overlay.querySelector('#cpp-list');
    if (!list) return;

    const filtered = filteredUsers();
    if (!filtered.length) {
      list.innerHTML = '<p class="gpp-empty">Клиенты не найдены</p>';
      return;
    }

    list.innerHTML = filtered.map(user => {
      const org = groupName(user.userGroupId);
      return `
        <label class="gpp-option">
          <input
            type="checkbox"
            data-user-id="${escAttr(user.id)}"
            ${selectedIds.has(user.id) ? 'checked' : ''}
          />
          <span class="gpp-option-name">${esc(user.name || '—')}</span>
          ${org ? `<span class="gpp-option-cat">${esc(org)}</span>` : ''}
        </label>
      `;
    }).join('');
  }

  function updateApplyBtn() {
    const btn = overlay.querySelector('#cpp-apply');
    if (btn) btn.textContent = applyCountLabel(selectedIds.size);
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md gpp-modal" role="document">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Добавить клиентов из базы</h2>
          <button type="button" class="admin-modal-close btn-press" id="cpp-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body gpp-modal-body">
          <input
            type="search"
            class="gpp-search"
            id="cpp-search"
            placeholder="ФИО, email, телефон…"
            value="${escAttr(search)}"
            autofocus
          />
          <div class="gpp-list-wrap">
            <div class="gpp-list" id="cpp-list"></div>
          </div>
        </div>
        <div class="admin-modal-foot gpp-modal-foot">
          <div class="gpp-modal-actions">
            <button type="button" class="action-btn action-btn-secondary btn-press" id="cpp-cancel">Отмена</button>
            <button type="button" class="action-btn action-btn-primary btn-press" id="cpp-apply">${applyCountLabel(selectedIds.size)}</button>
          </div>
        </div>
      </div>
    `;

    renderList();
    bindEvents();
  }

  function bindEvents() {
    const dialog = overlay.querySelector('.admin-modal');

    overlay.querySelector('#cpp-close')?.addEventListener('click', close);
    overlay.querySelector('#cpp-cancel')?.addEventListener('click', close);
    overlay.querySelector('#cpp-apply')?.addEventListener('click', apply);

    overlay.querySelector('#cpp-search')?.addEventListener('input', e => {
      search = e.target.value;
      renderList();
    });

    overlay.querySelector('#cpp-list')?.addEventListener('change', e => {
      if (!e.target.matches('[data-user-id]')) return;
      const id = e.target.dataset.userId;
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
    close();
    await onApplied?.([...selectedIds]);
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
