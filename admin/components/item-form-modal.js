import { createItem, updateItem } from '../services/products-data.js';
import { productThumbHtml } from '../utils/product-image.js';
import { getItemImageUrl } from '../../shared/item-images.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';
import { formatAvailabilityRuleSummary } from '../../shared/availability-rules.js';

/**
 * @param {object} p
 * @param {object|null} [p.item]
 * @param {string[]} [p.categories]
 * @param {Array<{ id: string, name: string }>} [p.allergens]
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} [p.availabilityRules]
 * @param {string|null} [p.lockedCategory]
 * @param {(saved: object) => void|Promise<void>} [p.onSaved]
 */
export function openItemFormModal({
  item = null,
  categories = [],
  allergens = [],
  availabilityRules = [],
  lockedCategory = null,
  onSaved,
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
    isAvailable: item?.isAvailable !== false,
    protein: nutrition?.protein ?? '',
    fat: nutrition?.fat ?? '',
    carbs: nutrition?.carbs ?? '',
    kcal: nutrition?.kcal ?? '',
    allergens: [...(item?.allergens || [])],
    imageUrl: item?.imageUrl || getItemImageUrl(item?.name || '') || '',
    previewObjectUrl: null,
    availabilityRuleId: selectedRuleId,
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

  overlay.innerHTML = `
    <div class="admin-modal card admin-modal--lg" role="document">
      <div class="admin-modal-head">
        <h2 class="admin-modal-title">${isEdit ? 'Редактировать товар' : 'Новый товар'}</h2>
        <button type="button" class="admin-modal-close btn-press" id="ifm-close" aria-label="Закрыть">✕</button>
      </div>

      <div class="admin-modal-body">
        <div class="ifm-form">
            <label class="ifm-check ifm-check--top">
              <input type="checkbox" id="ifm-available" ${state.isAvailable ? 'checked' : ''} />
              <span>Доступен в меню</span>
            </label>

            <div class="ifm-photo-row">
              <div class="ifm-preview" id="ifm-preview">
                ${productThumbHtml({ name: state.name, imageUrl: state.imageUrl })}
              </div>
              <div class="ifm-photo-controls">
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
                  <span>Путь к фото</span>
                  <input type="text" id="ifm-image-url" value="${escAttr(state.imageUrl)}" placeholder="/products/dish.jpg" />
                </label>
                <p class="ifm-hint ifm-hint--inline">Файлы в папке <code>products/</code></p>
              </div>
            </div>

            <label class="ifm-field ifm-field--wide">
              <span>Название</span>
              <input type="text" id="ifm-name" value="${escAttr(state.name)}" placeholder="Борщ с мясом" maxlength="120" />
            </label>

            <label class="ifm-field ifm-field--wide">
              <span>Описание</span>
              <textarea id="ifm-description" rows="3" placeholder="Состав, особенности…">${esc(state.description)}</textarea>
            </label>

            <div class="ifm-form-row ifm-form-row--2">
              <label class="ifm-field">
                <span>Группа (категория)</span>
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

              <label class="ifm-field">
                <span>Цена, ₽</span>
                <input type="number" id="ifm-price" min="0" step="1" value="${state.price}" />
              </label>
            </div>

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

      <div class="admin-modal-foot">
        <button type="button" class="action-btn action-btn-secondary btn-press" id="ifm-cancel">Отмена</button>
        <button type="button" class="action-btn action-btn-primary btn-press" id="ifm-submit">
          ${isEdit ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </div>
  `;

  const dialog = overlay.querySelector('.admin-modal');

  overlay.querySelector('#ifm-close')?.addEventListener('click', close);
  overlay.querySelector('#ifm-cancel')?.addEventListener('click', close);
  overlay.querySelector('#ifm-submit')?.addEventListener('click', submit);

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

    const data = {
      name: overlay.querySelector('#ifm-name')?.value || '',
      description: overlay.querySelector('#ifm-description')?.value || '',
      category: overlay.querySelector('#ifm-category')?.value || '',
      price: overlay.querySelector('#ifm-price')?.value,
      protein: overlay.querySelector('#ifm-protein')?.value,
      fat: overlay.querySelector('#ifm-fat')?.value,
      carbs: overlay.querySelector('#ifm-carbs')?.value,
      kcal: overlay.querySelector('#ifm-kcal')?.value,
      isAvailable: overlay.querySelector('#ifm-available')?.checked,
      allergens: [...overlay.querySelectorAll('.ifm-allergens input:checked')].map(el => el.value),
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
