import {
  deleteCategoryOnItems,
  renameCategoryOnItems,
  saveCategories,
} from '../services/menu-settings-data.js';

/**
 * @param {object} p
 * @param {string[]} p.categories
 * @param {Array<{ category?: string }>} [p.items]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function openCategoriesModal({ categories, items = [], onSaved }) {
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'categories-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let list = [...categories];
  const original = new Set(categories);

  function close() {
    overlay.remove();
  }

  function itemCount(name) {
    return items.filter(i => i.category === name).length;
  }

  function render() {
    overlay.innerHTML = `
      <div class="admin-modal card admin-modal--md">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Группы товаров</h2>
          <button type="button" class="admin-modal-close btn-press" id="catm-close" aria-label="Закрыть">✕</button>
        </div>
        <div class="admin-modal-body">
          <p class="meta-modal-hint">Категории используются для группировки блюд в меню и фильтрах.</p>
          <ul class="meta-list" id="catm-list">
            ${list.map(name => `
              <li class="meta-list-item" data-name="${escAttr(name)}">
                <input type="text" class="meta-list-input" value="${esc(name)}" data-field="name" />
                <span class="meta-list-count">${itemCount(name)} шт.</span>
                <button type="button" class="meta-list-delete btn-press" data-action="delete" title="Удалить">✕</button>
              </li>
            `).join('')}
          </ul>
          <div class="meta-add-row">
            <input type="text" class="meta-add-input" id="catm-new" placeholder="Новая категория…" />
            <button type="button" class="btn btn-outline btn-press" id="catm-add">Добавить</button>
          </div>
          <p class="ifm-error" id="catm-error" hidden></p>
        </div>
        <div class="admin-modal-foot">
          <button type="button" class="btn btn-outline btn-press" id="catm-cancel">Отмена</button>
          <button type="button" class="btn btn-primary btn-press" id="catm-save">Сохранить</button>
        </div>
      </div>
    `;

    overlay.querySelector('#catm-close')?.addEventListener('click', close);
    overlay.querySelector('#catm-cancel')?.addEventListener('click', close);
    overlay.querySelector('#catm-add')?.addEventListener('click', addCategory);
    overlay.querySelector('#catm-save')?.addEventListener('click', save);
    overlay.querySelector('#catm-new')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') addCategory();
    });
    overlay.querySelector('#catm-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="delete"]');
      if (!btn) return;
      const row = btn.closest('.meta-list-item');
      const name = row?.dataset.name;
      if (!name) return;
      if (!confirm(`Удалить категорию «${name}»? Товары будут перенесены в «Прочее».`)) return;
      list = list.filter(c => c !== name);
      render();
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
  }

  function addCategory() {
    const input = overlay.querySelector('#catm-new');
    const name = input?.value.trim();
    if (!name) return;
    if (list.includes(name)) {
      showError('Такая категория уже есть');
      return;
    }
    list.push(name);
    render();
  }

  async function save() {
    const errEl = overlay.querySelector('#catm-error');
    const btn = overlay.querySelector('#catm-save');
    errEl.hidden = true;
    btn.disabled = true;

    try {
      const rows = [...overlay.querySelectorAll('.meta-list-item')];
      const next = [];
      for (const row of rows) {
        const oldName = row.dataset.name;
        const newLabel = row.querySelector('[data-field="name"]')?.value.trim();
        if (!newLabel) {
          showError('Имя категории не может быть пустым');
          btn.disabled = false;
          return;
        }
        if (oldName !== newLabel) {
          await renameCategoryOnItems(oldName, newLabel);
        }
        next.push(newLabel);
      }

      const nextSet = new Set(next);
      for (const old of original) {
        if (!nextSet.has(old)) {
          await deleteCategoryOnItems(old, 'Прочее');
        }
      }

      const unique = [...new Set(next)];
      await saveCategories(unique);
      close();
      await onSaved?.();
    } catch (err) {
      console.error('[categories-modal]', err);
      showError(err.message || 'Не удалось сохранить категории');
      btn.disabled = false;
    }
  }

  function showError(msg) {
    const errEl = overlay.querySelector('#catm-error');
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
