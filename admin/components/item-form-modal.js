import {
  archiveItem,
  channelFlagsFromMode,
  createItem,
  ITEM_CHANNEL_MODES,
  resolveChannelMode,
  updateItem,
} from '../services/products-data.js';
import { productThumbHtml } from '../utils/product-image.js';
import { getItemImageUrl } from '../../shared/item-images.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';
import { formatAvailabilityRuleSummary } from '../../shared/availability-rules.js';
import { HONEST_SIGN_CATEGORIES } from '../../shared/pos-channel.js';
import { readModifierGroupIds, renderModifierGroupsField } from './modifier-groups-field.js';

/**
 * @param {object} p
 * @param {object|null} [p.item]
 * @param {string[]} [p.categories]
 * @param {Array<{ id: string, name: string }>} [p.allergens]
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} [p.modifierGroups]
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} [p.availabilityRules]
 * @param {string|null} [p.lockedCategory]
 * @param {(saved: object) => void|Promise<void>} [p.onSaved]
 * @param {(id: string) => void|Promise<void>} [p.onArchived]
 */
export function openItemFormModal({
  item = null,
  categories = [],
  allergens = [],
  modifierGroups = [],
  availabilityRules = [],
  lockedCategory = null,
  onSaved,
  onArchived,
}) {
  document.getElementById('item-form-modal')?.remove();

  const isEdit = !!item?.id;
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'item-form-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const nutrition = resolveItemNutrition(item || {});
  const rulesMap = new Map(availabilityRules.map(r => [r.id, r]));
  const selectedRuleId = item?.availabilityRuleId || '';

  const state = {
    name: item?.name || '',
    description: item?.description || '',
    category: lockedCategory || item?.category || categories[0] || '',
    price: item?.price ?? '',
    protein: nutrition?.protein ?? '',
    fat: nutrition?.fat ?? '',
    carbs: nutrition?.carbs ?? '',
    kcal: nutrition?.kcal ?? '',
    allergens: [...(item?.allergens || [])],
    modifierGroupIds: [...(item?.modifierGroupIds || [])],
    imageUrl: item?.imageUrl || getItemImageUrl(item?.name || '') || '',
    previewObjectUrl: null,
    availabilityRuleId: selectedRuleId,
    channelMode: resolveChannelMode(item?.visibleInWeb, item?.visibleInKiosk),
    visibleInPos: item?.visibleInPos !== false,
    honestSignMarked: item?.honestSignMarked === true,
    honestSignCategory: item?.honestSignCategory || '',
  };

  const categoryOptions = [...new Set([...categories, state.category].filter(Boolean))];
  const ruleOptions = availabilityRules.map(r => `
    <option value="${escAttr(r.id)}" ${r.id === selectedRuleId ? 'selected' : ''}>${esc(r.name)}</option>
  `).join('');
  const initialSummary = selectedRuleId && rulesMap.get(selectedRuleId)
    ? formatAvailabilityRuleSummary(rulesMap.get(selectedRuleId))
    : '';

  function close() {
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function previewItem() {
    const name = overlay.querySelector('#ifm-name')?.value || state.name;
    if (state.previewObjectUrl) {
      return { name, imageUrl: state.previewObjectUrl };
    }
    const path = overlay.querySelector('#ifm-image-url')?.value.trim() || state.imageUrl;
    return { name, imageUrl: path || getItemImageUrl(name) };
  }

  function updatePreview() {
    const el = overlay.querySelector('#ifm-preview');
    if (!el) return;
    el.innerHTML = productThumbHtml(previewItem());
  }

  function syncChannelTabs() {
    overlay.querySelectorAll('[data-channel-mode]').forEach(btn => {
      const active = btn.dataset.channelMode === state.channelMode;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  overlay.innerHTML = `
    <div class="admin-modal card admin-modal--lg" role="document">
      <div class="admin-modal-head">
        <h2 class="admin-modal-title">${isEdit ? 'Редактировать товар' : 'Новый товар'}</h2>
        <button type="button" class="admin-modal-close btn-press" id="ifm-close" aria-label="Закрыть">✕</button>
      </div>

      <div class="admin-modal-body">
        <div class="ifm-form admin-form-stack">
          <div class="admin-field-block ifm-field ifm-field--wide">
            <span class="admin-field-label">Доступность</span>
            <div class="admin-channel-tabs-wrap">
              <div class="period-tabs admin-channel-tabs admin-channel-tabs--h10 admin-channel-tabs--avail ifm-channel-tabs" role="radiogroup" aria-label="Доступность">
              ${ITEM_CHANNEL_MODES.map(o => `
                <button
                  type="button"
                  class="period-tab btn-press ${state.channelMode === o.id ? 'period-tab--active' : ''}"
                  data-channel-mode="${o.id}"
                  role="radio"
                  aria-checked="${state.channelMode === o.id}"
                >${o.label}</button>
              `).join('')}
              </div>
            </div>
          </div>

          <div class="ifm-main-grid">
            <div class="ifm-preview" id="ifm-preview">
              ${productThumbHtml({ name: state.name, imageUrl: state.imageUrl })}
            </div>

            <label class="ifm-field ifm-field--name">
              <span class="admin-field-label">Название</span>
              <input type="text" id="ifm-name" value="${escAttr(state.name)}" placeholder="Борщ с мясом" maxlength="120" />
            </label>

            <label class="ifm-field ifm-field--price">
              <span class="admin-field-label">Цена, ₽</span>
              <input type="number" id="ifm-price" min="0" step="1" value="${state.price}" />
            </label>

            <div class="ifm-photo-controls ifm-photo-controls--grid">
              <div class="ifm-photo-actions">
                <label class="btn btn-outline btn-press ifm-photo-btn">
                  Выбрать файл
                  <input type="file" id="ifm-photo-file" accept="image/jpeg,image/png,image/webp" hidden />
                </label>
                <button type="button" class="btn btn-outline btn-press ifm-photo-btn" id="ifm-photo-by-name">
                  По названию
                </button>
              </div>
              <label class="ifm-field ifm-field--wide ifm-field--compact">
                <span class="admin-field-label">Путь к фото</span>
                <input type="text" id="ifm-image-url" value="${escAttr(state.imageUrl)}" placeholder="/products/dish.jpg" />
              </label>
              <p class="ifm-hint ifm-hint--inline">Файлы в папке <code>products/</code></p>
            </div>
          </div>

          <label class="ifm-field ifm-field--wide">
            <span class="admin-field-label">Описание</span>
            <textarea id="ifm-description" rows="3" placeholder="Состав, особенности…">${esc(state.description)}</textarea>
          </label>

          <label class="ifm-field ifm-field--wide">
            <span class="admin-field-label">Группа (категория)</span>
            ${lockedCategory ? `
              <input
                type="text"
                class="ifm-category-locked"
                value="${escAttr(lockedCategory)}"
                disabled
                aria-readonly="true"
              />
              <input type="hidden" id="ifm-category" value="${escAttr(lockedCategory)}" />
            ` : `
              <select id="ifm-category">
                ${categoryOptions.map(c => `
                  <option value="${escAttr(c)}" ${c === state.category ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            `}
          </label>

          <fieldset class="ifm-fieldset">
            <legend>КБЖУ на порцию</legend>
            <div class="ifm-nutrition-grid">
              <label class="ifm-field">
                <span>Белки, г</span>
                <input type="number" id="ifm-protein" min="0" step="1" value="${state.protein}" placeholder="—" />
              </label>
              <label class="ifm-field">
                <span>Жиры, г</span>
                <input type="number" id="ifm-fat" min="0" step="1" value="${state.fat}" placeholder="—" />
              </label>
              <label class="ifm-field">
                <span>Углеводы, г</span>
                <input type="number" id="ifm-carbs" min="0" step="1" value="${state.carbs}" placeholder="—" />
              </label>
              <label class="ifm-field">
                <span>Ккал</span>
                <input type="number" id="ifm-kcal" min="0" step="1" value="${state.kcal}" placeholder="—" />
              </label>
            </div>
          </fieldset>

          ${allergens.length ? `
            <fieldset class="ifm-fieldset">
              <legend>Аллергены</legend>
              <div class="ifm-allergens">
                ${allergens.map(a => `
                  <label class="ifm-allergen">
                    <input
                      type="checkbox"
                      value="${escAttr(a.id)}"
                      ${state.allergens.includes(a.id) ? 'checked' : ''}
                    />
                    <span>${esc(a.name)}</span>
                  </label>
                `).join('')}
              </div>
            </fieldset>
          ` : `
            <p class="ifm-hint">Справочник аллергенов пуст — добавьте записи в разделе «Аллергены» в меню.</p>
          `}

          ${renderModifierGroupsField({
            selectedIds: state.modifierGroupIds,
            modifierGroups,
            hint: 'Дополнительно к модификаторам группы товара.',
          })}

          <fieldset class="ifm-fieldset">
            <legend>Честный Знак (маркировка)</legend>
            <label class="ifm-allergen">
              <input type="checkbox" id="ifm-honest-sign" ${state.honestSignMarked ? 'checked' : ''} />
              <span>Товар подлежит маркировке Честный Знак</span>
            </label>
            <label class="ifm-field" id="ifm-honest-sign-category-wrap" ${state.honestSignMarked ? '' : 'hidden'}>
              <span>Категория ЧЗ</span>
              <select id="ifm-honest-sign-category" class="ifm-select">
                <option value="">— Выберите категорию —</option>
                ${HONEST_SIGN_CATEGORIES.map(c => `
                  <option value="${escAttr(c.id)}" ${c.id === state.honestSignCategory ? 'selected' : ''}>${esc(c.label)}</option>
                `).join('')}
              </select>
            </label>
          </fieldset>

          <label class="ifm-allergen">
            <input type="checkbox" id="ifm-visible-pos" ${state.visibleInPos ? 'checked' : ''} />
            <span>Отображать на кассовом модуле</span>
          </label>

          <fieldset class="ifm-fieldset ifm-availability">
            <legend>Время доступности</legend>
            <label class="ifm-field">
              <span>Шаблон расписания</span>
              <select id="ifm-availability-rule-id" class="ifm-select">
                <option value="" ${!selectedRuleId ? 'selected' : ''}>Доступно всегда (Без ограничений)</option>
                ${ruleOptions}
              </select>
            </label>
            <p class="ifm-hint ifm-avail-rule-summary" id="ifm-avail-rule-summary" ${initialSummary ? '' : 'hidden'}>${esc(initialSummary)}</p>
          </fieldset>

          <p class="ifm-error" id="ifm-error" hidden></p>
        </div>
      </div>

      <div class="admin-modal-foot ifm-foot">
        ${isEdit ? `
          <button type="button" class="ifm-archive-btn btn-press" id="ifm-archive">В архив</button>
        ` : '<span class="ifm-foot-spacer"></span>'}
        <div class="ifm-foot-actions">
          <button type="button" class="action-btn action-btn-secondary btn-press" id="ifm-cancel">Отмена</button>
          <button type="button" class="action-btn action-btn-primary btn-press" id="ifm-submit">
            ${isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  `;

  const dialog = overlay.querySelector('.admin-modal');

  overlay.querySelector('#ifm-close')?.addEventListener('click', close);
  overlay.querySelector('#ifm-cancel')?.addEventListener('click', close);
  overlay.querySelector('#ifm-submit')?.addEventListener('click', submit);

  overlay.querySelector('#ifm-archive')?.addEventListener('click', async () => {
    if (!isEdit || !item?.id) return;
    const name = overlay.querySelector('#ifm-name')?.value.trim() || item.name || 'товар';
    if (!confirm(`Переместить «${name}» в архив? Товар исчезнет из меню, но останется в истории заказов.`)) return;

    const btn = overlay.querySelector('#ifm-archive');
    btn.disabled = true;

    try {
      await archiveItem(item.id);
      close();
      await onArchived?.(item.id);
    } catch (err) {
      console.error('[item-form] archive', err);
      showError(err.message || 'Не удалось переместить товар в архив');
      btn.disabled = false;
    }
  });

  overlay.querySelector('#ifm-honest-sign')?.addEventListener('change', e => {
    const wrap = overlay.querySelector('#ifm-honest-sign-category-wrap');
    if (wrap) wrap.hidden = !e.target.checked;
  });

  overlay.querySelectorAll('[data-channel-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.channelMode = btn.dataset.channelMode || 'web';
      syncChannelTabs();
    });
  });

  overlay.querySelector('#ifm-name')?.addEventListener('input', updatePreview);
  overlay.querySelector('#ifm-image-url')?.addEventListener('input', () => {
    state.previewObjectUrl = null;
    updatePreview();
  });

  overlay.querySelector('#ifm-photo-by-name')?.addEventListener('click', () => {
    const name = overlay.querySelector('#ifm-name')?.value.trim() || state.name;
    const url = getItemImageUrl(name) || '';
    const pathInput = overlay.querySelector('#ifm-image-url');
    if (pathInput) pathInput.value = url;
    state.previewObjectUrl = null;
    state.imageUrl = url;
    updatePreview();
  });

  overlay.querySelector('#ifm-photo-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(file);
    const pathInput = overlay.querySelector('#ifm-image-url');
    if (pathInput && !pathInput.value.trim()) {
      pathInput.value = `/products/${file.name}`;
    }
    updatePreview();
  });

  overlay.querySelector('#ifm-availability-rule-id')?.addEventListener('change', e => {
    const ruleId = e.target.value;
    const summaryEl = overlay.querySelector('#ifm-avail-rule-summary');
    const rule = ruleId ? rulesMap.get(ruleId) : null;
    const summary = rule ? formatAvailabilityRuleSummary(rule) : '';
    if (summaryEl) {
      summaryEl.textContent = summary;
      summaryEl.hidden = !summary;
    }
  });

  dialog?.addEventListener('click', e => e.stopPropagation());
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', onKeydown);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.querySelector('#ifm-name')?.focus();
  });

  async function submit() {
    const errEl = overlay.querySelector('#ifm-error');
    const btn = overlay.querySelector('#ifm-submit');
    const channelFlags = channelFlagsFromMode(state.channelMode);

    const data = {
      name: overlay.querySelector('#ifm-name')?.value || '',
      description: overlay.querySelector('#ifm-description')?.value || '',
      category: overlay.querySelector('#ifm-category')?.value || '',
      price: overlay.querySelector('#ifm-price')?.value,
      protein: overlay.querySelector('#ifm-protein')?.value,
      fat: overlay.querySelector('#ifm-fat')?.value,
      carbs: overlay.querySelector('#ifm-carbs')?.value,
      kcal: overlay.querySelector('#ifm-kcal')?.value,
      isAvailable: channelFlags.isAvailable,
      visibleInWeb: channelFlags.visibleInWeb,
      visibleInKiosk: channelFlags.visibleInKiosk,
      visibleInPos: overlay.querySelector('#ifm-visible-pos')?.checked !== false,
      honestSignMarked: overlay.querySelector('#ifm-honest-sign')?.checked === true,
      honestSignCategory: overlay.querySelector('#ifm-honest-sign-category')?.value || null,
      allergens: [...overlay.querySelectorAll('.ifm-allergens input:checked')].map(el => el.value),
      modifierGroupIds: readModifierGroupIds(overlay),
      imageUrl: overlay.querySelector('#ifm-image-url')?.value.trim() || getItemImageUrl(overlay.querySelector('#ifm-name')?.value.trim()),
      availabilityRuleId: overlay.querySelector('#ifm-availability-rule-id')?.value || null,
    };

    if (!data.name.trim()) {
      showError('Укажите название');
      return;
    }
    if (!data.category.trim()) {
      showError('Выберите группу');
      return;
    }
    if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) {
      showError('Укажите корректную цену');
      return;
    }

    btn.disabled = true;
    errEl.hidden = true;

    try {
      let saved;
      if (isEdit) {
        saved = await updateItem(item.id, data, item);
      } else {
        saved = await createItem(data);
      }
      close();
      await onSaved?.(saved);
    } catch (err) {
      console.error('[item-form]', err);
      showError(err.message || 'Не удалось сохранить товар');
      btn.disabled = false;
    }
  }

  function showError(msg) {
    const errEl = overlay.querySelector('#ifm-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }
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
