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
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {(ruleId: string|null) => void|Promise<void>} p.onApply
 */
export function openBulkScheduleModal({ availabilityRules, onApply }) {
  const ruleOptions = availabilityRules.map(r => `
    <option value="${escAttr(r.id)}">${esc(r.name)}</option>
  `).join('');

  openBulkModal({
    title: 'Расписание',
    submitLabel: 'Применить',
    bodyHtml: `
      <p class="bulk-modal-hint">Установите шаблон расписания для выбранных товаров.</p>
      <label class="bulk-modal-field">
        <span>Шаблон расписания</span>
        <select id="bulk-schedule-select" class="bulk-modal-select">
          <option value="">Доступно всегда (Без ограничений)</option>
          ${ruleOptions}
        </select>
      </label>
    `,
    onSubmit: async ({ overlay }) => {
      const ruleId = overlay.querySelector('#bulk-schedule-select')?.value || '';
      await onApply(ruleId || null);
    },
  });
}

/**
 * @param {object} p
 * @param {number} p.count
 * @param {() => void|Promise<void>} p.onApply
 */
export function openBulkArchiveModal({ count, onApply }) {
  openBulkModal({
    title: 'В архив',
    submitLabel: 'Переместить в архив',
    bodyHtml: `
      <p class="bulk-modal-hint">
        Переместить <strong>${fmtCount(count)}</strong> в архив? Товары исчезнут из меню, но останутся в истории заказов.
      </p>
    `,
    onSubmit: async () => {
      await onApply();
    },
  });
}

/**
 * @param {object} p
 * @param {number} p.count
 * @param {() => void|Promise<void>} p.onApply
 */
export function openBulkUnarchiveModal({ count, onApply }) {
  openBulkModal({
    title: 'Из архива',
    submitLabel: 'Вернуть из архива',
    bodyHtml: `
      <p class="bulk-modal-hint">
        Вернуть <strong>${fmtCount(count)}</strong> из архива? Товары снова появятся в справочнике.
      </p>
    `,
    onSubmit: async () => {
      await onApply();
    },
  });
}

/**
 * @param {object} p
 * @param {import('../services/products-data.js').ItemChannelMode[]} [p.modes]
 * @param {(mode: import('../services/products-data.js').ItemChannelMode) => void|Promise<void>} p.onApply
 */
export function openBulkAvailabilityModal({ modes, onApply }) {
  const options = modes ?? [
    { id: 'everywhere', label: 'Везде', desc: 'Личный кабинет и киоск' },
    { id: 'web', label: 'Только Веб', desc: 'Личный кабинет' },
    { id: 'kiosk', label: 'Только Киоск', desc: 'Самообслуживание на киоске' },
    { id: 'hidden', label: 'Скрыт', desc: 'Не отображается ни в одном канале' },
  ];

  openBulkModal({
    title: 'Доступность',
    submitLabel: 'Применить',
    bodyHtml: `
      <p class="bulk-modal-hint">Укажите, в каких каналах будут видны выбранные товары.</p>
      <div class="bulk-avail-options">
        ${options.map((o, i) => `
          <label class="bulk-avail-option">
            <input type="radio" name="bulk-channel" value="${escAttr(o.id)}" ${i === 0 ? 'checked' : ''} />
            <span class="bulk-avail-option-body">
              <span class="bulk-avail-option-title">${esc(o.label)}</span>
              <span class="bulk-avail-option-desc">${esc(o.desc)}</span>
            </span>
          </label>
        `).join('')}
      </div>
    `,
    onSubmit: async ({ overlay }) => {
      const mode = overlay.querySelector('input[name="bulk-channel"]:checked')?.value || 'everywhere';
      await onApply(/** @type {import('../services/products-data.js').ItemChannelMode} */ (mode));
    },
  });
}

/** @param {number} n */
function fmtCount(n) {
  return new Intl.NumberFormat('ru-RU').format(n);
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
