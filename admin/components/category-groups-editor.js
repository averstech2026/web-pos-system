import {
  deleteCategoryOnItems,
  renameCategoryOnItems,
  saveCategoryGroups,
} from '../services/menu-settings-data.js';
import { batchSetItemCategories, setItemAvailability } from '../services/products-data.js';
import { openItemFormModal } from './item-form-modal.js';
import { openGroupProductsPickerModal } from './group-products-picker-modal.js';
import { productThumbHtml } from '../utils/product-image.js';
import {
  normalizeCategoryGroup,
  slugFromCategoryName,
  formatGroupScheduleSummary,
} from '../../shared/menu-catalog.js';
import { formatAvailabilityRuleSummary } from '../../shared/availability-rules.js';

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/menu-catalog.js').CategoryGroup[]} p.categoryGroups
 * @param {Array<{ id: string, name?: string, category?: string, isAvailable?: boolean }>} p.items
 * @param {Array<{ id: string, name: string }>} [p.allergens]
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} p.availabilityRules
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createCategoryGroupsEditor(host, { categoryGroups, items: initialItems, allergens = [], availabilityRules = [], onSaved }) {
  /** @type {import('../../shared/menu-catalog.js').CategoryGroup[]} */
  let groups = categoryGroups.map(g => ({ ...normalizeCategoryGroup(g) }));
  /** @type {Array<{ id: string, name?: string, category?: string, isAvailable?: boolean }>} */
  let items = [...initialItems];
  const originalNames = new Set(groups.map(g => g.name));
  const originalNameById = new Map(groups.map(g => [g.id, g.name]));
  /** @type {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} */
  let rules = [...availabilityRules];
  /** @type {Map<string, import('../../shared/availability-rules.js').AvailabilityRuleDoc>} */
  let rulesMap = new Map(rules.map(r => [r.id, r]));
  /** @type {string|null} */
  let selectedId = null;

  /** @type {Record<string, string>} */
  let previewObjectUrls = {};

  function groupItems(group) {
    return items.filter(i => i.category === group.name);
  }

  function productCountLabel(group) {
    const n = groupItems(group).length;
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? 'товар'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'товара'
        : 'товаров';
    return `${n} ${word}`;
  }

  function memberCount(id) {
    const group = groups.find(g => g.id === id);
    return group ? groupItems(group).length : 0;
  }

  function selectedGroup() {
    return groups.find(g => g.id === selectedId) || null;
  }

  function syncSidebarToState() {
    const panel = host.querySelector('#cgr-detail-panel');
    if (!selectedId || !panel) return;

    const ruleSelect = panel.querySelector('[data-field="availability-rule-id"]');
    const ruleId = ruleSelect?.value || null;

    const updated = normalizeCategoryGroup({
      ...groups.find(g => g.id === selectedId),
      id: selectedId,
      name: panel.querySelector('[data-field="name"]')?.value.trim() || '',
      imageUrl: panel.querySelector('[data-field="image-url"]')?.value.trim() || null,
      availabilityRuleId: ruleId || null,
    });

    groups = groups.map(g => (g.id === selectedId ? updated : g));
  }

  function renderAvailabilitySection(group) {
    const selectedRuleId = group.availabilityRuleId || '';
    const selectedRule = selectedRuleId ? rulesMap.get(selectedRuleId) : null;
    const summary = selectedRule ? formatAvailabilityRuleSummary(selectedRule) : '';

    const options = rules.map(r => `
      <option value="${escAttr(r.id)}" ${r.id === selectedRuleId ? 'selected' : ''}>${esc(r.name)}</option>
    `).join('');

    return `
      <div class="cgr-detail-subsection" id="cgr-availability-section">
        <h4 class="cgr-detail-section-title">Время доступности</h4>
        <label class="cgr-avail-select-field">
          <select class="cgr-avail-select" data-field="availability-rule-id">
            <option value="" ${!selectedRuleId ? 'selected' : ''}>Доступно всегда (Без ограничений)</option>
            ${options}
          </select>
        </label>
        <p class="cgr-avail-rule-summary" id="cgr-avail-rule-summary" ${summary ? '' : 'hidden'}>${esc(summary)}</p>
      </div>
    `;
  }

  function refreshAvailabilitySummary() {
    const group = selectedGroup();
    const summaryEl = host.querySelector('#cgr-avail-rule-summary');
    if (!group || !summaryEl) return;
    const ruleId = group.availabilityRuleId;
    const rule = ruleId ? rulesMap.get(ruleId) : null;
    const summary = rule ? formatAvailabilityRuleSummary(rule) : '';
    summaryEl.textContent = summary;
    summaryEl.hidden = !summary;
  }

  function scheduleSummaryForGroup(group) {
    const rule = group.availabilityRuleId ? rulesMap.get(group.availabilityRuleId) : null;
    return formatGroupScheduleSummary(group, rule);
  }

  function refreshAvailabilitySection() {
    const group = selectedGroup();
    const section = host.querySelector('#cgr-availability-section');
    if (!group || !section) return;
    section.outerHTML = renderAvailabilitySection(group);
    bindAvailabilitySelect();
  }

  function bindAvailabilitySelect() {
    host.querySelector('[data-field="availability-rule-id"]')?.addEventListener('change', e => {
      syncSidebarToState();
      refreshAvailabilitySummary();
      updateListRowMeta(selectedId);
    });
  }

  function renderProductList(group) {
    const inGroup = groupItems(group).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));

    if (!inGroup.length) {
      return '<p class="cgr-group-products-empty">В этой группе пока нет товаров. Создайте новый или добавьте из базы.</p>';
    }

    return inGroup.map(item => `
      <div class="cgr-product-row">
        <label class="catm-product-option catm-product-option--row" title="В продаже">
          <input
            type="checkbox"
            data-availability-toggle
            data-product-id="${escAttr(item.id)}"
            ${item.isAvailable !== false ? 'checked' : ''}
          />
          <span class="catm-product-name">${esc(item.name || '—')}</span>
          ${item.isAvailable === false ? '<span class="cgr-product-badge">Скрыт</span>' : ''}
        </label>
        <button
          type="button"
          class="cgr-product-remove btn-press"
          data-action="remove-from-group"
          data-product-id="${escAttr(item.id)}"
          title="Исключить из группы"
          aria-label="Исключить «${escAttr(item.name || 'товар')}» из группы"
        >✕</button>
      </div>
    `).join('');
  }

  function refreshProductList() {
    const group = selectedGroup();
    const list = host.querySelector('#cgr-products-list');
    const count = host.querySelector('#cgr-detail-count');
    if (!group || !list) return;
    list.innerHTML = renderProductList(group);
    if (count) count.textContent = productCountLabel(group);
    updateListRowMeta(group.id);
  }

  function renderListRow(group) {
    const active = group.id === selectedId;
    return `
      <li class="avr-row avr-row--thumb ${active ? 'avr-row--active' : ''}" data-id="${escAttr(group.id)}">
        <button type="button" class="avr-row-main btn-press" data-action="select" aria-pressed="${active}">
          <span class="avr-row-thumb">${productThumbHtml({ name: group.name, imageUrl: group.imageUrl })}</span>
          <span class="avr-row-info">
            <span class="avr-row-name">${esc(group.name)}</span>
            <span class="avr-row-meta">${memberCount(group.id)} шт. · ${esc(scheduleSummaryForGroup(group))}</span>
          </span>
        </button>
      </li>
    `;
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">📂</span>
        <p class="avr-detail-empty-title">Выберите группу</p>
        <p class="avr-detail-empty-hint">Нажмите «+ Добавить группу» слева или выберите группу из списка, чтобы настроить состав, время и фото.</p>
      </div>
    `;
  }

  function renderDetailPanel(group) {
    const previewUrl = previewObjectUrls[group.id] || group.imageUrl || '';
    const imagePath = group.imageUrl || '';

    return `
      <div class="avr-detail-panel" id="cgr-detail-panel">
        <div class="avr-detail-scroll cgr-detail-scroll">
          <section class="cgr-detail-card">
            <label class="cgr-detail-name-field cgr-detail-name-field--solo">
              <span class="cgr-detail-label">Название группы</span>
              <input type="text" class="cgr-detail-name-input" data-field="name" value="${escAttr(group.name)}" maxlength="80" />
            </label>

            <div class="cgr-detail-subsection cgr-detail-subsection--products">
              <div class="cgr-detail-section-head">
                <h3 class="cgr-detail-section-title">Товары в группе</h3>
                <span class="cgr-detail-count" id="cgr-detail-count">${productCountLabel(group)}</span>
              </div>
              <div class="cgr-group-products-toolbar">
                <button type="button" class="btn btn-outline btn-press cgr-add-product-btn" id="cgr-add-product-btn">
                  + Создать и добавить товар
                </button>
                <button type="button" class="btn btn-outline btn-press cgr-pick-products-btn" id="cgr-pick-products-btn">
                  ➕ Добавить из базы
                </button>
              </div>
              <div class="catm-products-list cgr-products-list" id="cgr-products-list">
                ${renderProductList(group)}
              </div>
            </div>
          </section>

          <section class="cgr-detail-card cgr-detail-card--muted">
            <h3 class="cgr-detail-card-title">Дополнительные настройки</h3>

            ${renderAvailabilitySection(group)}

            <div class="cgr-detail-subsection">
              <h4 class="cgr-detail-section-title">Изображение в меню</h4>
              <div class="cgr-detail-photo-row">
                <div class="cgr-detail-photo-preview" id="cgr-photo-preview">
                  ${productThumbHtml({ name: group.name, imageUrl: previewUrl })}
                </div>
                <div class="cgr-detail-photo-actions">
                  <label class="btn btn-outline btn-press catm-photo-btn">
                    Выбрать файл
                    <input type="file" data-photo-file accept="image/jpeg,image/png,image/webp" hidden />
                  </label>
                  <p class="cgr-detail-photo-path" id="cgr-photo-path-text">${esc(imagePath || 'Файл не выбран')}</p>
                  <input type="hidden" data-field="image-url" value="${escAttr(group.imageUrl || '')}" />
                </div>
              </div>
            </div>
          </section>

          <p class="ifm-error" id="cgr-error" hidden></p>
        </div>

        <div class="avr-detail-foot">
          <div class="avr-detail-foot-row">
            <div class="cgr-detail-danger cgr-detail-danger--wide">
              <label class="cgr-delete-confirm">
                <input type="checkbox" id="cgr-delete-confirm" />
                <span>Я понимаю, что товары группы перейдут в «Прочее», и подтверждаю удаление</span>
              </label>
              <button type="button" class="action-btn action-btn-danger btn-press cgr-detail-delete" id="cgr-detail-delete" disabled>
                Удалить группу
              </button>
            </div>
            <div class="footer-action-bar">
              <button type="button" class="action-btn action-btn-primary btn-press" id="cgr-detail-save">Сохранить изменения</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function groupsHeaderText() {
    return `Группы (${groups.length})`;
  }

  function render() {
    const group = selectedGroup();
    host.innerHTML = `
      <div class="avr-layout cgr-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">${groupsHeaderText()}</h2>
            <button type="button" class="btn btn-primary btn-press products-create-btn" id="cgr-create-btn">
              + Добавить группу
            </button>
          </div>
          <ul class="avr-list" id="cgr-list">${groups.map(g => renderListRow(g)).join('')}</ul>
          ${!groups.length ? '<p class="avr-list-empty">Нет групп. Создайте первую.</p>' : ''}
          <p class="ifm-error" id="cgr-list-error" hidden></p>
        </div>
        <aside class="avr-detail" aria-label="Настройки группы">
          ${group ? renderDetailPanel(group) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bindEvents();
  }

  function updateListRowMeta(id) {
    const row = host.querySelector(`.avr-row[data-id="${id}"]`);
    const group = groups.find(g => g.id === id);
    if (!row || !group) return;
    row.querySelector('.avr-row-name')?.replaceChildren(document.createTextNode(group.name));
    row.querySelector('.avr-row-meta')?.replaceChildren(
      document.createTextNode(`${memberCount(id)} шт. · ${scheduleSummaryForGroup(group)}`),
    );
    row.querySelector('.avr-row-thumb')?.replaceChildren();
    row.querySelector('.avr-row-thumb')?.insertAdjacentHTML(
      'afterbegin',
      productThumbHtml({ name: group.name, imageUrl: group.imageUrl }),
    );
  }

  function updatePhotoPreview() {
    const group = selectedGroup();
    const preview = host.querySelector('#cgr-photo-preview');
    if (!group || !preview) return;
    const path = host.querySelector('[data-field="image-url"]')?.value.trim();
    const imageUrl = previewObjectUrls[group.id] || path || group.imageUrl || '';
    preview.innerHTML = productThumbHtml({ name: group.name, imageUrl });
    const pathText = host.querySelector('#cgr-photo-path-text');
    if (pathText) pathText.textContent = path || 'Файл не выбран';
    updateListRowMeta(group.id);
  }

  function bindEvents() {
    host.querySelector('#cgr-create-btn')?.addEventListener('click', addCategory);

    host.querySelector('#cgr-list')?.addEventListener('click', e => {
      const selectBtn = e.target.closest('[data-action="select"]');
      if (!selectBtn) return;
      const id = selectBtn.closest('.avr-row')?.dataset.id;
      if (!id || id === selectedId) return;
      syncSidebarToState();
      selectedId = id;
      render();
    });

    host.querySelector('#cgr-detail-save')?.addEventListener('click', () => save());
    host.querySelector('#cgr-delete-confirm')?.addEventListener('change', e => {
      const btn = host.querySelector('#cgr-detail-delete');
      if (!btn) return;
      btn.disabled = !e.target.checked;
      btn.classList.toggle('cgr-detail-delete--active', e.target.checked);
    });
    host.querySelector('#cgr-detail-delete')?.addEventListener('click', () => deleteSelectedGroup());
    host.querySelector('#cgr-add-product-btn')?.addEventListener('click', openCreateProductModal);
    host.querySelector('#cgr-pick-products-btn')?.addEventListener('click', openPickProductsModal);

    host.querySelector('#cgr-detail-panel')?.addEventListener('click', async e => {
      const removeBtn = e.target.closest('[data-action="remove-from-group"]');
      if (removeBtn && selectedId) {
        e.preventDefault();
        const itemId = removeBtn.dataset.productId;
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        removeBtn.disabled = true;
        try {
          await batchSetItemCategories([{ id: itemId, category: 'Прочее' }]);
          item.category = 'Прочее';
          refreshProductList();
        } catch (err) {
          console.error('[category-groups] remove product', err);
          removeBtn.disabled = false;
          showError(err.message || 'Не удалось исключить товар из группы');
        }
        return;
      }
    });

    bindAvailabilitySelect();

    host.querySelector('#cgr-detail-panel')?.addEventListener('input', e => {
      if (!selectedId) return;

      if (e.target.matches('[data-field="name"]')) {
        syncSidebarToState();
        updateListRowMeta(selectedId);
        return;
      }
    });

    host.querySelector('#cgr-detail-panel')?.addEventListener('change', async e => {
      if (!selectedId) return;

      if (e.target.matches('[data-photo-file]')) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (previewObjectUrls[selectedId]) URL.revokeObjectURL(previewObjectUrls[selectedId]);
        previewObjectUrls[selectedId] = URL.createObjectURL(file);
        const pathInput = host.querySelector('[data-field="image-url"]');
        if (pathInput && !pathInput.value.trim()) pathInput.value = `/products/${file.name}`;
        syncSidebarToState();
        updatePhotoPreview();
        return;
      }

      if (!e.target.matches('[data-availability-toggle]')) return;
      const itemId = e.target.dataset.productId;
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      const next = e.target.checked;
      const prev = item.isAvailable !== false;
      item.isAvailable = next;

      try {
        await setItemAvailability(itemId, next);
        refreshProductList();
      } catch (err) {
        console.error('[category-groups] availability', err);
        item.isAvailable = prev;
        e.target.checked = prev;
        showError(err.message || 'Не удалось изменить статус продажи');
      }
    });
  }

  function openPickProductsModal() {
    syncSidebarToState();
    const group = selectedGroup();
    if (!group?.name?.trim()) {
      showError('Сначала укажите название группы');
      return;
    }

    openGroupProductsPickerModal({
      groupName: group.name,
      items,
      onApplied: updates => {
        for (const { id, category } of updates) {
          const item = items.find(i => i.id === id);
          if (item) item.category = category;
        }
        refreshProductList();
      },
    });
  }

  function openCreateProductModal() {
    syncSidebarToState();
    const group = selectedGroup();
    if (!group?.name?.trim()) {
      showError('Сначала укажите название группы');
      return;
    }

    openItemFormModal({
      categories: groups.map(g => g.name),
      allergens,
      availabilityRules: rules,
      lockedCategory: group.name,
      onSaved: saved => {
        if (!saved?.id) return;
        const idx = items.findIndex(i => i.id === saved.id);
        if (idx >= 0) items[idx] = { ...items[idx], ...saved };
        else items.push(saved);
        items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
        refreshProductList();
      },
    });
  }

  async function deleteSelectedGroup() {
    const confirmEl = host.querySelector('#cgr-delete-confirm');
    if (!confirmEl?.checked || !selectedId) return;

    const idToDelete = selectedId;
    syncSidebarToState();

    const prevGroups = groups;
    const prevSelectedId = selectedId;
    groups = groups.filter(g => g.id !== idToDelete);
    selectedId = groups[0]?.id || null;

    const ok = await save();
    if (!ok) {
      groups = prevGroups;
      selectedId = prevSelectedId;
      render();
    }
  }

  function addCategory() {
    syncSidebarToState();

    let name = 'Новая группа';
    let n = 2;
    while (groups.some(g => g.name === name)) {
      name = `Новая группа ${n}`;
      n += 1;
    }

    const id = `${slugFromCategoryName(name)}-${Date.now()}`;
    groups.push(normalizeCategoryGroup({ id, name }));
    selectedId = id;
    render();

    requestAnimationFrame(() => {
      const nameInput = host.querySelector('[data-field="name"]');
      nameInput?.focus();
      nameInput?.select();
    });
  }

  async function save() {
    syncSidebarToState();
    const errEl = host.querySelector('#cgr-error');
    if (errEl) errEl.hidden = true;

    const btn = host.querySelector('#cgr-detail-save');
    if (btn) btn.disabled = true;

    try {
      const next = [];
      const names = new Set();

      for (const g of groups) {
        const name = g.name?.trim();
        if (!name) throw new Error('Имя группы не может быть пустым');
        if (names.has(name)) throw new Error(`Группа «${name}» указана дважды`);
        names.add(name);

        const normalized = normalizeCategoryGroup({
          ...g,
          name,
          availabilityRuleId: g.availabilityRuleId || null,
        });

        const oldName = originalNameById.get(g.id);
        if (oldName && oldName !== name) await renameCategoryOnItems(oldName, name);
        next.push(normalized);
      }

      const nextNames = new Set(next.map(g => g.name));
      for (const oldName of originalNames) {
        if (!nextNames.has(oldName)) await deleteCategoryOnItems(oldName, 'Прочее');
      }

      await saveCategoryGroups(next);
      await onSaved?.();
      return true;
    } catch (err) {
      console.error('[category-groups]', err);
      showError(err.message || 'Не удалось сохранить группы');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function showError(msg) {
    const errEl = host.querySelector('#cgr-error') || host.querySelector('#cgr-list-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function destroy() {
    for (const url of Object.values(previewObjectUrls)) {
      if (url) URL.revokeObjectURL(url);
    }
    host.innerHTML = '';
  }

  render();

  return { save, destroy };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
