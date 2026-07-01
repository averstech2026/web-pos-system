import { saveUserGroup, deleteUserGroup } from '../services/crm-ref-data.js';
import { showToast } from '../utils/toast.js';
import { renderAvrCancelButton, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.groups
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createUserGroupsEditor(host, { groups: initialGroups, onSaved }) {
  /** @type {Array<object>} */
  let groups = initialGroups.map(g => ({ ...g }));
  /** @type {string|null} */
  let selectedId = groups[0]?.id || null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(groups.map(g => ({ ...g })).sort((a, b) => a.id.localeCompare(b.id)));
  }

  function commitBaseline() {
    syncPanel();
    baselineJson = snapshot();
  }

  function isDirty() {
    syncPanel();
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    groups = JSON.parse(baselineJson);
    if (selectedId && !groups.some(g => g.id === selectedId)) {
      selectedId = groups[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedGroup() {
    return groups.find(g => g.id === selectedId) || null;
  }

  function syncPanel() {
    const panel = host.querySelector('#ugg-detail-panel');
    if (!selectedId || !panel) return;
    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const description = panel.querySelector('[data-field="description"]')?.value.trim() || '';
    groups = groups.map(g => (g.id === selectedId ? { ...g, name, description } : g));
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `group_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (groups.some(g => g.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function renderRow(group) {
    const active = group.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(group.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">🏢</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(group.name)}</span>
            ${group.description ? `<span class="avr-row-meta">${esc(group.description)}</span>` : ''}
          </span>
        </button>
      </li>
    `;
  }

  function renderDetail(group) {
    return `
      <div class="avr-detail-panel" id="ugg-detail-panel">
        <div class="avr-detail-scroll">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="ugg-name">Название</label>
              <input id="ugg-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(group.name)}" maxlength="80" placeholder="Завод Аскона" />
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="ugg-description">Описание</label>
              <textarea id="ugg-description" class="admin-field-input admin-field-textarea" data-field="description" rows="3" placeholder="Краткое описание группы">${esc(group.description || '')}</textarea>
            </div>
            <p class="alr-detail-id">ID: <code>${esc(group.id)}</code></p>
          </div>
          <p class="ifm-error" id="ugg-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row">
            <div class="cgr-detail-danger">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="ugg-delete-confirm" />
                <span>Подтверждаю удаление группы</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="ugg-delete" disabled>Удалить группу</button>
            </div>
            <div class="footer-action-bar">
              ${renderAvrCancelButton('ugg-cancel')}
              <button type="button" class="action-btn action-btn-primary btn-press" id="ugg-save" ${saving ? 'disabled' : ''}>
                ${saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function render() {
    const group = selectedGroup();
    host.innerHTML = `
      <div class="avr-layout alr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Группы (${groups.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="ugg-create">+ Добавить</button>
          </div>
          <ul class="avr-list" id="ugg-list">${groups.map(renderRow).join('')}</ul>
          ${!groups.length ? '<p class="avr-list-empty">Нет групп. Создайте первую.</p>' : ''}
        </div>
        <aside class="avr-detail">
          ${group
            ? renderDetail(group)
            : `<div class="avr-detail-empty"><p class="avr-detail-empty-title">Выберите группу</p></div>`}
        </aside>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#ugg-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const group = selectedGroup();
    if (!group?.name?.trim()) {
      showError('Укажите название группы');
      return false;
    }
    saving = true;
    render();
    try {
      await saveUserGroup(group);
      commitBaseline();
      showToast('Группа сохранена');
      await onSaved?.();
      return true;
    } catch (err) {
      showError(err.message || 'Не удалось сохранить');
      return false;
    } finally {
      saving = false;
      render();
    }
  }

  function bind() {
    host.querySelector('#ugg-create')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          const id = uniqueId('новая_группа');
          const draft = { id, name: 'Новая группа', description: '' };
          groups = [...groups, draft];
          selectedId = id;
          render();
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        },
      });
    });

    host.querySelector('#ugg-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const id = btn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    host.querySelector('#ugg-detail-panel')?.addEventListener('input', () => syncPanel());

    host.querySelector('#ugg-save')?.addEventListener('click', persistCurrent);
    bindAvrDetailCancel(host, 'ugg-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });

    host.querySelector('#ugg-delete-confirm')?.addEventListener('change', e => {
      host.querySelector('#ugg-delete').disabled = !e.target.checked;
    });

    host.querySelector('#ugg-delete')?.addEventListener('click', async () => {
      if (!selectedId) return;
      saving = true;
      try {
        await deleteUserGroup(selectedId);
        groups = groups.filter(g => g.id !== selectedId);
        selectedId = groups[0]?.id || null;
        commitBaseline();
        showToast('Группа удалена');
        await onSaved?.();
      } catch (err) {
        showError(err.message || 'Не удалось удалить');
      } finally {
        saving = false;
        render();
      }
    });
  }

  render();

  return { destroy() { host.innerHTML = ''; }, isDirty };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
