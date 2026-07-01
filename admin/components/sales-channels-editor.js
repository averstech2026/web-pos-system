import { formatAvailabilityRuleShort } from '../../shared/availability-rules.js';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  SALES_CHANNEL_IDS,
  SALES_CHANNEL_ROUTING_MODES,
  SALES_CHANNEL_STATUS,
  SALES_CHANNEL_STATUS_OPTIONS,
  normalizeSalesChannel,
  resolveSalesChannelRoutingMode,
  routingFlagsFromMode,
} from '../../shared/sales-channels.js';
import { saveSalesChannel } from '../services/sales-channels-data.js';
import { showToast } from '../utils/toast.js';
import {
  bindAvrDetailCancel,
  renderAvrDetailStickyHead,
  runWithUnsavedGuard,
} from '../utils/avr-unsaved-changes.js';
import { renderChannelAvailabilityGrid } from '../utils/admin-form.js';

const SCH_ICON_KIOSK = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10"/><path d="M12 16v4"/><path d="M8 8h.01M12 8h.01M16 8h.01"/></svg>`;

const SCH_ICON_WEB = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>`;

/** @param {string} channelId */
function channelRowIcon(channelId) {
  return channelId === SALES_CHANNEL_IDS.KIOSK ? SCH_ICON_KIOSK : SCH_ICON_WEB;
}

/**
 * @param {HTMLElement} host
 * @param {object} p
 * @param {import('../../shared/sales-channels.d.ts').SalesChannel[]} p.channels
 * @param {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} [p.availabilityRules]
 * @param {() => void|Promise<void>} [p.onSaved]
 */
export function createSalesChannelsEditor(host, {
  channels: initialChannels,
  availabilityRules = [],
  onSaved,
}) {
  /** @type {import('../../shared/sales-channels.d.ts').SalesChannel[]} */
  let channels = initialChannels.map(ch => ({ ...ch }));
  /** @type {import('../../shared/availability-rules.js').AvailabilityRuleDoc[]} */
  const activeRules = availabilityRules.filter(r => r.status !== 'archived');
  /** @type {string|null} */
  let selectedId = null;
  let saving = false;

  /** @type {string} */
  let baselineJson = '';

  function snapshot() {
    return JSON.stringify(
      channels.map(ch => ({
        id: ch.id,
        name: ch.name.trim(),
        status: ch.status,
        sendToKitchen: ch.sendToKitchen,
        sendToDelivery: ch.sendToDelivery,
        scheduleId: ch.scheduleId || null,
        maintenanceMessage: ch.maintenanceMessage || '',
      })).sort((a, b) => a.id.localeCompare(b.id)),
    );
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
    const parsed = JSON.parse(baselineJson);
    channels = channels.map(ch => {
      const saved = parsed.find(p => p.id === ch.id);
      return saved ? { ...ch, ...saved } : ch;
    });
    if (selectedId && !channels.some(ch => ch.id === selectedId)) {
      selectedId = null;
    }
  }

  commitBaseline();

  function selectedChannel() {
    return channels.find(ch => ch.id === selectedId) || null;
  }

  function isChannelHidden(channel) {
    return channel.status === SALES_CHANNEL_STATUS.HIDDEN;
  }

  function partitionChannelsForList() {
    const active = channels.filter(ch => !isChannelHidden(ch));
    const hidden = channels.filter(ch => isChannelHidden(ch));
    return { active, hidden };
  }

  function renderHiddenChannelsDivider(count) {
    if (count <= 0) return '';
    return `
      <li class="cgr-list-divider sch-list-divider" aria-hidden="true">
        <span class="cgr-list-divider-text">— Скрытые каналы продаж (${count}) —</span>
      </li>
    `;
  }

  function renderListItemsHtml() {
    const { active, hidden } = partitionChannelsForList();
    return [
      ...active.map(ch => renderRow(ch)),
      renderHiddenChannelsDivider(hidden.length),
      ...hidden.map(ch => renderRow(ch)),
    ].join('');
  }

  function refreshListOrder() {
    const list = host.querySelector('#sch-list');
    if (!list) return;
    list.innerHTML = renderListItemsHtml();
  }

  function channelStatusHtml(channel) {
    const isActive = channel.status !== SALES_CHANNEL_STATUS.HIDDEN;
    if (isActive) {
      return `
        <span class="products-channel-status sch-row-status-wrap">
          <span class="prm-row-status prm-row-status--on" aria-hidden="true"></span>
          <span class="products-channel-label">Активен</span>
        </span>
      `;
    }
    return `
      <span class="products-channel-status sch-row-status-wrap">
        <span class="prm-row-status prm-row-status--off" aria-hidden="true"></span>
        <span class="products-channel-label products-channel-label--off">Отключен</span>
      </span>
    `;
  }

  function channelMetaHtml(channel) {
    const parts = [channelStatusHtml(channel)];
    if (channel.scheduleId) {
      const rule = activeRules.find(r => r.id === channel.scheduleId);
      parts.push(esc(rule ? rule.name : 'По расписанию'));
    }
    return parts.join(' · ');
  }

  /** @param {'delivery'|'kitchen'} route @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function routingBadgeHtml(route, channel) {
    const isDelivery = route === 'delivery';
    const active = isDelivery ? channel.sendToDelivery !== false : channel.sendToKitchen !== false;
    const shortLabel = isDelivery ? 'Выд' : 'Кух';
    const label = isDelivery ? 'Выдача' : 'Кухонный монитор';
    const classes = [
      'cgr-channel-badge',
      'sch-routing-badge',
      isDelivery ? 'cgr-channel-badge--web' : 'cgr-channel-badge--kiosk',
      active ? 'cgr-channel-badge--active' : 'cgr-channel-badge--inactive',
    ].join(' ');

    return `
      <button
        type="button"
        class="${classes} btn-press"
        data-action="toggle-routing"
        data-route="${escAttr(route)}"
        title="${escAttr(label)}"
        aria-label="${escAttr(label)}"
        aria-pressed="${active}"
      >${shortLabel}</button>
    `;
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function routingIndicatorsHtml(channel) {
    return `${routingBadgeHtml('kitchen', channel)}${routingBadgeHtml('delivery', channel)}`;
  }

  function syncRoutingPanelFromState() {
    const panel = host.querySelector('#sch-detail-panel');
    const channel = selectedChannel();
    if (!panel || !channel) return;

    const mode = resolveSalesChannelRoutingMode(channel.sendToKitchen, channel.sendToDelivery);
    panel.querySelectorAll('[data-sch-routing-mode]').forEach(btn => {
      const active = btn.dataset.schRoutingMode === mode;
      btn.classList.toggle('period-tab--active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  /** @param {string} channelId @param {'delivery'|'kitchen'} route */
  function toggleRoutingOnRow(channelId, route) {
    const channel = channels.find(ch => ch.id === channelId);
    if (!channel) return;

    const next = route === 'delivery'
      ? { ...channel, sendToDelivery: !channel.sendToDelivery }
      : { ...channel, sendToKitchen: !channel.sendToKitchen };

    channels = channels.map(ch => (ch.id === channelId ? next : ch));
    updateListRow(channelId);
    if (channelId === selectedId) syncRoutingPanelFromState();
  }

  function syncPanel() {
    const panel = host.querySelector('#sch-detail-panel');
    if (!selectedId || !panel) return;

    const prevStatus = channels.find(ch => ch.id === selectedId)?.status;
    const name = panel.querySelector('[data-field="name"]')?.value.trim() || '';
    const status = panel.querySelector('[data-sch-status].period-tab--active')?.dataset.schStatus
      || SALES_CHANNEL_STATUS.ACTIVE;
    const routingMode = panel.querySelector('[data-sch-routing-mode].period-tab--active')?.dataset.schRoutingMode
      || 'everywhere';
    const { sendToKitchen, sendToDelivery } = routingFlagsFromMode(routingMode);
    const scheduleRaw = panel.querySelector('[data-field="schedule-id"]')?.value || '';
    const scheduleId = scheduleRaw ? scheduleRaw : null;
    const maintenanceMessage = panel.querySelector('[data-field="maintenance-message"]')?.value.trim() || '';

    channels = channels.map(ch => (
      ch.id === selectedId
        ? {
          ...ch,
          name: name || ch.name,
          status,
          sendToKitchen,
          sendToDelivery,
          scheduleId,
          maintenanceMessage,
        }
        : ch
    ));
    updateListRow(selectedId, { resort: prevStatus !== status });
  }

  /** @param {string} id @param {{ resort?: boolean }} [opts] */
  function updateListRow(id, { resort = false } = {}) {
    if (resort) {
      refreshListOrder();
      return;
    }

    const channel = channels.find(ch => ch.id === id);
    const row = host.querySelector(`.avr-row[data-id="${CSS.escape(id)}"]`);
    if (!channel || !row) return;

    const nameEl = row.querySelector('.avr-row-name');
    if (nameEl) nameEl.textContent = channel.name;

    const metaEl = row.querySelector('.avr-row-meta');
    if (metaEl) metaEl.innerHTML = channelMetaHtml(channel);

    const indicatorsEl = row.querySelector('.sch-row-indicators');
    if (indicatorsEl) indicatorsEl.innerHTML = routingIndicatorsHtml(channel);

    const hidden = isChannelHidden(channel);
    row.classList.toggle('sch-row--hidden', hidden);
    row.classList.toggle('cgr-row--hidden', hidden);
    row.classList.toggle('sch-row--inactive', hidden);
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderRow(channel) {
    const active = channel.id === selectedId;
    const hidden = isChannelHidden(channel);
    return `
      <li class="avr-row avr-row--thumb sch-row ${active ? 'avr-row--active' : ''} ${hidden ? 'sch-row--hidden cgr-row--hidden sch-row--inactive' : ''}" data-id="${escAttr(channel.id)}">
        <div class="avr-row-main sch-row-main cgr-row-main">
          <button type="button" class="sch-row-select btn-press" data-action="select" aria-pressed="${active}">
            <span class="cgr-row-left sch-row-left">
              <span class="sch-row-icon sch-row-icon--${escAttr(channel.id)}" aria-hidden="true">${channelRowIcon(channel.id)}</span>
              <span class="avr-row-info">
                <span class="avr-row-name">${esc(channel.name)}</span>
                <span class="avr-row-meta">${channelMetaHtml(channel)}</span>
              </span>
            </span>
          </button>
          <span class="cgr-row-indicators sch-row-indicators">${routingIndicatorsHtml(channel)}</span>
        </div>
      </li>
    `;
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderRoutingSection(channel) {
    return renderChannelAvailabilityGrid({
      id: 'sch-routing-section',
      mode: resolveSalesChannelRoutingMode(channel.sendToKitchen, channel.sendToDelivery),
      modes: SALES_CHANNEL_ROUTING_MODES,
      modeDataAttr: 'data-sch-routing-mode',
      fieldLabel: 'Маршрутизация заказа',
      ariaLabel: 'Маршрутизация заказа',
      showOrderFields: false,
    });
  }

  function renderScheduleOptions(selected) {
    return `
      <option value="" ${!selected ? 'selected' : ''}>Без расписания (круглосуточно)</option>
      ${activeRules.map(rule => `
        <option value="${escAttr(rule.id)}" ${rule.id === selected ? 'selected' : ''}>
          ${esc(rule.name)} — ${esc(formatAvailabilityRuleShort(rule))}
        </option>
      `).join('')}
    `;
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderScheduleSection(channel) {
    return `
      <div class="sch-fieldset" id="sch-schedule-section">
        <span class="sch-fieldset__legend">Расписание работы</span>
        <label class="admin-field-label" for="sch-schedule-id">Шаблон расписания</label>
        <select
          id="sch-schedule-id"
          class="admin-field-input"
          data-field="schedule-id"
        >${renderScheduleOptions(channel.scheduleId)}</select>
        <p class="sch-fieldset__hint">
          В нерабочие часы по расписанию канал будет автоматически переведён в режим отображения технической заглушки.
        </p>
      </div>
    `;
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderMaintenanceSection(channel) {
    return `
      <div class="admin-field-block" id="sch-maintenance-section">
        <label class="admin-field-label" for="sch-maintenance-message">Текст технической заглушки</label>
        <textarea
          id="sch-maintenance-message"
          class="admin-field-input sch-maintenance-textarea"
          data-field="maintenance-message"
          rows="4"
          maxlength="500"
          placeholder="${escAttr(DEFAULT_MAINTENANCE_MESSAGE)}"
        >${esc(channel.maintenanceMessage || '')}</textarea>
        <p class="sch-fieldset__hint">
          Отображается на киоске и в веб-приложении, когда канал отключён или вне расписания.
        </p>
      </div>
    `;
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderAvailabilitySection(channel) {
    return renderChannelAvailabilityGrid({
      id: 'sch-availability-section',
      mode: channel.status,
      modes: SALES_CHANNEL_STATUS_OPTIONS,
      modeDataAttr: 'data-sch-status',
      ariaLabel: 'Доступность канала',
      showOrderFields: false,
    });
  }

  /** @param {import('../../shared/sales-channels.d.ts').SalesChannel} channel */
  function renderDetailPanel(channel) {
    return `
      <div class="avr-detail-panel" id="sch-detail-panel">
        ${renderAvrDetailStickyHead({
          title: 'Настройка канала',
          cancelId: 'sch-detail-cancel',
          saveId: 'sch-detail-save',
          saveLabel: saving ? 'Сохранение…' : 'Сохранить изменения',
          saveDisabled: saving,
        })}
        <div class="avr-detail-body sch-detail-body">
          <div class="admin-form-stack">
            <div class="admin-field-block">
              <label class="admin-field-label" for="sch-name">Название канала</label>
              <input
                id="sch-name"
                type="text"
                class="admin-field-input"
                data-field="name"
                value="${escAttr(channel.name)}"
                maxlength="120"
                placeholder="Информационный киоск"
              />
            </div>
            ${renderAvailabilitySection(channel)}
            ${renderRoutingSection(channel)}
            ${renderScheduleSection(channel)}
            ${renderMaintenanceSection(channel)}
            <p class="alr-detail-id">ID: <code>${esc(channel.id)}</code></p>
          </div>
          <p class="ifm-error" id="sch-error" hidden></p>
        </div>
      </div>
    `;
  }

  function closeDetailPanel() {
    selectedId = null;
    render();
  }

  function renderDetailEmpty() {
    return `
      <div class="avr-detail-empty">
        <span class="avr-detail-empty-icon" aria-hidden="true">📡</span>
        <p class="avr-detail-empty-title">Выберите канал продаж</p>
        <p class="avr-detail-empty-hint">Выберите канал из списка слева, чтобы настроить маршрутизацию заказов и доступность.</p>
      </div>
    `;
  }

  function render() {
    const channel = selectedChannel();
    host.innerHTML = `
      <div class="avr-layout sch-layout">
        <div class="avr-master">
          <div class="avr-master-head">
            <h2 class="avr-master-title">Каналы продаж (${channels.length})</h2>
          </div>
          <ul class="avr-list" id="sch-list">${renderListItemsHtml()}</ul>
        </div>
        <aside class="avr-detail" aria-label="Настройки канала">
          ${channel ? renderDetailPanel(channel) : renderDetailEmpty()}
        </aside>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const el = host.querySelector('#sch-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  async function persistCurrent() {
    syncPanel();
    const channel = selectedChannel();
    if (!channel) return false;
    if (!channel.name?.trim()) {
      showError('Укажите название канала');
      return false;
    }

    saving = true;
    render();
    try {
      const saved = await saveSalesChannel({ ...channel });
      channels = channels.map(ch => (ch.id === saved.id ? { ...saved } : ch));
      commitBaseline();
      showToast('Настройки канала сохранены');
      await onSaved?.(saved);
      return true;
    } catch (err) {
      showError(err.message || 'Не удалось сохранить');
      return false;
    } finally {
      saving = false;
      if (selectedId) render();
    }
  }

  function bind() {
    host.querySelector('#sch-list')?.addEventListener('click', e => {
      const routingBtn = e.target.closest('[data-action="toggle-routing"]');
      if (routingBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = routingBtn.closest('.avr-row')?.dataset.id;
        const route = routingBtn.dataset.route;
        if (id && (route === 'delivery' || route === 'kitchen')) {
          toggleRoutingOnRow(id, route);
        }
        return;
      }

      const selectBtn = e.target.closest('[data-action="select"]');
      if (!selectBtn) return;
      const id = selectBtn.closest('.avr-row')?.dataset.id;
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

    const panel = host.querySelector('#sch-detail-panel');
    panel?.addEventListener('input', e => {
      if (e.target.matches('[data-field="name"], [data-field="maintenance-message"]')) syncPanel();
    });
    panel?.addEventListener('change', e => {
      if (e.target.matches('[data-field="schedule-id"]')) {
        syncPanel();
      }
    });
    panel?.addEventListener('click', e => {
      const statusBtn = e.target.closest('[data-sch-status]');
      if (statusBtn && selectedId) {
        e.preventDefault();
        panel.querySelectorAll('[data-sch-status]').forEach(btn => {
          const active = btn === statusBtn;
          btn.classList.toggle('period-tab--active', active);
          btn.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        syncPanel();
        return;
      }

      const routingBtn = e.target.closest('[data-sch-routing-mode]');
      if (!routingBtn || !selectedId) return;
      e.preventDefault();
      panel.querySelectorAll('[data-sch-routing-mode]').forEach(btn => {
        const active = btn === routingBtn;
        btn.classList.toggle('period-tab--active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      syncPanel();
    });

    host.querySelector('#sch-detail-save')?.addEventListener('click', () => persistCurrent());
    bindAvrDetailCancel(host, 'sch-detail-cancel', {
      isDirty,
      discard: discardChanges,
      save: persistCurrent,
      onClose: closeDetailPanel,
    });
  }

  render();

  return {
    destroy() {
      host.innerHTML = '';
    },
    isDirty,
    /** @param {import('../../shared/sales-channels.d.ts').SalesChannel[]} next */
    replaceChannels(next) {
      const selected = selectedId;
      channels = next.map(ch => ({ ...normalizeSalesChannel(ch, ch.id) }));
      selectedId = selected && channels.some(ch => ch.id === selected) ? selected : null;
      commitBaseline();
      render();
    },
  };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
