import { showToast } from '../utils/toast.js';
import { fmtMoney } from '../utils/format.js';

/**
 * @param {object} p
 * @param {string} p.userName
 * @param {string} p.walletId
 * @param {string} p.walletName
 * @param {number} p.currentBalance
 * @param {'deposit'|'withdraw'|'credit'|'debit'} [p.presetType]
 * @param {(data: { type: 'credit'|'debit', amount: number, comment: string }) => Promise<void>} p.onSubmit
 */
export function openWalletOperationModal({
  userName,
  walletId,
  walletName,
  currentBalance,
  presetType = 'deposit',
  onSubmit,
}) {
  document.getElementById('wallet-op-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'wallet-op-modal';
  overlay.style.zIndex = '1001';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let opType = presetType === 'withdraw' || presetType === 'debit' ? 'withdraw' : 'deposit';
  let busy = false;

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">${opType === 'deposit' ? 'Пополнение' : 'Списание'} кошелька</h2>
          <button type="button" class="admin-modal-close btn-press" id="wallet-op-close">✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="ufm-muted">${esc(userName)} · <strong>${esc(walletName)}</strong></p>
          <p class="ufm-wallet-modal-balance">Баланс: <strong>${fmtMoney(currentBalance)}</strong></p>
          <div class="form-stack">
            <label class="ufm-field">
              <span class="ufm-label">Сумма, ₽</span>
              <input type="number" class="ufm-input" id="wallet-op-amount" min="1" step="1" placeholder="0" />
            </label>
            <label class="ufm-field">
              <span class="ufm-label">Комментарий / Основание <span class="ufm-required">*</span></span>
              <textarea class="ufm-input ufm-textarea" id="wallet-op-comment" rows="3" placeholder="Обязательное поле"></textarea>
            </label>
            <p class="ifm-error" id="wallet-op-error" hidden></p>
          </div>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="wallet-op-cancel">Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" id="wallet-op-submit">Выполнить</button>
        </div>
      </div>
    `;
    bind();
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function bind() {
    overlay.querySelector('#wallet-op-close')?.addEventListener('click', close);
    overlay.querySelector('#wallet-op-cancel')?.addEventListener('click', close);
    overlay.querySelector('#wallet-op-submit')?.addEventListener('click', submit);
    overlay.querySelector('#wallet-op-amount')?.focus();
  }

  async function submit() {
    if (busy) return;
    const errEl = overlay.querySelector('#wallet-op-error');
    const amount = Number(overlay.querySelector('#wallet-op-amount')?.value);
    const comment = overlay.querySelector('#wallet-op-comment')?.value?.trim() || '';

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
    if (opType === 'withdraw' && amount > currentBalance) {
      errEl.textContent = 'Сумма превышает баланс кошелька';
      errEl.hidden = false;
      return;
    }

    busy = true;
    const submitBtn = overlay.querySelector('#wallet-op-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Выполняется…';

    try {
      await onSubmit({ type: opType, amount, comment, walletId });
      showToast(opType === 'deposit' ? 'Средства начислены' : 'Средства списаны');
      close();
    } catch (err) {
      errEl.textContent = err.message || 'Не удалось выполнить операцию';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Выполнить';
      busy = false;
    }
  }

  overlay.addEventListener('click', (e) => {
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
