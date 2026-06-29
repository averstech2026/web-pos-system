import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createPromoRulesEditor } from '../components/promo-rules-editor.js';
import { fetchAllPromoRules } from '../services/promo-rules-data.js';
import { fetchAllAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchAllItems } from '../services/products-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';

export class MarketingPage {
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
      const items = await fetchAllItems();
      const [promos, availabilityRules, settings] = await Promise.all([
        fetchAllPromoRules(),
        fetchAllAvailabilityRules(),
        fetchMenuSettings(items.map(i => i.category)),
      ]);
      this.promos = promos;
      this.availabilityRules = availabilityRules;
      this.items = items;
      this.categoryGroups = settings.categoryGroups;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[marketing]', err);
      this.error = err.message || 'Не удалось загрузить акции';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка акций…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="prm-page card" id="prm-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'marketing',
      title: 'Маркетинг и Лояльность',
      subtitle: 'Конструктор акций: условия, расписания и поощрения',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#prm-editor-host');
    if (!host) return;

    this.editor = createPromoRulesEditor(host, {
      promos: this.promos,
      availabilityRules: this.availabilityRules,
      categoryGroups: this.categoryGroups,
      items: this.items,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
