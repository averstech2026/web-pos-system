import { normalizeModifierGroupIds } from '../../shared/menu-catalog.js';

/**
 * @param {ParentNode|null} root
 * @returns {string[]}
 */
export function readModifierGroupIds(root) {
  if (!root) return [];
  return normalizeModifierGroupIds(
    [...root.querySelectorAll('[data-modifier-group-id]:checked')].map(el => el.dataset.modifierGroupId),
  );
}

/**
 * @param {object} p
 * @param {string[]} [p.selectedIds]
 * @param {import('../../shared/menu-catalog.js').ModifierGroup[]} p.modifierGroups
 * @param {string} [p.hint]
 */
export function renderModifierGroupsField({ selectedIds = [], modifierGroups, hint = '' }) {
  const selected = new Set(normalizeModifierGroupIds(selectedIds));

  if (!modifierGroups.length) {
    return `
      <div class="admin-field-block mod-groups-field-block">
        <span class="admin-field-label">Модификаторы</span>
        <p class="sch-fieldset__hint">Справочник модификаторов пуст — добавьте группы в разделе «Модификаторы товаров».</p>
      </div>
    `;
  }

  return `
    <div class="admin-field-block mod-groups-field-block">
      <span class="admin-field-label">Модификаторы</span>
      ${hint ? `<p class="mod-groups-field-hint">${esc(hint)}</p>` : ''}
      <div class="mod-groups-field" role="group" aria-label="Модификаторы">
        ${modifierGroups.map(group => {
          const count = group.options?.length || 0;
          const mod10 = count % 10;
          const mod100 = count % 100;
          const variantsWord = mod10 === 1 && mod100 !== 11
            ? 'вариант'
            : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
              ? 'варианта'
              : 'вариантов';
          const requiredLabel = group.required ? 'обязательный' : 'необязательный';
          return `
            <label class="mod-groups-chip">
              <input
                type="checkbox"
                data-modifier-group-id="${escAttr(group.id)}"
                ${selected.has(group.id) ? 'checked' : ''}
              />
              <span class="mod-groups-chip__text">
                <span class="mod-groups-chip__name">${esc(group.name)}</span>
                <span class="mod-groups-chip__meta">${count} ${variantsWord} · ${requiredLabel}</span>
              </span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} s */
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
