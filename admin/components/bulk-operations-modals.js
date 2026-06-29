const MODAL_ID = 'bulk-ops-modal';

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.bodyHtml
 * @param {string} p.submitLabel
 * @param {() => boolean|Promise<boolean>} p.onSubmit
 */
function openBulkModal({ title, bodyHtml, submitLabel, onSubmit }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = MODAL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="admin-modal card admin-modal--md" role="document">
      <div class="admin-modal-head">
        <h2 class="admin-modal-title">${esc(title)}</h2>
        <button type="button" class="admin-modal-close btn-press" data-bulk-close aria-label="Закрыть">✕</button>
      </div>
      <div class="admin-modal-body">
        ${bodyHtml}
        <p class="ifm-error bulk-modal-error" hidden></p>
      </div>
      <div class="admin-modal-foot">
        <button type="button" class="action-btn action-btn-secondary btn-press" data-bulk-close>Отмена</button>
        <button type="button" class="action-btn action-btn-primary btn-press" data-bulk-submit>${esc(submitLabel)}</button>
      </div>
    </div>
  `;

  const errEl = overlay.querySelector('.bulk-modal-error');
  const submitBtn = overlay.querySelector('[data-bulk-submit]');

  overlay.querySelectorAll('[data-bulk-close]').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function onKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', onKeydown);
    }
  });

  submitBtn.addEventListener('click', async () => {
    errEl.hidden = true;
    submitBtn.disabled = true;

    try {
      const ok = await onSubmit({ overlay, errEl, submitBtn });
      if (ok !== false) closeModal();
    } catch (err) {
      errEl.textContent = err.message || 'Не удалось выполнить операцию';
      errEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector('select, input, button[data-bulk-submit]')?.focus();
  return overlay;
}

/**
 * @param {object} p
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} p.categoryGroups
 * @param {(groupId: string) => void|Promise<void>} p.onApply
 */
export function openBulkGroupModal({ categoryGroups, onApply }) {
  const options = categoryGroups.map(g => `
    <option value="${escAttr(g.id)}">${esc(g.name)}</option>
  `).join('');

  openBulkModal({
    title: 'Изменить группу',
    submitLabel: 'Перенести',
    bodyHtml: `
      <p class="bulk-modal-hint">Выберите группу, в которую будут перенесены выбранные товары.</p>
      <label class="bulk-modal-field">
        <span>Группа товаров</span>
        <select id="bulk-group-select" class="bulk-modal-select">
          ${options}
        </select>
      </label>
    `,
    onSubmit: async ({ overlay, errEl }) => {
      const groupId = overlay.querySelector('#bulk-group-select')?.value;
      if (!groupId) {
        errEl.textContent = 'Выберите группу';
        errEl.hidden = false;
        return false;
      }
      await onApply(groupId);
    },
  });
}

/**
 * @param {object} p
 * @param {Array<{ id: string, name: string }>} p.allergens
 * @param {(allergenIds: string[], mode: 'union'|'overwrite') => void|Promise<void>} p.onApply
 */
export function openBulkAllergensModal({ allergens, onApply }) {
  const tags = allergens.length
    ? allergens.map(a => `
        <label class="ifm-allergen bulk-allergen-tag">
          <input type="checkbox" value="${escAttr(a.id)}" />
          <span>${esc(a.name)}</span>
        </label>
      `).join('')
    : '<p class="ifm-hint">Справочник аллергенов пуст.</p>';

  openBulkModal({
    title: 'Указать аллергены',
    submitLabel: 'Применить',
    bodyHtml: `
      <p class="bulk-modal-hint">Отметьте аллергены для выбранных товаров.</p>
      <fieldset class="ifm-fieldset">
        <legend>Аллергены</legend>
        <div class="ifm-allergens bulk-allergens-grid">${tags}</div>
      </fieldset>
      <fieldset class="ifm-fieldset bulk-mode-fieldset">
        <legend>Режим</legend>
        <div class="bulk-radio-group">
          <label class="bulk-radio">
            <input type="radio" name="bulk-allergen-mode" value="union" checked />
            <span>Добавить выбранные аллергены к существующим</span>
          </label>
          <label class="bulk-radio">
            <input type="radio" name="bulk-allergen-mode" value="overwrite" />
            <span>Заменить все текущие аллергены на выбранные</span>
          </label>
        </div>
      </fieldset>
    `,
    onSubmit: async ({ overlay, errEl }) => {
      const allergenIds = [...overlay.querySelectorAll('.bulk-allergens-grid input:checked')]
        .map(el => el.value);

      if (!allergenIds.length && mode !== 'overwrite') {
        errEl.textContent = 'Выберите хотя бы один аллерген';
        errEl.hidden = false;
        return false;
      }

      const mode = overlay.querySelector('input[name="bulk-allergen-mode"]:checked')?.value || 'union';
      await onApply(allergenIds, /** @type {'union'|'overwrite'} */ (mode));
    },
  });
}

/**
 * @param {object} p
 * @param {(isAvailable: boolean) => void|Promise<void>} p.onApply
 */
export function openBulkAvailabilityModal({ onApply }) {
  openBulkModal({
    title: 'Статус продажи',
    submitLabel: 'Сохранить',
    bodyHtml: `
      <p class="bulk-modal-hint">Установите доступность выбранных товаров в меню.</p>
      <div class="bulk-avail-options">
        <label class="bulk-avail-option">
          <input type="radio" name="bulk-avail" value="true" checked />
          <span class="bulk-avail-option-body">
            <span class="bulk-avail-option-title">Включить продажи</span>
            <span class="bulk-avail-option-desc">Товары будут доступны для заказа</span>
          </span>
        </label>
        <label class="bulk-avail-option">
          <input type="radio" name="bulk-avail" value="false" />
          <span class="bulk-avail-option-body">
            <span class="bulk-avail-option-title">Выключить продажи</span>
            <span class="bulk-avail-option-desc">Товары будут скрыты из меню</span>
          </span>
        </label>
      </div>
    `,
    onSubmit: async ({ overlay }) => {
      const value = overlay.querySelector('input[name="bulk-avail"]:checked')?.value;
      await onApply(value === 'true');
    },
  });
}

/** @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
