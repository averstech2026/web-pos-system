import {
  applyPreset,
  bulkReplaceDomain,
  DEFAULT_THEME_PRIMARY,
  getDefaultPreset,
  loadPreset,
  normalizeHexColor,
  savePreset,
} from '../../shared/demo-preset.js';

/**
 * @param {HTMLElement} host
 * @param {{ onApplied?: (preset: import('../../shared/demo-preset.js').DemoPreset) => void }} [options]
 */
export function createPresetConstructorEditor(host, options = {}) {
  /** @type {import('../../shared/demo-preset.js').DemoPreset} */
  let draft = loadPreset() || getDefaultPreset();

  function persistDraft() {
    savePreset({ ...draft, applied: draft.applied });
  }

  function render() {
    const logoPreview = draft.logoDataUrl
      ? `<img src="${draft.logoDataUrl}" alt="Превью логотипа" class="dpc-logo-preview" />`
      : '<div class="dpc-logo-placeholder">Логотип не выбран</div>';

    const rows = draft.serviceUsers.map(user => `
      <tr data-user-id="${user.id}">
        <td>
          <input
            type="text"
            class="dpc-inline-input"
            data-field="name"
            value="${escapeAttr(user.name)}"
            aria-label="Имя пользователя"
          />
        </td>
        <td>
          <input
            type="email"
            class="dpc-inline-input"
            data-field="email"
            value="${escapeAttr(user.email)}"
            aria-label="Email пользователя"
          />
        </td>
      </tr>
    `).join('');

    host.innerHTML = `
      <div class="dpc-page">
        <section class="card dpc-section">
          <h2 class="dpc-section-title">1. Брендирование (логотип)</h2>
          <p class="dpc-section-desc">
            Загрузите логотип заказчика — он подменит системный логотип во всех шапках модулей.
          </p>
          <div class="dpc-logo-row">
            <div class="dpc-logo-preview-wrap brand-logo-wrap">${logoPreview}</div>
            <div class="dpc-logo-actions">
              <label class="btn btn-outline btn-press dpc-upload-btn">
                Выбрать изображение
                <input type="file" accept="image/*" id="dpc-logo-input" hidden />
              </label>
              ${draft.logoDataUrl ? '<button type="button" class="btn btn-outline btn-press" id="dpc-logo-clear">Сбросить</button>' : ''}
            </div>
          </div>
        </section>

        <section class="card dpc-section">
          <h2 class="dpc-section-title">2. Управление цветом</h2>
          <div class="dpc-color-row">
            <label class="dpc-color-label" for="dpc-theme-color">Основной цвет темы</label>
            <input
              type="color"
              id="dpc-theme-color"
              class="dpc-color-input"
              value="${escapeAttr(draft.themePrimary)}"
            />
            <code class="dpc-color-value">${escapeHtml(draft.themePrimary)}</code>
          </div>
          <div class="dpc-info-block" role="note">
            <strong>⚠️ Изменение цвета затронет:</strong>
            боковое меню админки, главные b2b-кнопки, шапки таблиц, экраны приветствия киосков
            и интерфейсы табло выдачи. Модуль кассы останется в стандартной цветовой схеме.
          </div>
        </section>

        <section class="card dpc-section">
          <h2 class="dpc-section-title">3. Служебные пользователи и маскировка доменов</h2>
          <div class="dpc-domain-row">
            <label class="dpc-domain-label" for="dpc-new-domain">Новый домен для email (вместо ifcm.demo)</label>
            <div class="dpc-domain-controls">
              <input
                type="text"
                id="dpc-new-domain"
                class="dpc-domain-input"
                placeholder="newclient.ru"
              />
              <button type="button" class="btn btn-outline btn-press" id="dpc-domain-apply">
                Применить ко всем
              </button>
            </div>
          </div>
          <div class="dpc-table-wrap">
            <table class="dpc-table">
              <thead>
                <tr>
                  <th>Логин / Имя пользователя</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody id="dpc-users-body">
                ${rows}
              </tbody>
            </table>
          </div>
        </section>

        <div class="dpc-apply-wrap">
          <button type="button" class="dpc-apply-btn btn-press" id="dpc-apply-btn">
            Применить пресет демонстрации
          </button>
          <p class="dpc-apply-hint">Изменения применяются ко всему фронтенду без перезагрузки страницы.</p>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    host.querySelector('#dpc-logo-input')?.addEventListener('change', event => {
      const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('Выберите файл изображения.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        draft.logoDataUrl = typeof reader.result === 'string' ? reader.result : null;
        persistDraft();
        render();
      };
      reader.readAsDataURL(file);
    });

    host.querySelector('#dpc-logo-clear')?.addEventListener('click', () => {
      draft.logoDataUrl = null;
      persistDraft();
      render();
    });

    host.querySelector('#dpc-theme-color')?.addEventListener('input', event => {
      const value = /** @type {HTMLInputElement} */ (event.target).value;
      draft.themePrimary = normalizeHexColor(value) || DEFAULT_THEME_PRIMARY;
      host.querySelector('.dpc-color-value').textContent = draft.themePrimary;
      persistDraft();
    });

    host.querySelector('#dpc-domain-apply')?.addEventListener('click', () => {
      const input = host.querySelector('#dpc-new-domain');
      const domain = input instanceof HTMLInputElement ? input.value.trim() : '';
      if (!domain) {
        alert('Введите новый домен, например newclient.ru');
        return;
      }
      draft.serviceUsers = bulkReplaceDomain(draft.serviceUsers, domain);
      persistDraft();
      render();
    });

    host.querySelector('#dpc-users-body')?.addEventListener('input', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const row = input.closest('tr');
      const userId = row?.getAttribute('data-user-id');
      const field = input.dataset.field;
      if (!userId || (field !== 'name' && field !== 'email')) return;

      const user = draft.serviceUsers.find(u => u.id === userId);
      if (!user) return;
      user[field] = input.value;
      persistDraft();
    });

    host.querySelector('#dpc-apply-btn')?.addEventListener('click', () => {
      const applied = applyPreset(draft);
      draft = applied;
      options.onApplied?.(applied);

      const btn = host.querySelector('#dpc-apply-btn');
      if (btn instanceof HTMLButtonElement) {
        const original = btn.textContent;
        btn.textContent = 'Пресет применён ✓';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 2200);
      }
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
  };
}

/** @param {string} value */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
