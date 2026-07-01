import { auth } from '../../shared/firebase.js';
import { bulkAdjustWalletBalances } from '../services/users-data.js';
import { showToast } from '../utils/toast.js';

/**
 * @param {object} p
 * @param {string[]} p.userIds
 * @param {Array<{ id: string, name: string, allowedCategories?: string[] }>} p.wallets
 * @param {() => void|Promise<void>} [p.onComplete]
 */
export function openBulkWalletOperationModal({ userIds, wallets, onComplete }) {
  document.getElementById('bulk-wallet-op-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'bulk-wallet-op-modal';
  overlay.style.zIndex = '1001';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let opType = 'deposit';
  let busy = false;
  const selectedCount = userIds.length;

  const walletOptions = wallets.map(w => `
    <option value="${escAttr(w.id)}">${esc(w.name)}</option>
  `).join('');

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Управление средствами</h2>
          <button type="button" class="admin-modal-close btn-press" id="bwo-close">✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="bulk-modal-hint">Массовая операция для <strong>${selectedCount}</strong> выбранных клиентов.</p>
          <div class="form-stack">
            <label class="ufm-field">
              <span class="ufm-label">Кошелёк</span>
              <select class="ufm-input" id="bwo-wallet">${walletOptions}</select>
            </label>
            <fieldset class="ifm-fieldset">
              <legend>Операция</legend>
              <div class="bulk-radio-group">
                <label class="bulk-radio">
                  <input type="radio" name="bwo-op" value="deposit" ${opType === 'deposit' ? 'checked' : ''} />
                  <span>Начислить</span>
                </label>
                <label class="bulk-radio">
                  <input type="radio" name="bwo-op" value="withdraw" ${opType === 'withdraw' ? 'checked' : ''} />
                  <span>Изъять</span>
                </label>
              </div>
            </fieldset>
            <label class="ufm-field">
              <span class="ufm-label">Сумма, ₽</span>
              <input type="number" class="ufm-input" id="bwo-amount" min="1" step="1" placeholder="0" />
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Комментарий / Основание <span class="ufm-required">*</span></span>
              <textarea class="ufm-input ufm-textarea" id="bwo-comment" rows="3" placeholder="Обязательное поле"></textarea>
            </label>
            <div class="wallet-dist-progress" id="bwo-progress" hidden>
              <div class="wallet-dist-progress-bar">
                <div class="wallet-dist-progress-fill" id="bwo-progress-fill" style="width:0%"></div>
              </div>
              <p class="wallet-dist-progress-text" id="bwo-progress-text">0 / 0</p>
            </div>
            <p class="ifm-error" id="bwo-error" hidden></p>
          </div>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="bwo-cancel">Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" id="bwo-submit">Подтвердить</button>
        </div>
      </div>
    `;
    bind();
  }

  function bind() {
    overlay.querySelector('#bwo-close')?.addEventListener('click', close);
    overlay.querySelector('#bwo-cancel')?.addEventListener('click', close);
    overlay.querySelector('#bwo-submit')?.addEventListener('click', submit);
    overlay.querySelectorAll('input[name="bwo-op"]').forEach(radio => {
      radio.addEventListener('change', e => {
        opType = e.target.value;
      });
    });
    overlay.querySelector('#bwo-amount')?.focus();
  }

  async function submit() {
    if (busy) return;
    const errEl = overlay.querySelector('#bwo-error');
    const walletId = overlay.querySelector('#bwo-wallet')?.value;
    const amount = Number(overlay.querySelector('#bwo-amount')?.value);
    const comment = overlay.querySelector('#bwo-comment')?.value?.trim() || '';
    const type = overlay.querySelector('input[name="bwo-op"]:checked')?.value || 'deposit';
    const walletDef = wallets.find(w => w.id === walletId);

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

    busy = true;
    const submitBtn = overlay.querySelector('#bwo-submit');
    const progressEl = overlay.querySelector('#bwo-progress');
    const progressFill = overlay.querySelector('#bwo-progress-fill');
    const progressText = overlay.querySelector('#bwo-progress-text');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Выполняется…';
    progressEl.hidden = false;

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
      showToast(`Операция выполнена для ${result.processed} клиентов${skippedNote}`);
      close();
      await onComplete?.();
    } catch (err) {
      errEl.textContent = err.message || 'Не удалось выполнить операцию';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Подтвердить';
      progressEl.hidden = true;
      busy = false;
    }
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  render();
  document.body.appendChild(overlay);
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
