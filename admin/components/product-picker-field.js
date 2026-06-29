import { openSingleProductPickerModal } from './single-product-picker-modal.js';

/**
 * @param {object} p
 * @param {string} p.fieldName - data-field for hidden input
 * @param {string} p.label
 * @param {string} [p.modalTitle]
 * @param {Array<{ id: string, name: string, category?: string }>} p.items
 * @param {string} [p.selectedId]
 */
export function renderProductPickerField({
  fieldName,
  label,
  modalTitle = 'Выбрать товар',
  items,
  selectedId = '',
}) {
  const selected = items.find(i => i.id === selectedId);

  return `
    <div
      class="ppf-root"
      data-ppf-field="${escAttr(fieldName)}"
      data-ppf-modal-title="${escAttr(modalTitle)}"
    >
      <span class="avr-field-label">${esc(label)}</span>
      <div class="ppf-body" data-ppf-body>
        ${selected
          ? renderSelectedTag(selected)
          : renderPickButton()}
      </div>
      <input type="hidden" data-field="${escAttr(fieldName)}" value="${escAttr(selectedId)}" />
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {Array<{ id: string, name: string, category?: string }>} items
 * @param {() => void} [onChange]
 */
export function bindProductPickerFields(root, items, onChange) {
  root.querySelectorAll('.ppf-root').forEach(ppf => bindOne(ppf, items, onChange));
}

/** @param {HTMLElement} ppf */
function bindOne(ppf, items, onChange) {
  const fieldName = ppf.dataset.ppfField;
  const modalTitle = ppf.dataset.ppfModalTitle || 'Выбрать товар';
  const hidden = ppf.querySelector(`input[data-field="${fieldName}"]`);
  if (!hidden) return;

  const openPicker = () => {
    openSingleProductPickerModal({
      title: modalTitle,
      items,
      selectedId: hidden.value || '',
      onSelect: id => {
        hidden.value = id;
        refreshBody(ppf, items, id);
        onChange?.();
      },
    });
  };

  ppf.addEventListener('click', e => {
    if (e.target.closest('[data-ppf-open]')) {
      e.preventDefault();
      openPicker();
    }
    if (e.target.closest('[data-ppf-clear]')) {
      e.preventDefault();
      hidden.value = '';
      refreshBody(ppf, items, '');
      onChange?.();
    }
  });
}

/** @param {HTMLElement} ppf */
function refreshBody(ppf, items, selectedId) {
  const body = ppf.querySelector('[data-ppf-body]');
  if (!body) return;
  const selected = items.find(i => i.id === selectedId);
  body.innerHTML = selected ? renderSelectedTag(selected) : renderPickButton();
}

function renderPickButton() {
  return `
    <button type="button" class="btn btn-outline btn-press ppf-pick-btn" data-ppf-open>
      + Выбрать товар из базы
    </button>
  `;
}

/** @param {{ name: string, category?: string }} item */
function renderSelectedTag(item) {
  return `
    <div class="ppf-selected">
      <div class="ppf-selected-info">
        <span class="ppf-selected-name">${esc(item.name)}</span>
        ${item.category ? `<span class="ppf-selected-cat">${esc(item.category)}</span>` : ''}
      </div>
      <button
        type="button"
        class="ppf-clear btn-press"
        data-ppf-clear
        aria-label="Сбросить выбор"
      >✕</button>
    </div>
  `;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
