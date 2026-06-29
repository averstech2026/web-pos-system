import { saveAllergens } from '../services/menu-settings-data.js';
import { showToast } from '../utils/toast.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<{ id: string, name: string }>} p.allergens
 * @param {Array<{ id: string, allergens?: string[] }>} [p.items]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createAllergensEditor(host, { allergens: initialAllergens, items = [], onSaved }) {
  /** @type {Array<{ id: string, name: string }>} */
  let allergens = initialAllergens.map(a => ({ ...a }));
  /** @type {string|null} */
  let selectedId = allergens[0]?.id || null;

  function selectedAllergen() {
    return allergens.find(a => a.id === selectedId) || null;
  }

  function productCount(allergenId) {
    return items.filter(i => Array.isArray(i.allergens) && i.allergens.includes(allergenId)).length;
  }

  function productCountLabel(allergenId) {
    const n = productCount(allergenId);
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'товар'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'товара'
        : 'товаров';
    return `${n} ${word}`;
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `allergen_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (allergens.some(a => a.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function syncPanelToState() {
    const panel = host.querySelector('#alr-detail-panel');
    if (!selectedId || !panel) return;

    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    allergens = allergens.map(a => (a.id === selectedId ? { ...a, name } : a));
  }

  function renderListRow(allergen) {
    const active = allergen.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(allergen.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">⚠</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(allergen.name)}</span>
            <span class="avr-row-meta">${productCountLabel(allergen.id)}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">⚠</span>
        <p class="avr-detail-empty-title">Выберите аллерген</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить» слева или выберите аллерген из списка, чтобы изменить название.</p>
      </div>
    `;
  }

  function renderDetailPanel(allergen) {
    const count = productCount(allergen.id);
    return `
      <div class="avr-detail-panel" id="alr-detail-panel">
        <div class="avr-detail-scroll alr-detail-scroll">
          <section class="cgr-detail-card">
            <label class="cgr-detail-name-field cgr-detail-name-field--solo">
              <span class="cgr-detail-label">Название</span>
              <input
                type="text"
                class="cgr-detail-name-input"
                data-field="name"
                value="${escAttr(allergen.name)}"
                maxlength="80"
                placeholder="Например: Глютен"
              />
            </label>
            <p class="alr-detail-id">ID: <code>${esc(allergen.id)}</code></p>
            <p class="cgr-detail-hint">
              Отметьте аллергены в карточке товара — клиент увидит их при заказе.
              ${count ? `Сейчас указан в ${productCountLabel(allergen.id)}.` : 'Пока не указан ни в одном товаре.'}
            </p>
          </section>
          <p class="ifm-error" id="alr-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="alr-delete-confirm" />
                <span>Я понимаю, что аллерген исчезнет из справочника, и подтверждаю удаление</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="alr-detail-delete" disabled>
                Удалить аллерген
              </button>
            </div>
            <div class="footer-action-bar">
              <button type="button" class="action-btn action-btn-primary btn-press" id="alr-detail-save">Сохранить изменения</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function headerText() {
    return `Аллергены (${allergens.length})`;
  }

  function render() {
    const allergen = selectedAllergen();
    host.innerHTML = `
      <div class="avr-layout alr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">${headerText()}</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="alr-create-btn">
              + Добавить
            </button>
          </div>
          <ul class="avr-list" id="alr-list">${allergens.map(a => renderListRow(a)).join('')}</ul>
          ${!allergens.length ? '<p class="avr-list-empty">Нет аллергенов. Создайте первый.</p>' : ''}
          <p class="ifm-error" id="alr-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Настройки аллергена">
          ${allergen ? renderDetailPanel(allergen) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateListRow(id) {
    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const allergen = allergens.find(a => a.id === id);
    if (!row || !allergen) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(allergen.name));
    row.querySelector('.avr-row-meta')?.replaceChildren(
      document.createTextNode(productCountLabel(id)),
    );
  }

  function showError(msg, listError = false) {
    const errEl = host.querySelector(listError ? '#alr-list-error' : '#alr-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function hideErrors() {
    host.querySelector('#alr-error')?.setAttribute('hidden', '');
    host.querySelector('#alr-list-error')?.setAttribute('hidden', '');
  }

  async function persistAll(next) {
    if (!next.length) {
      showError('Добавьте хотя бы один аллерген', true);
      return false;
    }

    const btn = host.querySelector('#alr-detail-save');
    if (btn) btn.disabled = true;

    try {
      await saveAllergens(next);
      allergens = next;
      showToast('Справочник аллергенов сохранён');
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[allergens-editor]', err);
      showError(err.message || 'Не удалось сохранить справочник');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindEvents() {
    host.querySelector('#alr-create-btn')?.addEventListener('click', () => {
      hideErrors();
      const id = uniqueId('новый_аллерген');
      const draft = { id, name: 'Новый аллерген' };
      allergens = [...allergens, draft];
      selectedId = id;
      render();
      host.querySelector('[data-field="name"]')?.focus();
      host.querySelector('[data-field="name"]')?.select();
    });

    host.querySelector('#alr-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      syncPanelToState();
      const row = btn.closest('.avr-row');
      const id = row?.dataset.id;
      if (!id || id === selectedId) return;
      selectedId = id;
      render();
    });

    host.querySelector('[data-field="name"]')?.addEventListener('input', () => {
      syncPanelToState();
      if (selectedId) updateListRow(selectedId);
    });

    host.querySelector('#alr-delete-confirm')?.addEventListener('change', e => {
      const deleteBtn = host.querySelector('#alr-detail-delete');
      if (deleteBtn) deleteBtn.disabled = !e.target.checked;
    });

    host.querySelector('#alr-detail-delete')?.addEventListener('click', async () => {
      if (!selectedId) return;
      hideErrors();
      const next = allergens.filter(a => a.id !== selectedId);
      const ok = await persistAll(next);
      if (!ok) return;
      selectedId = next[0]?.id || null;
      render();
    });

    host.querySelector('#alr-detail-save')?.addEventListener('click', async () => {
      hideErrors();
      syncPanelToState();
      const next = allergens
        .map(a => ({ id: a.id, name: a.name.trim() }))
        .filter(a => a.id && a.name);

      const names = new Set();
      for (const a of next) {
        if (names.has(a.name.toLowerCase())) {
          showError('Названия аллергенов должны быть уникальными');
          return;
        }
        names.add(a.name.toLowerCase());
      }

      const ok = await persistAll(next);
      if (ok) render();
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
  };
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
