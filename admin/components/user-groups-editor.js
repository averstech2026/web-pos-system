import { saveUserGroup, deleteUserGroup } from '../services/crm-ref-data.js';
import { showToast } from '../utils/toast.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';
import { DEFAULT_GROUP_WALLET_IDS } from '../../shared/group-wallets.js';

const CHIP_SELECT_ICON = `<svg class="pay-restrictions-chip-btn__icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`;

const CHIP_DESELECT_ICON = `<svg class="pay-restrictions-chip-btn__icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6M15 9l-6 6"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.groups
 * @param {Array<{ id: string, name: string }>} p.wallets
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createUserGroupsEditor(host, { groups: initialGroups, wallets = [], onSaved }) {
  /** @type {Array<object>} */
  let groups = initialGroups.map(g => ({
    ...g,
    allowedWalletIds: Array.isArray(g.allowedWalletIds) && g.allowedWalletIds.length
      ? [...g.allowedWalletIds]
      : [...DEFAULT_GROUP_WALLET_IDS],
  }));
  /** @type {string|null} */
  let selectedId = groups[0]?.id || null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function groupSnapshot(g) {
    return {
      id: g.id,
      name: (g.name || '').trim(),
      description: (g.description || '').trim(),
      allowedWalletIds: [...(g.allowedWalletIds || [])].sort(),
    };
  }

  function snapshot() {
    return JSON.stringify(groups.map(groupSnapshot).sort((a, b) => a.id.localeCompare(b.id)));
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

  function selectedGroup() {
    return groups.find(g => g.id === selectedId) || null;
  }

  function syncPanel() {
    const panel = host.querySelector('#ugg-detail-panel');
    if (!selectedId || !panel) return;
    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const description = panel.querySelector('[data-field="description"]')?.value.trim() || '';
    const allowedWalletIds = [...panel.querySelectorAll('[data-wallet-id]:checked')]
      .map(el => el.dataset.walletId)
      .sort();
    groups = groups.map(g => (
      g.id === selectedId ? { ...g, name, description, allowedWalletIds } : g
    ));
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
    const walletCount = group.allowedWalletIds?.length || 0;
    const walletMeta = walletCount
      ? `${walletCount} ${walletCount === 1 ? 'кошелёк' : walletCount < 5 ? 'кошелька' : 'кошельков'}`
      : 'Кошельки не назначены';
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(group.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">🏢</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(group.name)}</span>
            <span class="avr-row-meta">${group.description ? esc(group.description) : esc(walletMeta)}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderRestrictionsBox(title, selectAction, deselectAction, contentHtml) {
    return `
      <div class="pay-restrictions-box">
        <span class="pay-restrictions-box__title">${esc(title)}</span>
        <div class="pay-restrictions-box__toolbar">
          <button type="button" class="pay-restrictions-chip-btn pay-restrictions-chip-btn--select btn-press" data-action="${escAttr(selectAction)}">
            ${CHIP_SELECT_ICON}
            <span>Выбрать все</span>
          </button>
          <button type="button" class="pay-restrictions-chip-btn pay-restrictions-chip-btn--deselect btn-press" data-action="${escAttr(deselectAction)}">
            ${CHIP_DESELECT_ICON}
            <span>Снять все</span>
          </button>
        </div>
        ${contentHtml}
      </div>
    `;
  }

  function setWalletSelection(ids) {
    if (!selectedId) return;
    syncPanel();
    const idSet = new Set(ids);
    groups = groups.map(g => (
      g.id === selectedId ? { ...g, allowedWalletIds: [...ids] } : g
    ));
    host.querySelectorAll('#ugg-detail-panel [data-wallet-id]').forEach(cb => {
      cb.checked = idSet.has(cb.dataset.walletId);
    });
  }

  function renderWalletRestrictions(group) {
    if (!wallets.length) {
      return '<p class="ufm-muted">Справочник кошельков пуст.</p>';
    }
    return renderRestrictionsBox(
      'Доступные кошельки',
      'select-all-wallets',
      'deselect-all-wallets',
      `
        <div class="wallet-restrictions-grid">
          ${wallets.map(wallet => `
            <label class="ifm-allergen bulk-allergen-tag">
              <input
                type="checkbox"
                data-wallet-id="${escAttr(wallet.id)}"
                ${group.allowedWalletIds?.includes(wallet.id) ? 'checked' : ''}
              />
              <span>${esc(wallet.name)}</span>
            </label>
          `).join('')}
        </div>
      `,
    );
  }

  function renderWalletsSection(group) {
    return `
      <div class="admin-field-block ugg-wallets-section">
        <p class="avr-section-hint">Настройка применяется ко всем клиентам группы при сохранении.</p>
        ${renderWalletRestrictions(group)}
      </div>
    `;
  }

  function renderDetail(group) {
    return `
      <div class="avr-detail-panel" id="ugg-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование группы',
          cancelId: 'ugg-cancel',
          saveId: 'ugg-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="ugg-name">Название</label>
              <input id="ugg-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(group.name)}" maxlength="80" placeholder="Завод Аскона" />
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="ugg-description">Описание</label>
              <textarea id="ugg-description" class="admin-field-input admin-field-textarea" data-field="description" rows="3" placeholder="Краткое описание группы">${esc(group.description || '')}</textarea>
            </div>
            ${renderWalletsSection(group)}
            <p class="alr-detail-id">ID: <code>${esc(group.id)}</code></p>
          </div>
          <p class="ifm-error" id="ugg-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="ugg-delete-confirm" />
                <span>Подтверждаю удаление группы</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="ugg-delete" disabled>Удалить группу</button>
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
    if (!group.allowedWalletIds?.length) {
      showError('Выберите хотя бы один кошелёк');
      return false;
    }
    saving = true;
    render();
    try {
      const { syncedUsers } = await saveUserGroup(group);
      commitBaseline();
      const syncNote = syncedUsers
        ? ` Кошельки обновлены у ${syncedUsers} клиентов.`
        : '';
      showToast(`Группа сохранена.${syncNote}`);
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
          const draft = {
            id,
            name: 'Новая группа',
            description: '',
            allowedWalletIds: [...DEFAULT_GROUP_WALLET_IDS],
          };
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
    host.querySelector('#ugg-detail-panel')?.addEventListener('change', e => {
      if (e.target.matches('[data-wallet-id]')) syncPanel();
    });
    host.querySelector('#ugg-detail-panel')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'select-all-wallets') {
        setWalletSelection(wallets.map(w => w.id));
      }
      if (action === 'deselect-all-wallets') {
        setWalletSelection([]);
      }
    });

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
  commitBaseline();

  return { destroy() { host.innerHTML = ''; }, isDirty };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
