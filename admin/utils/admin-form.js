/**
 * Canonical admin form markup (right panels, drawers, modals).
 * CSS: admin/style.css — «Admin form pattern».
 */

/**
 * @param {string} text
 * @param {{ forId?: string }} [opts]
 */
export function renderAdminFieldLabel(text, { forId } = {}) {
  if (forId) {
    return `<label class="admin-field-label" for="${escAttr(forId)}">${esc(text)}</label>`;
  }
  return `<span class="admin-field-label">${esc(text)}</span>`;
}

function renderOutlineOrderField({ id, field, label, value }) {
  return `
    <div class="admin-outline-field">
      <span class="admin-outline-field__legend">${esc(label)}</span>
      <input
        id="${escAttr(id)}"
        type="number"
        class="admin-field-input admin-outline-field__input"
        data-field="${escAttr(field)}"
        min="0"
        step="1"
        value="${escAttr(String(value ?? 0))}"
        aria-label="${escAttr(`Порядок: ${label}`)}"
      />
    </div>
  `;
}

/**
 * Channel visibility + web/kiosk order row (single grid line).
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.mode
 * @param {Array<{ id: string, label: string }>} p.modes
 * @param {number} [p.webOrder]
 * @param {number} [p.kioskOrder]
 * @param {number} [p.posOrder]
 * @param {string} p.modeDataAttr e.g. data-group-channel-mode
 * @param {string} [p.ariaLabel]
 * @param {string} [p.webOrderField] data-field for web order input
 * @param {string} [p.kioskOrderField] data-field for kiosk order input
 * @param {string} [p.posOrderField] data-field for POS order input
 * @param {string} [p.webOrderId]
 * @param {string} [p.kioskOrderId]
 * @param {string} [p.posOrderId]
 *   @param {string} [p.fieldLabel]
  @param {boolean} [p.showOrderFields=true]
  @param {boolean} [p.showPosOrderField=false]
 */
export function renderChannelAvailabilityGrid({
  id = 'entity-visibility-section',
  mode,
  modes,
  webOrder = 0,
  kioskOrder = 0,
  posOrder = 0,
  modeDataAttr,
  ariaLabel = 'Доступность',
  fieldLabel = 'Доступность',
  webOrderField = 'web-order',
  kioskOrderField = 'kiosk-order',
  posOrderField = 'pos-order',
  webOrderId = 'admin-web-order',
  kioskOrderId = 'admin-kiosk-order',
  posOrderId = 'admin-pos-order',
  showOrderFields = true,
  showPosOrderField = false,
}) {
  const tabsHtml = `
    <div class="admin-channel-tabs-wrap">
      <div class="period-tabs admin-channel-tabs admin-channel-tabs--h10 admin-channel-tabs--avail" role="radiogroup" aria-label="${escAttr(ariaLabel)}">
        ${modes.map(o => `
          <button
            type="button"
            class="period-tab btn-press ${mode === o.id ? 'period-tab--active' : ''}"
            ${modeDataAttr}="${escAttr(o.id)}"
            role="radio"
            aria-checked="${mode === o.id}"
          >${esc(o.label)}</button>
        `).join('')}
      </div>
    </div>
  `;

  if (!showOrderFields) {
    return `
      <div class="admin-field-block" id="${escAttr(id)}">
        ${renderAdminFieldLabel(fieldLabel)}
        ${tabsHtml}
      </div>
    `;
  }

  return `
    <div class="admin-channel-section" id="${escAttr(id)}">
      <div class="admin-field-block admin-channel-section__tabs">
        ${renderAdminFieldLabel(fieldLabel)}
        ${tabsHtml}
      </div>
      <div class="admin-channel-orders ${showPosOrderField ? 'admin-channel-orders--3' : 'admin-channel-orders--2'}">
        ${renderOutlineOrderField({
          id: webOrderId,
          field: webOrderField,
          label: 'Веб',
          value: webOrder,
        })}
        ${renderOutlineOrderField({
          id: kioskOrderId,
          field: kioskOrderField,
          label: 'Киоск',
          value: kioskOrder,
        })}
        ${showPosOrderField ? renderOutlineOrderField({
          id: posOrderId,
          field: posOrderField,
          label: 'Касса',
          value: posOrder,
        }) : ''}
      </div>
    </div>
  `;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
