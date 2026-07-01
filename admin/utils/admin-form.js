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

/**
 * Channel visibility + web/kiosk order row (single grid line).
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.mode
 * @param {Array<{ id: string, label: string }>} p.modes
 * @param {number} [p.webOrder]
 * @param {number} [p.kioskOrder]
 * @param {string} p.modeDataAttr e.g. data-group-channel-mode
 * @param {string} [p.ariaLabel]
 * @param {string} [p.webOrderField] data-field for web order input
 * @param {string} [p.kioskOrderField] data-field for kiosk order input
 * @param {string} [p.webOrderId]
 * @param {string} [p.kioskOrderId]
 * @param {boolean} [p.showOrderFields=true]
 */
export function renderChannelAvailabilityGrid({
  id = 'entity-visibility-section',
  mode,
  modes,
  webOrder = 0,
  kioskOrder = 0,
  modeDataAttr,
  ariaLabel = 'Доступность',
  webOrderField = 'web-order',
  kioskOrderField = 'kiosk-order',
  webOrderId = 'admin-web-order',
  kioskOrderId = 'admin-kiosk-order',
  showOrderFields = true,
}) {
  const tabsHtml = `
    <div class="admin-channel-tabs-wrap">
      <div class="period-tabs admin-channel-tabs admin-channel-tabs--h10" role="radiogroup" aria-label="${escAttr(ariaLabel)}">
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
        ${renderAdminFieldLabel('Доступность')}
        ${tabsHtml}
      </div>
    `;
  }

  return `
    <div class="admin-channel-grid" id="${escAttr(id)}">
      <div class="admin-channel-field">
        ${renderAdminFieldLabel('Доступность')}
        ${tabsHtml}
      </div>
      <div class="admin-channel-field">
        ${renderAdminFieldLabel('Порядок в Веб', { forId: webOrderId })}
        <input
          id="${escAttr(webOrderId)}"
          type="number"
          class="admin-field-input"
          data-field="${escAttr(webOrderField)}"
          min="0"
          step="1"
          value="${escAttr(String(webOrder ?? 0))}"
        />
      </div>
      <div class="admin-channel-field">
        ${renderAdminFieldLabel('Порядок на Киоске', { forId: kioskOrderId })}
        <input
          id="${escAttr(kioskOrderId)}"
          type="number"
          class="admin-field-input"
          data-field="${escAttr(kioskOrderField)}"
          min="0"
          step="1"
          value="${escAttr(String(kioskOrder ?? 0))}"
        />
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
