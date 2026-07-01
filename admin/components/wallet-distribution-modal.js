import { auth } from '../../shared/firebase.js';
import {
  bulkAdjustWalletBalances,
  resolveDistributionUserIds,
} from '../services/users-data.js';
import { openClientsPickerModal } from './clients-picker-modal.js';
import { showToast } from '../utils/toast.js';

/**
 * @param {object} p
 * @param {Array<{ id: string, name: string, allowedCategories?: string[] }>} p.wallets
 * @param {Array<{ id: string, name: string }>} p.userGroups
 * @param {Array<{ id: string, name: string }>} p.loyaltyCategories
 * @param {Array<object>} p.users
 * @param {Map<string, string>|Record<string, string>} [p.groupsById]
 * @param {string|null} [p.defaultWalletId]
 * @param {() => void|Promise<void>} [p.onComplete]
 */
export function openWalletDistributionModal({
  wallets,
  userGroups,
  loyaltyCategories,
  users,
  groupsById = {},
  defaultWalletId = null,
  onComplete,
}) {
  document.getElementById('wallet-dist-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'wallet-dist-modal';
  overlay.style.zIndex = '1001';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const resolvedWalletId = defaultWalletId && wallets.some(w => w.id === defaultWalletId)
    ? defaultWalletId
    : wallets[0]?.id || null;

  let targetMode = 'group';
  /** @type {string[]} */
  let selectedUserIds = [];
  let busy = false;

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape' && !busy) close();
  }

  function selectedUsers() {
    return users.filter(u => selectedUserIds.includes(u.id));
  }

  function updateManualCounter() {
    const el = overlay.querySelector('#wd-manual-counter');
    if (el) el.textContent = `${selectedUserIds.length} / ${users.length}`;
  }

  function renderChips() {
    const host = overlay.querySelector('#wd-chips');
    if (!host || targetMode !== 'manual') return;

    const picked = selectedUsers();
    if (!picked.length) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.innerHTML = picked.map(u => `
      <span class="wallet-dist-chip">
        <span class="wallet-dist-chip-text">
          <strong>${esc(u.name || '—')}</strong>
          ${u.email ? `<span class="wallet-dist-chip-email">${esc(u.email)}</span>` : ''}
        </span>
        <button type="button" class="wallet-dist-chip-remove btn-press" data-remove-user="${escAttr(u.id)}" aria-label="Удалить">✕</button>
      </span>
    `).join('');
  }

  function walletOptions(selectedId) {
    return wallets.map(w => `
      <option value="${escAttr(w.id)}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)}</option>
    `).join('');
  }

  function groupOptions() {
    return userGroups.map(g => `<option value="${escAttr(g.id)}">${esc(g.name)}</option>`).join('');
  }

  function loyaltyOptions() {
    return loyaltyCategories.map(c => `<option value="${escAttr(c.id)}">${esc(c.name)}</option>`).join('');
  }

  function openClientsPicker() {
    openClientsPickerModal({
      users,
      groupsById,
      initialSelectedIds: selectedUserIds,
      onApplied: ids => {
        selectedUserIds = ids;
        renderChips();
        updateManualCounter();
      },
    });
  }

  function renderTargetingFields() {
    const host = overlay.querySelector('#wd-target-fields');
    if (!host) return;

    if (targetMode === 'group') {
      host.innerHTML = `
        <label class="ufm-field">
          <span class="ufm-label">Группа клиентов</span>
          <select class="ufm-input" id="wd-group">${groupOptions()}</select>
        </label>
      `;
    } else if (targetMode === 'loyalty') {
      host.innerHTML = `
        <label class="ufm-field">
          <span class="ufm-label">Категория лояльности</span>
          <select class="ufm-input" id="wd-loyalty">${loyaltyOptions()}</select>
        </label>
      `;
    } else {
      host.innerHTML = `
        <button type="button" class="btn btn-outline btn-press wallet-dist-add-btn" id="wd-add-clients">+ Добавить клиентов</button>
        <div class="wallet-dist-chips" id="wd-chips" hidden></div>
        <p class="wallet-dist-manual-counter" id="wd-manual-counter" aria-live="polite">${selectedUserIds.length} / ${users.length}</p>
      `;
      renderChips();
    }
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--lg wallet-dist-modal">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Массовое распределение средств</h2>
          <button type="button" class="admin-modal-close btn-press" id="wd-close" ${busy ? 'disabled' : ''}>✕</button>
        </div>
        <div class="admin-modal-body wallet-dist-body">
          <section class="wallet-dist-section">
            <h3 class="wallet-dist-section-title">Базовые настройки</h3>
            <div class="form-stack">
              <label class="ufm-field">
                <span class="ufm-label">Кошелёк</span>
                <select class="ufm-input" id="wd-wallet">${walletOptions(resolvedWalletId)}</select>
              </label>
              <fieldset class="ifm-fieldset">
                <legend>Действие</legend>
                <div class="bulk-radio-group">
                  <label class="bulk-radio">
                    <input type="radio" name="wd-op" value="deposit" checked />
                    <span>Начислить</span>
                  </label>
                  <label class="bulk-radio">
                    <input type="radio" name="wd-op" value="withdraw" />
                    <span>Изъять</span>
                  </label>
                </div>
              </fieldset>
              <label class="ufm-field">
                <span class="ufm-label">Сумма, ₽</span>
                <input type="number" class="ufm-input" id="wd-amount" min="1" step="1" placeholder="0" />
              </label>
              <label class="ufm-field">
                <span class="ufm-label">Комментарий / Основание <span class="ufm-required">*</span></span>
                <textarea class="ufm-input ufm-textarea" id="wd-comment" rows="3" placeholder="Обязательное поле"></textarea>
              </label>
            </div>
          </section>

          <section class="wallet-dist-section">
            <h3 class="wallet-dist-section-title">Кому начислить</h3>
            <fieldset class="ifm-fieldset">
              <div class="bulk-radio-group">
                <label class="bulk-radio">
                  <input type="radio" name="wd-target" value="group" ${targetMode === 'group' ? 'checked' : ''} />
                  <span>По группе клиентов</span>
                </label>
                <label class="bulk-radio">
                  <input type="radio" name="wd-target" value="loyalty" ${targetMode === 'loyalty' ? 'checked' : ''} />
                  <span>По категории лояльности</span>
                </label>
                <label class="bulk-radio">
                  <input type="radio" name="wd-target" value="manual" ${targetMode === 'manual' ? 'checked' : ''} />
                  <span>Свободный выбор (список клиентов)</span>
                </label>
              </div>
            </fieldset>
            <div class="wallet-dist-target-fields" id="wd-target-fields"></div>
          </section>

          <div class="wallet-dist-progress" id="wd-progress" hidden>
            <div class="wallet-dist-progress-bar">
              <div class="wallet-dist-progress-fill" id="wd-progress-fill" style="width:0%"></div>
            </div>
            <p class="wallet-dist-progress-text" id="wd-progress-text">0 / 0</p>
          </div>
          <p class="ifm-error" id="wd-error" hidden></p>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="wd-cancel" ${busy ? 'disabled' : ''}>Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" id="wd-submit">Запустить распределение</button>
        </div>
      </div>
    `;

    renderTargetingFields();
    bindFormControls();
  }

  function bindFormControls() {
    overlay.querySelector('#wd-close')?.addEventListener('click', close);
    overlay.querySelector('#wd-cancel')?.addEventListener('click', close);
    overlay.querySelector('#wd-submit')?.addEventListener('click', submit);

    overlay.querySelectorAll('input[name="wd-target"]').forEach(radio => {
      radio.addEventListener('change', e => {
        targetMode = e.target.value;
        renderTargetingFields();
      });
    });
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay && !busy) {
      close();
      return;
    }

    if (e.target.closest('#wd-add-clients')) {
      e.preventDefault();
      e.stopPropagation();
      openClientsPicker();
      return;
    }

    const removeBtn = e.target.closest('[data-remove-user]');
    if (removeBtn) {
      e.preventDefault();
      selectedUserIds = selectedUserIds.filter(id => id !== removeBtn.dataset.removeUser);
      renderChips();
      updateManualCounter();
    }
  });

  async function submit() {
    if (busy) return;
    const errEl = overlay.querySelector('#wd-error');
    const walletId = overlay.querySelector('#wd-wallet')?.value;
    const amount = Number(overlay.querySelector('#wd-amount')?.value);
    const comment = overlay.querySelector('#wd-comment')?.value?.trim() || '';
    const type = overlay.querySelector('input[name="wd-op"]:checked')?.value || 'deposit';
    const walletDef = wallets.find(w => w.id === walletId);

    const groupId = overlay.querySelector('#wd-group')?.value || null;
    const loyaltyCategoryId = overlay.querySelector('#wd-loyalty')?.value || null;

    const userIds = resolveDistributionUserIds({
      targetMode,
      groupId,
      loyaltyCategoryId,
      manualUserIds: selectedUserIds,
      allUsers: users,
    });

    if (!walletId) {
      errEl.textContent = 'Выберите кошелёк';
      errEl.hidden = false;
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errEl.textContent = 'Укажите положительную сумму';
      errEl.hidden = false;
      return;
    }
    if (!comment) {
      errEl.textContent = 'Укажите комментарий / основание';
      errEl.hidden = false;
      return;
    }
    if (!userIds.length) {
      errEl.textContent = targetMode === 'manual'
        ? 'Добавьте хотя бы одного клиента'
        : 'Не найдено клиентов по выбранному условию';
      errEl.hidden = false;
      return;
    }

    if (!confirm(`Выполнить операцию для ${userIds.length} клиентов?`)) return;

    busy = true;
    const submitBtn = overlay.querySelector('#wd-submit');
    const progressEl = overlay.querySelector('#wd-progress');
    const progressFill = overlay.querySelector('#wd-progress-fill');
    const progressText = overlay.querySelector('#wd-progress-text');
    const manualCounter = overlay.querySelector('#wd-manual-counter');
    if (manualCounter) manualCounter.hidden = true;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Выполняется…';
    progressEl.hidden = false;
    errEl.hidden = true;

    try {
      const result = await bulkAdjustWalletBalances({
        userIds,
        walletId,
        walletDef: walletDef ? { name: walletDef.name, allowedCategories: walletDef.allowedCategories } : null,
        type,
        amount,
        comment,
        performedBy: auth.currentUser?.email || 'Админ',
        onProgress: ({ done, total }) => {
          const pct = total ? Math.round((done / total) * 100) : 0;
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `${done} / ${total}`;
        },
      });

      const skippedNote = result.skipped.length
        ? ` (пропущено: ${result.skipped.length})`
        : '';
      showToast(`Распределение выполнено для ${result.processed} клиентов${skippedNote}`);
      close();
      await onComplete?.();
    } catch (err) {
      errEl.textContent = err.message || 'Не удалось выполнить распределение';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Запустить распределение';
      progressEl.hidden = true;
      if (manualCounter) manualCounter.hidden = false;
      busy = false;
    }
  }

  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  render();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
