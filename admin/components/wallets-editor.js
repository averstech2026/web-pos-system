import { saveWallet, deleteWallet } from '../services/wallets-data.js';
import { showToast } from '../utils/toast.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.wallets
 * @param {Array<{ id: string, name: string }>} p.categoryGroups
 * @param {() => void|Promise<void>} [p.onSaved]
 * @param {(walletId: string|null) => void} [p.onDistribute]
 */
export function createWalletsEditor(host, {
  wallets: initialWallets,
  categoryGroups,
  onSaved,
  onDistribute,
}) {
  /** @type {Array<object>} */
  let wallets = initialWallets.map(w => ({ ...w }));
  /** @type {string|null} */
  let selectedId = wallets[0]?.id || null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(wallets.map(w => ({ ...w, restrictions: [...(w.restrictions || [])] }))
      .sort((a, b) => a.id.localeCompare(b.id)));
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
    wallets = JSON.parse(baselineJson);
    if (selectedId && !wallets.some(w => w.id === selectedId)) {
      selectedId = wallets[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedWallet() {
    return wallets.find(w => w.id === selectedId) || null;
  }

  function syncPanel() {
    const panel = host.querySelector('#wal-detail-panel');
    if (!selectedId || !panel) return;

    const restrictions = [...panel.querySelectorAll('[data-restriction]:checked')]
      .map(el => el.dataset.restriction);

    wallets = wallets.map(w => (
      w.id === selectedId
        ? {
          ...w,
          name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
          description: panel.querySelector('[data-field="description"]')?.value.trim() || '',
          restrictions,
        }
        : w
    ));
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `wallet_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (wallets.some(w => w.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function renderRow(wallet) {
    const active = wallet.id === selectedId;
    const restrNote = wallet.restrictions?.length
      ? `Ограничения: ${wallet.restrictions.length}`
      : 'Без ограничений';
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(wallet.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">💳</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(wallet.name)}</span>
            <span class="avr-row-meta">${esc(restrNote)}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderRestrictions(wallet) {
    if (!categoryGroups.length) {
      return '<p class="ufm-muted">Справочник категорий товаров пуст.</p>';
    }
    return `
      <fieldset class="ifm-fieldset">
        <legend>Ограничения по категориям товаров</legend>
        <div class="wallet-restrictions-grid">
          ${categoryGroups.map(cat => `
            <label class="ifm-allergen bulk-allergen-tag">
              <input
                type="checkbox"
                data-restriction="${escAttr(cat.id)}"
                ${wallet.restrictions?.includes(cat.id) ? 'checked' : ''}
              />
              <span>${esc(cat.name)}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
    `;
  }

  function renderDetail(wallet) {
    return `
      <div class="avr-detail-panel" id="wal-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Редактирование кошелька',
          cancelId: 'wal-cancel',
          saveId: 'wal-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="wal-name">Название</label>
              <div class="cgr-detail-name-row wallet-detail-name-row">
                <input id="wal-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(wallet.name)}" maxlength="80" placeholder="Дотация" />
                <button type="button" class="action-btn action-btn-secondary btn-press wallet-detail-distribute-btn" id="wal-distribute-detail" ${saving ? 'disabled' : ''}>
                  Распределить средства
                </button>
              </div>
            </div>
            <div class="admin-field-block">
              <label class="admin-field-label" for="wal-description">Описание</label>
              <textarea id="wal-description" class="admin-field-input admin-field-textarea" data-field="description" rows="3" placeholder="Назначение кошелька">${esc(wallet.description || '')}</textarea>
            </div>
            ${renderRestrictions(wallet)}
            <p class="alr-detail-id">ID: <code>${esc(wallet.id)}</code></p>
          </div>
          <p class="ifm-error" id="wal-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="wal-delete-confirm" />
                <span>Подтверждаю удаление кошелька</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="wal-delete" disabled>Удалить кошелёк</button>
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
    const wallet = selectedWallet();
    host.innerHTML = `
      <div class="wallets-page-inner">
        <div class="avr-layout alr-layout">
          <div class="avr-master">
            <div class="avr-master-head">
              <h2 class="avr-master-title">Кошельки (${wallets.length})</h2>
              <button type="button" class="btn btn-primary btn-press products-create-btn" id="wal-create">+ Добавить</button>
            </div>
            <ul class="avr-list" id="wal-list">${wallets.map(renderRow).join('')}</ul>
            ${!wallets.length ? '<p class="avr-list-empty">Нет кошельков. Создайте первый.</p>' : ''}
          </div>
          <aside class="avr-detail">
            ${wallet
              ? renderDetail(wallet)
              : `<div class="avr-detail-empty"><p class="avr-detail-empty-title">Выберите кошелёк</p></div>`}
          </aside>
        </div>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#wal-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const wallet = selectedWallet();
    if (!wallet?.name?.trim()) {
      showError('Укажите название кошелька');
      return false;
    }
    saving = true;
    render();
    try {
      await saveWallet(wallet);
      commitBaseline();
      showToast('Кошелёк сохранён');
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
    host.querySelector('#wal-distribute-detail')?.addEventListener('click', () => onDistribute?.(selectedId));

    host.querySelector('#wal-create')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          const id = uniqueId('Новый кошелёк');
          wallets.push({ id, name: 'Новый кошелёк', description: '', restrictions: [] });
          selectedId = id;
          render();
        },
      });
    });

    host.querySelector('#wal-list')?.addEventListener('click', e => {
      const row = e.target.closest('[data-id]');
      if (!row || !e.target.closest('[data-action="select"]')) return;
      const id = row.dataset.id;
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

    host.querySelector('#wal-detail-panel')?.addEventListener('input', () => syncPanel());
    host.querySelector('#wal-detail-panel')?.addEventListener('change', e => {
      if (e.target.matches('[data-restriction]')) syncPanel();
    });

    host.querySelector('#wal-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#wal-delete');
      if (btn) btn.disabled = !e.target.checked;
    });

    host.querySelector('#wal-save')?.addEventListener('click', persistCurrent);
    bindAvrDetailCancel(host, 'wal-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });

    host.querySelector('#wal-delete')?.addEventListener('click', async () => {
      const wallet = selectedWallet();
      if (!wallet) return;
      saving = true;
      render();
      try {
        await deleteWallet(wallet.id);
        wallets = wallets.filter(w => w.id !== wallet.id);
        selectedId = wallets[0]?.id || null;
        commitBaseline();
        saving = false;
        showToast('Кошелёк удалён');
        await onSaved?.();
      } catch (err) {
        saving = false;
        render();
        showError(err.message || 'Не удалось удалить');
      }
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
    isDirty,
  };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
