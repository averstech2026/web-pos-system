import {
  formatModifierPriceDelta,
  normalizeModifierGroup,
  parsePriceDelta,
} from '../../shared/menu-catalog.js';
import { saveModifierGroups } from '../services/menu-settings-data.js';
import { showToast } from '../utils/toast.js';
import { renderAvrDetailStickyHead, runWithUnsavedGuard, bindAvrDetailCancel } from '../utils/avr-unsaved-changes.js';

const REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} p.modifierGroups
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createModifiersEditor(host, { modifierGroups: initialGroups, onSaved }) {
  /** @type {import('../../shared/menu-catalog.js').ModifierGroup[]} */
  let groups = initialGroups.map(g => normalizeModifierGroup({ ...g, options: (g.options || []).map(o => ({ ...o })) }));
  /** @type {string|null} */
  let selectedId = groups[0]?.id || null;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(
      groups.map(g => normalizeModifierGroup(g)).sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  function commitBaseline() {
    syncPanelToState();
    baselineJson = snapshot();
  }

  function isDirty() {
    syncPanelToState();
    return snapshot() !== baselineJson;
  }

  function discardChanges() {
    groups = JSON.parse(baselineJson);
    if (selectedId && !groups.some(g => g.id === selectedId)) {
      selectedId = groups[0]?.id || null;
    }
  }

  commitBaseline();

  function selectedGroup() {
    return groups.find(g => g.id === selectedId) || null;
  }

  function slugify(name) {
    const base = name.trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё]/gi, '')
      .slice(0, 32);
    return base || `modifier_${Date.now()}`;
  }

  function uniqueGroupId(name) {
    let id = slugify(name);
    let n = 1;
    while (groups.some(g => g.id === id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function uniqueOptionId(group, name) {
    const existing = new Set((group.options || []).map(o => o.id));
    let id = slugify(name);
    let n = 1;
    while (existing.has(id)) {
      id = `${slugify(name)}_${n++}`;
    }
    return id;
  }

  function groupMeta(group) {
    const count = group.options?.length || 0;
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'вариант'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'варианта'
        : 'вариантов';
    const required = group.required ? ' · обязательный' : '';
    return `${count} ${word}${required}`;
  }

  function syncPanelToState() {
    const panel = host.querySelector('#mod-detail-panel');
    if (!selectedId || !panel) return;

    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const required = panel.querySelector('[data-field="required"]')?.checked === true;
    const minOptions = Math.max(0, Number(panel.querySelector('[data-field="min-options"]')?.value) || 0);
    const maxOptions = Math.max(minOptions, Number(panel.querySelector('[data-field="max-options"]')?.value) || 1);

    const optionRows = [...panel.querySelectorAll('[data-option-row]')];
    const options = optionRows.map(row => ({
      id: row.dataset.optionId || '',
      name: row.querySelector('[data-field="option-name"]')?.value.trim() || '',
      priceDelta: parsePriceDelta(row.querySelector('[data-field="option-price"]')?.value),
    })).filter(o => o.id);

    groups = groups.map(g => (
      g.id === selectedId
        ? normalizeModifierGroup({ ...g, name, required, minOptions, maxOptions, options })
        : g
    ));
  }

  function renderListRow(group) {
    const active = group.id === selectedId;
    return `
      <li class="avr-row ${active ? 'avr-row--active' : ''}" data-id="${escAttr(group.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="mod-row-icon" aria-hidden="true">⚙</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(group.name)}</span>
            <span class="avr-row-meta">${esc(groupMeta(group))}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderOptionRow(option) {
    return `
      <div class="mod-options-row" data-option-row data-option-id="${escAttr(option.id)}">
        <input
          type="text"
          class="admin-field-input mod-options-input mod-options-input--name"
          data-field="option-name"
          value="${escAttr(option.name)}"
          maxlength="80"
          placeholder="Название варианта"
        />
        <input
          type="text"
          class="admin-field-input mod-options-input mod-options-input--price"
          data-field="option-price"
          value="${escAttr(formatModifierPriceDelta(option.priceDelta))}"
          placeholder="0"
          inputmode="decimal"
        />
        <button
          type="button"
          class="mod-options-remove btn-press"
          data-action="remove-option"
          title="Удалить вариант"
          aria-label="Удалить вариант"
        >${REMOVE_ICON}</button>
      </div>
    `;
  }

  function renderOptionsTable(group) {
    const options = group.options?.length
      ? group.options
      : [{ id: `opt_${Date.now()}`, name: '', priceDelta: 0 }];

    return `
      <div class="sch-fieldset mod-options-fieldset">
        <span class="sch-fieldset__legend">Список вариантов</span>
        <div class="mod-options-table-wrap">
          <div class="mod-options-head" aria-hidden="true">
            <span class="mod-options-th mod-options-th--name">Название</span>
            <span class="mod-options-th mod-options-th--price">Изменение цены</span>
            <span class="mod-options-th mod-options-th--action"></span>
          </div>
          <div class="mod-options-body" id="mod-options-body">
            ${options.map(o => renderOptionRow(o)).join('')}
          </div>
        </div>
        <button type="button" class="mod-add-option-btn btn-press" id="mod-add-option" data-action="add-option">
          + Добавить строку
        </button>
      </div>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">⚙</span>
        <p class="avr-detail-empty-title">Выберите группу модификаторов</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить» слева или выберите группу из списка, чтобы настроить правила и варианты.</p>
      </div>
    `;
  }

  function renderDetailPanel(group) {
    return `
      <div class="avr-detail-panel" id="mod-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Свойства модификатора',
          cancelId: 'mod-detail-cancel',
          saveId: 'mod-detail-save',
          saveLabel: 'Сохранить изменения',
        })}
        <div class="avr-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="mod-name">Название группы</label>
              <input
                id="mod-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(group.name)}"
                maxlength="120"
                placeholder="Например: Выбор соуса, Степень прожарки"
              />
            </div>

            <div class="sch-fieldset mod-rules-fieldset">
              <span class="sch-fieldset__legend">Правила выбора</span>
              <label class="avr-active-toggle mkb-status-toggle mod-required-toggle">
                <input type="checkbox" data-field="required" ${group.required ? 'checked' : ''} />
                <span class="avr-switch" aria-hidden="true"></span>
                <span class="avr-active-label mod-required-label">Обязательный модификатор</span>
              </label>
              <p class="sch-fieldset__hint mod-rules-hint">
                Если включено, гость не сможет добавить товар в корзину, пока не выберет хотя бы один вариант из этой группы.
              </p>
              <div class="mod-limits-block">
                <div class="mod-limits-row">
                  <label class="mod-limit-field">
                    <span class="admin-field-label" for="mod-min-options">Минимум опций</span>
                    <input
                      id="mod-min-options"
                      type="number"
                      class="admin-field-input mod-limit-input"
                      data-field="min-options"
                      min="0"
                      step="1"
                      value="${escAttr(String(group.minOptions ?? 0))}"
                    />
                  </label>
                  <label class="mod-limit-field">
                    <span class="admin-field-label" for="mod-max-options">Максимум опций</span>
                    <input
                      id="mod-max-options"
                      type="number"
                      class="admin-field-input mod-limit-input"
                      data-field="max-options"
                      min="0"
                      step="1"
                      value="${escAttr(String(group.maxOptions ?? 1))}"
                    />
                  </label>
                </div>
                <p class="sch-fieldset__hint mod-limits-hint">
                  Сколько вариантов гость может отметить в группе. Например: мин.&nbsp;1 и макс.&nbsp;1 — ровно один выбор;
                  мин.&nbsp;0 и макс.&nbsp;2 — необязательно, но не больше двух.
                </p>
              </div>
            </div>

            ${renderOptionsTable(group)}

            <p class="alr-detail-id">ID: <code>${esc(group.id)}</code></p>
          </div>
          <p class="ifm-error" id="mod-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row avr-detail-foot-row--danger-only">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="mod-delete-confirm" />
                <span>Я понимаю, что группа модификаторов будет удалена из справочника, и подтверждаю удаление</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="mod-detail-delete" disabled>
                Удалить группу
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function headerText() {
    return `Модификаторы товаров (${groups.length})`;
  }

  function render() {
    const group = selectedGroup();
    host.innerHTML = `
      <div class="avr-layout mod-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">${headerText()}</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="mod-create-btn">
              + Добавить
            </button>
          </div>
          <ul class="avr-list" id="mod-list">${groups.map(g => renderListRow(g)).join('')}</ul>
          ${!groups.length ? '<p class="avr-list-empty">Нет групп модификаторов. Создайте первую.</p>' : ''}
          <p class="ifm-error" id="mod-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Свойства модификатора">
          ${group ? renderDetailPanel(group) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateListRow(id) {
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id)}"]`);
    const group = groups.find(g => g.id === id);
    if (!row || !group) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(group.name));
    row.querySelector('.avr-row-meta')?.replaceChildren(document.createTextNode(groupMeta(group)));
  }

  function showError(msg, listError = false) {
    const errEl = host.querySelector(listError ? '#mod-list-error' : '#mod-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function hideErrors() {
    host.querySelector('#mod-error')?.setAttribute('hidden', '');
    host.querySelector('#mod-list-error')?.setAttribute('hidden', '');
  }

  function validateGroups(next) {
    if (!next.length) {
      showError('Добавьте хотя бы одну группу модификаторов', true);
      return false;
    }

    const names = new Set();
    for (const group of next) {
      if (!group.name) {
        showError('Укажите название группы модификаторов');
        return false;
      }
      const key = group.name.toLowerCase();
      if (names.has(key)) {
        showError('Названия групп модификаторов должны быть уникальными');
        return false;
      }
      names.add(key);

      if (group.maxOptions < group.minOptions) {
        showError('Максимум опций не может быть меньше минимума');
        return false;
      }

      const optionNames = new Set();
      const validOptions = (group.options || []).filter(o => o.name);
      if (!validOptions.length) {
        showError(`Добавьте хотя бы один вариант в группу «${group.name}»`);
        return false;
      }

      for (const option of validOptions) {
        const optionKey = option.name.toLowerCase();
        if (optionNames.has(optionKey)) {
          showError(`Варианты в группе «${group.name}» должны иметь уникальные названия`);
          return false;
        }
        optionNames.add(optionKey);
      }

      if (group.required && group.minOptions < 1) {
        showError(`Для обязательного модификатора «${group.name}» укажите минимум не меньше 1`);
        return false;
      }
    }

    return true;
  }

  async function persistAll(next) {
    if (!validateGroups(next)) return false;

    const btn = host.querySelector('#mod-detail-save');
    if (btn) btn.disabled = true;

    try {
      await saveModifierGroups(next);
      groups = next.map(g => normalizeModifierGroup(g));
      commitBaseline();
      showToast('Справочник модификаторов сохранён');
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[modifiers-editor]', err);
      showError(err.message || 'Не удалось сохранить справочник');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function addOptionRow() {
    syncPanelToState();
    const group = selectedGroup();
    if (!group) return;

    const option = {
      id: uniqueOptionId(group, 'новый_вариант'),
      name: '',
      priceDelta: 0,
    };

    groups = groups.map(g => (
      g.id === selectedId
        ? { ...g, options: [...(g.options || []), option] }
        : g
    ));

    const tbody = host.querySelector('#mod-options-body');
    if (tbody) {
      tbody.insertAdjacentHTML('beforeend', renderOptionRow(option));
      tbody.querySelector(`[data-option-id="${CSS.escape(option.id)}"] [data-field="option-name"]`)?.focus();
    } else {
      render();
    }
    updateListRow(selectedId);
  }

  function removeOptionRow(optionId) {
    syncPanelToState();
    const group = selectedGroup();
    if (!group) return;

    const nextOptions = (group.options || []).filter(o => o.id !== optionId);
    groups = groups.map(g => (
      g.id === selectedId ? { ...g, options: nextOptions } : g
    ));

    host.querySelector(`[data-option-id="${CSS.escape(optionId)}"]`)?.remove();
    updateListRow(selectedId);
  }

  function bindEvents() {
    host.querySelector('#mod-create-btn')?.addEventListener('click', () => {
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: () => persistAll(groups.map(g => normalizeModifierGroup(g))),
        proceed: () => {
          hideErrors();
          const id = uniqueGroupId('новая_группа');
          const draft = normalizeModifierGroup({
            id,
            name: 'Новая группа',
            required: false,
            minOptions: 0,
            maxOptions: 1,
            options: [{ id: uniqueOptionId({ options: [] }, 'вариант'), name: 'Вариант 1', priceDelta: 0 }],
          });
          groups = [...groups, draft];
          selectedId = id;
          render();
          host.querySelector('[data-field="name"]')?.focus();
          host.querySelector('[data-field="name"]')?.select();
        },
      });
    });

    host.querySelector('#mod-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="select"]');
      if (!btn) return;
      const row = btn.closest('.avr-row');
      const id = row?.dataset.id;
      if (!id || id === selectedId) return;
      runWithUnsavedGuard({
        isDirty,
        discard: discardChanges,
        save: async () => {
          syncPanelToState();
          return persistAll(groups.map(g => normalizeModifierGroup(g)));
        },
        proceed: () => {
          selectedId = id;
          render();
        },
      });
    });

    const panel = host.querySelector('#mod-detail-panel');
    panel?.querySelector('[data-field="name"]')?.addEventListener('input', () => {
      syncPanelToState();
      if (selectedId) updateListRow(selectedId);
    });

    panel?.querySelector('[data-field="required"]')?.addEventListener('change', e => {
      syncPanelToState();
      if (e.target.checked) {
        const minInput = panel.querySelector('[data-field="min-options"]');
        const maxInput = panel.querySelector('[data-field="max-options"]');
        if (minInput && Number(minInput.value) < 1) minInput.value = '1';
        if (maxInput && Number(maxInput.value) < 1) maxInput.value = '1';
        syncPanelToState();
      }
      if (selectedId) updateListRow(selectedId);
    });

    panel?.querySelectorAll('[data-field="min-options"], [data-field="max-options"]').forEach(el => {
      el.addEventListener('input', () => {
        syncPanelToState();
        if (selectedId) updateListRow(selectedId);
      });
    });

    panel?.addEventListener('click', e => {
      if (e.target.closest('[data-action="add-option"]')) {
        addOptionRow();
        return;
      }
      const removeBtn = e.target.closest('[data-action="remove-option"]');
      if (!removeBtn) return;
      const row = removeBtn.closest('[data-option-row]');
      const optionId = row?.dataset.optionId;
      if (!optionId) return;
      const group = selectedGroup();
      if ((group?.options?.length || 0) <= 1) {
        showError('В группе должен остаться хотя бы один вариант');
        return;
      }
      removeOptionRow(optionId);
    });

    panel?.addEventListener('input', e => {
      if (e.target.matches('[data-field="option-name"], [data-field="option-price"]')) {
        syncPanelToState();
        if (selectedId) updateListRow(selectedId);
      }
    });

    host.querySelector('#mod-delete-confirm')?.addEventListener('change', e => {
      const deleteBtn = host.querySelector('#mod-detail-delete');
      if (deleteBtn) deleteBtn.disabled = !e.target.checked;
    });

    host.querySelector('#mod-detail-delete')?.addEventListener('click', async () => {
      if (!selectedId) return;
      hideErrors();
      const next = groups.filter(g => g.id !== selectedId).map(g => normalizeModifierGroup(g));
      const ok = await persistAll(next);
      if (!ok) return;
      selectedId = next[0]?.id || null;
      render();
    });

    host.querySelector('#mod-detail-save')?.addEventListener('click', async () => {
      hideErrors();
      syncPanelToState();
      const next = groups.map(g => normalizeModifierGroup(g));
      const ok = await persistAll(next);
      if (ok) render();
    });

    bindAvrDetailCancel(host, 'mod-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: async () => {
        syncPanelToState();
        return persistAll(groups.map(g => normalizeModifierGroup(g)));
      },
      onClose: closeDetailPanel,
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
    isDirty,
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
