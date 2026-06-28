import { saveAllergens } from '../services/menu-settings-data.js';

/**
 * @param {object} p
 * @param {Array<{ id: string, name: string }>} p.allergens
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function openAllergensModal({ allergens, onSaved }) {
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'allergens-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let list = allergens.map(a => ({ ...a }));

  function close() {
    overlay.remove();
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `allergen_${Date.now()}`;
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Справочник аллергенов</h2>
          <button type="button" class="admin-modal-close btn-press" id="alm-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="meta-modal-hint">Отметьте аллергены в карточке товара — клиент увидит их при заказе.</p>
          <ul class="meta-list" id="alm-list">
            ${list.map(a => `
              <li class="meta-list-item" data-id="${escAttr(a.id)}">
                <span class="meta-list-id">${esc(a.id)}</span>
                <input type="text" class="meta-list-input" value="${esc(a.name)}" data-field="name" />
                <button type="button" class="meta-list-delete btn-press" data-action="delete" title="Удалить">✕</button>
              </li>
            `).join('')}
          </ul>
          <div class="meta-add-row">
            <input type="text" class="meta-add-input" id="alm-new" placeholder="Название аллергена…" />
            <button type="button" class="btn btn-outline btn-press" id="alm-add">Добавить</button>
          </div>
          <p class="ifm-error" id="alm-error" hidden></p>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="btn btn-outline btn-press" id="alm-cancel">Отмена</button>
          <button type="button" class="btn btn-primary btn-press" id="alm-save">Сохранить</button>
        </div>
      </div>
    `;

    overlay.querySelector('#alm-close')?.addEventListener('click', close);
    overlay.querySelector('#alm-cancel')?.addEventListener('click', close);
    overlay.querySelector('#alm-add')?.addEventListener('click', addAllergen);
    overlay.querySelector('#alm-new')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') addAllergen();
    });
    overlay.querySelector('#alm-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="delete"]');
      if (!btn) return;
      const row = btn.closest('.meta-list-item');
      const id = row?.dataset.id;
      if (!id) return;
      if (!confirm('Удалить аллерген из справочника?')) return;
      list = list.filter(a => a.id !== id);
      render();
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  function addAllergen() {
    const input = overlay.querySelector('#alm-new');
    const name = input?.value.trim();
    if (!name) return;

    let id = slugify(name);
    let n = 1;
    while (list.some(a => a.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }

    list.push({ id, name });
    if (input) input.value = '';
    render();
  }

  async function save() {
    const errEl = overlay.querySelector('#alm-error');
    const btn = overlay.querySelector('#alm-save');
    errEl.hidden = true;
    btn.disabled = true;

    try {
      const rows = [...overlay.querySelectorAll('.meta-list-item')];
      const next = rows.map(row => ({
        id: row.dataset.id,
        name: row.querySelector('[data-field="name"]')?.value.trim(),
      })).filter(a => a.id && a.name);

      if (!next.length) {
        showError('Добавьте хотя бы один аллерген');
        btn.disabled = false;
        return;
      }

      await saveAllergens(next);
      close();
      await onSaved?.();
    } catch (err) {
      console.error('[allergens-modal]', err);
      showError(err.message || 'Не удалось сохранить справочник');
      btn.disabled = false;
    }
  }

  function showError(msg) {
    const errEl = overlay.querySelector('#alm-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  document.body.appendChild(overlay);
  render();
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
