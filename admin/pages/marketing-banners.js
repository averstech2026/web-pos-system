import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createMarketingBannersEditor } from '../components/marketing-banners-editor.js';
import { fetchAllMarketingBanners } from '../services/marketing-banners-data.js';
import { fetchAllAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchUserGroups } from '../services/crm-ref-data.js';

export class MarketingBannersPage {
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
      const [banners, availabilityRules, userGroups] = await Promise.all([
        fetchAllMarketingBanners(),
        fetchAllAvailabilityRules(),
        fetchUserGroups(),
      ]);
      this.banners = banners;
      this.availabilityRules = availabilityRules;
      this.userGroups = userGroups;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[marketing-banners]', err);
      this.error = err.message || 'Не удалось загрузить баннеры';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка баннеров…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page mkb-page card" id="mkb-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'marketing-banners',
      title: 'Баннеры',
      subtitle: 'Управление промо-баннерами и stories для веб-витрины и киоска самообслуживания',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#mkb-editor-host');
    if (!host) return;

    this.editor = createMarketingBannersEditor(host, {
      banners: this.banners,
      availabilityRules: this.availabilityRules,
      userGroups: this.userGroups,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
