import { saveLoyaltyCategory, deleteLoyaltyCategory } from '../services/crm-ref-data.js';
import { showToast } from '../utils/toast.js';
import { renderAvrCancelButton, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {Array<object>} p.categories
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createLoyaltyCategoriesEditor(host, { categories: initialCategories, onSaved }) {
  /** @type {Array<object>} */
  let categories = initialCategories.map(c => ({ ...c }));
  /** @type {string|null} */
  let selectedId = categories[0]?.id || null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(categories.map(c => ({ ...c })).sort((a, b) => a.id.localeCompare(b.id)));
  }

  function commitBaseline() {
    syncPanel();
    baselineJson = snapshot();
  }

  function isDirty() {
    syncPanel();
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    categories = JSON.parse(baselineJson);
    if (selectedId && !categories.some(c => c.id === selectedId)) {
      selectedId = categories[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedCategory() {
    return categories.find(c => c.id === selectedId) || null;
  }

  function syncPanel() {
    const panel = host.querySelector('#lyc-detail-panel');
    if (!selectedId || !panel) return;
    groupsUpdate({
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      discountPercent: Number(panel.querySelector('[data-field="discountPercent"]')?.value) || 0,
      cashbackPercent: Number(panel.querySelector('[data-field="cashbackPercent"]')?.value) || 0,
    });
  }

  function groupsUpdate(fields) {
    categories = categories.map(c => (c.id === selectedId ? { ...c, ...fields } : c));
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `loyalty_${Date.now()}`;
  }

  function uniqueId(name) {
    let id = slugify(name);
    let n = 1;
    while (categories.some(c => c.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function renderRow(cat) {
    const active = cat.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(cat.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="alr-row-icon" aria-hidden="true">⭐</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(cat.name)}</span>
            <span class="avr-row-meta">Скидка ${cat.discountPercent || 0}% · Кэшбэк ${cat.cashbackPercent || 0}%</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderDetail(cat) {
    return `
      <div class="avr-detail-panel" id="lyc-detail-panel">
        <div class="avr-detail-scroll">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="lyc-name">Название</label>
              <input id="lyc-name" type="text" class="admin-field-input" data-field="name" value="${escAttr(cat.name)}" maxlength="80" placeholder="Золото" />
            </div>
            <div class="ufm-grid-2">
              <div class="admin-field-block">
                <label class="admin-field-label" for="lyc-discount">Скидка, %</label>
                <input id="lyc-discount" type="number" class="admin-field-input" data-field="discountPercent" min="0" max="100" step="1" value="${cat.discountPercent ?? 0}" />
              </div>
              <div class="admin-field-block">
                <label class="admin-field-label" for="lyc-cashback">Кэшбэк, %</label>
                <input id="lyc-cashback" type="number" class="admin-field-input" data-field="cashbackPercent" min="0" max="100" step="1" value="${cat.cashbackPercent ?? 0}" />
              </div>
            </div>
            <p class="alr-detail-id">ID: <code>${esc(cat.id)}</code></p>
          </div>
          <p class="ifm-error" id="lyc-error" hidden></p>
        </div>
        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row">
            <div class="cgr-detail-danger">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="lyc-delete-confirm" />
                <span>Подтверждаю удаление категории</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="lyc-delete" disabled>Удалить категорию</button>
            </div>
            <div class="footer-action-bar">
              ${renderAvrCancelButton('lyc-cancel')}
              <button type="button" class="action-btn action-btn-primary btn-press" id="lyc-save" ${saving ? 'disabled' : ''}>
                ${saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function render() {
    const cat = selectedCategory();
    host.innerHTML = `
      <div class="avr-layout alr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Категории (${categories.length})</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="lyc-create">+ Добавить</button>
          </div>
          <ul class="avr-list" id="lyc-list">${categories.map(renderRow).join('')}</ul>
          ${!categories.length ? '<p class="avr-list-empty">Нет категорий. Создайте первую.</p>' : ''}
        </div>
        <aside class="avr-detail">
          ${cat
            ? renderDetail(cat)
            : `<div class="avr-detail-empty"><p class="avr-detail-empty-title">Выберите категорию</p></div>`}
        </aside>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#lyc-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const cat = selectedCategory();
    if (!cat?.name?.trim()) {
      showError('Укажите название категории');
      return;
    }
    saving = true;
    render();
    try {
      await saveLoyaltyCategory(cat);
      commitBaseline();
      showToast('Категория сохранена');
      await onSaved?.();
      return true;
    } catch (err) {
      showError(err.message || 'Не удалось сохранить');
      return false;
    } finally {
      saving = false;
      render();
    }
  }

  function bind() {
    host.querySelector('#lyc-create')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          const id = uniqueId('новая_категория');
          const draft = { id, name: 'Новая категория', discountPercent: 0, cashbackPercent: 0 };
          categories = [...categories, draft];
          selectedId = id;
          render();
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        },
      });
    });

    host.querySelector('#lyc-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const id = btn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: persistCurrent,
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    host.querySelector('#lyc-detail-panel')?.addEventListener('input', () => syncPanel());

    host.querySelector('#lyc-save')?.addEventListener('click', persistCurrent);
    bindAvrDetailCancel(host, 'lyc-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });

    host.querySelector('#lyc-delete-confirm')?.addEventListener('change', e => {
      host.querySelector('#lyc-delete').disabled = !e.target.checked;
    });

    host.querySelector('#lyc-delete')?.addEventListener('click', async () => {
      if (!selectedId) return;
      saving = true;
      try {
        await deleteLoyaltyCategory(selectedId);
        categories = categories.filter(c => c.id !== selectedId);
        selectedId = categories[0]?.id || null;
        commitBaseline();
        showToast('Категория удалена');
        await onSaved?.();
      } catch (err) {
        showError(err.message || 'Не удалось удалить');
      } finally {
        saving = false;
        render();
      }
    });
  }

  render();

  return { destroy() { host.innerHTML = ''; }, isDirty };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
