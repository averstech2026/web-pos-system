import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createSalesChannelsEditor } from '../components/sales-channels-editor.js';
import { ensureDefaultSalesChannels, fetchSalesChannels } from '../services/sales-channels-data.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { ensureDefaultPaymentMethods, fetchPaymentMethods } from '../services/payments-data.js';

export class SalesChannelsPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.editor = null;
    this.loading = true;
    this.error = null;
    this.init();
  }

  async init() {
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();
    try {
      await ensureDefaultSalesChannels();
      await ensureDefaultPaymentMethods();
      const [channels, availabilityRules, paymentMethods] = await Promise.all([
        fetchSalesChannels(),
        fetchActiveAvailabilityRules(),
        fetchPaymentMethods(),
      ]);
      this.channels = channels;
      this.availabilityRules = availabilityRules;
      this.paymentMethods = paymentMethods;
      this.error = null;
    } catch (err) {
      console.error('[sales-channels]', err);
      this.error = err.message || 'Не удалось загрузить каналы продаж';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка каналов продаж…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="sch-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'sales-channels',
      title: 'Точки и интерфейсы',
      subtitle: 'Каналы продаж и внутренние терминалы',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#sch-editor-host');
    if (!host) return;
    this.editor = createSalesChannelsEditor(host, {
      channels: this.channels,
      availabilityRules: this.availabilityRules || [],
      paymentMethods: this.paymentMethods || [],
      onSaved: async () => {
        this.channels = await fetchSalesChannels();
        this.editor?.replaceChannels(this.channels);
      },
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
