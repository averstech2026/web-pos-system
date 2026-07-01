/**
 * Shared helpers for avr-layout master–detail editors:
 * dirty tracking, navigation guard, cancel, and confirm dialog.
 */

/** @param {unknown} value */
export function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} [options]
 * @param {string} [options.message]
 * @returns {Promise<'save' | 'continue' | 'cancel'>}
 */
export function promptUnsavedChanges(options = {}) {
  const message = options.message
    ?? 'Есть несохранённые изменения. Продолжить без сохранения? Несохранённые данные будут потеряны.';

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay avr-unsaved-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    function close(result) {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close('cancel');
    }

    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Несохранённые изменения</h2>
          <button type="button" class="admin-modal-close btn-press" data-action="close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="avr-unsaved-text">${esc(message)}</p>
        </div>
        <div class="admin-modal-foot avr-unsaved-foot">
          <button type="button" class="action-btn action-btn-danger btn-press" data-action="cancel">Отменить</button>
          <button type="button" class="action-btn action-btn-secondary btn-press" data-action="continue">Продолжить</button>
          <button type="button" class="action-btn action-btn-primary btn-press" data-action="save">Сохранить</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close('cancel'));
    overlay.querySelector('[data-action="continue"]')?.addEventListener('click', () => close('continue'));
    overlay.querySelector('[data-action="save"]')?.addEventListener('click', () => close('save'));
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', () => close('cancel'));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close('cancel');
    });

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
  });
}

/**
 * @param {object} p
 * @param {() => boolean} p.isDirty
 * @param {() => void} p.discard
 * @param {() => boolean|Promise<boolean>} [p.save]
 * @param {() => void} p.proceed
 */
export async function runWithUnsavedGuard({ isDirty, discard, save, proceed }) {
  if (!isDirty()) {
    proceed();
    return;
  }

  const choice = await promptUnsavedChanges();
  if (choice === 'cancel') return;

  if (choice === 'save') {
    if (!save) {
      proceed();
      return;
    }
    const ok = await save();
    if (!ok) return;
  } else if (choice === 'continue') {
    discard();
  }

  proceed();
}

/** @param {string} id @param {string} [label] */
export function renderAvrCancelButton(id, label = 'Отменить') {
  return `<button type="button" class="action-btn action-btn-danger btn-press" id="${id}">${esc(label)}</button>`;
}

/**
 * Detail header: static title + floating sticky save/cancel island.
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.cancelId
 * @param {string} p.saveId
 * @param {string} [p.saveLabel]
 */
export function renderAvrDetailStickyHead({ title, cancelId, saveId, saveLabel = 'Сохранить изменения', saveDisabled = false }) {
  return `
    <div class="avr-detail-float-bar">
      <div class="avr-detail-float-island footer-action-bar">
        ${renderAvrCancelButton(cancelId)}
        <button type="button" class="action-btn action-btn-primary btn-press" id="${escAttr(saveId)}"${saveDisabled ? ' disabled' : ''}>${esc(saveLabel)}</button>
      </div>
    </div>
    <div class="avr-detail-head">
      <h2 class="avr-detail-title">${esc(title)}</h2>
    </div>
  `;
}

/**
 * Cancel in avr-layout detail foot: unsaved guard + close panel (deselect entity).
 * @param {ParentNode} root
 * @param {string} buttonId
 * @param {object} handlers
 * @param {() => boolean} handlers.isDirty
 * @param {() => void} handlers.discard
 * @param {() => boolean|Promise<boolean>} [handlers.save]
 * @param {() => void} handlers.onClose
 */
export function bindAvrDetailCancel(root, buttonId, { isDirty, discard, save, onClose }) {
  root.querySelector(`#${buttonId}`)?.addEventListener('click', () => {
    runWithUnsavedGuard({
      isDirty,
      discard,
      save,
      proceed: onClose,
    });
  });
}

/** @param {string} s */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
