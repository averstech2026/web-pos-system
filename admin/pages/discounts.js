import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createDiscountDirectoryEditor } from '../components/discount-directory-editor.js';
import { fetchLoyaltyCategories } from '../services/crm-ref-data.js';
import { fetchDiscountSettings } from '../services/discount-settings-data.js';

export class DiscountsPage {
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
      const [loyaltyCategories, discountSettings] = await Promise.all([
        fetchLoyaltyCategories(),
        fetchDiscountSettings(),
      ]);
      this.loyaltyCategories = loyaltyCategories;
      this.discountSettings = discountSettings;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[discounts]', err);
      this.error = err.message || 'Не удалось загрузить справочник скидок';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page dsc-page" id="dsc-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'discounts',
      title: 'Скидки',
      subtitle: 'Автоматические скидки по лояльности и ручные пресеты на кассе',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#dsc-editor-host');
    if (!host) return;

    this.editor = createDiscountDirectoryEditor(host, {
      loyaltyCategories: this.loyaltyCategories,
      discountSettings: this.discountSettings,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
