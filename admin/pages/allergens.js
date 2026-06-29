import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createAllergensEditor } from '../components/allergens-editor.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { fetchAllItems } from '../services/products-data.js';

export class AllergensPage {
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
      const settings = await fetchMenuSettings(items.map(i => i.category));
      this.items = items;
      this.allergens = settings.allergens;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[allergens]', err);
      this.error = err.message || 'Не удалось загрузить справочник аллергенов';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка аллергенов…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="alr-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'allergens',
      title: 'Аллергены',
      subtitle: 'Справочник меток для карточек товаров',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#alr-editor-host');
    if (!host) return;

    this.editor = createAllergensEditor(host, {
      allergens: this.allergens,
      items: this.items,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
