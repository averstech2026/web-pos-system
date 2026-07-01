import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createLunchesEditor } from '../components/lunches-editor.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchPaymentMethods } from '../services/payments-data.js';
import { fetchLunches, fetchPickerCatalogItems } from '../services/lunches-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';

export class LunchesPage {
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
    this.error = null;
    this.renderShell();

    try {
      const [lunches, catalogItems, availabilityRules, paymentMethods, settings] = await Promise.all([
        fetchLunches(),
        fetchPickerCatalogItems(),
        fetchActiveAvailabilityRules(),
        fetchPaymentMethods(),
        fetchMenuSettings(),
      ]);
      this.lunches = lunches;
      this.catalogItems = catalogItems;
      this.availabilityRules = availabilityRules;
      this.paymentMethods = paymentMethods;
      this.modifierGroups = settings.modifierGroups;
      this.allergens = settings.allergens;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[lunches]', err);
      this.error = err.message || 'Не удалось загрузить конструктор ланчей';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка ланчей…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="lnc-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'lunches',
      title: 'Конструктор ланчей',
      subtitle: 'Составные комбо — наполнение шагами из обычных товаров',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#lnc-editor-host');
    if (!host) return;

    this.editor = createLunchesEditor(host, {
      lunches: this.lunches,
      catalogItems: this.catalogItems,
      availabilityRules: this.availabilityRules,
      paymentMethods: this.paymentMethods,
      modifierGroups: this.modifierGroups,
      allergens: this.allergens,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
