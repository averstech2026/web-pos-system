import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createCategoryGroupsEditor } from '../components/category-groups-editor.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { fetchAllItems } from '../services/products-data.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';

export class CategoryGroupsPage {
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
      const [items, availabilityRules] = await Promise.all([
        fetchAllItems(),
        fetchActiveAvailabilityRules(),
      ]);
      const settings = await fetchMenuSettings(items.map(i => i.category));
      this.items = items;
      this.categoryGroups = settings.categoryGroups;
      this.allergens = settings.allergens;
      this.modifierGroups = settings.modifierGroups;
      this.availabilityRules = availabilityRules;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[category-groups]', err);
      this.error = err.message || 'Не удалось загрузить группы';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка групп…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="cgr-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'groups',
      title: 'Группы товаров',
      subtitle: 'Категории меню: состав, фото и время доступности',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#cgr-editor-host');
    if (!host) return;

    this.editor = createCategoryGroupsEditor(host, {
      categoryGroups: this.categoryGroups,
      items: this.items,
      allergens: this.allergens,
      modifierGroups: this.modifierGroups,
      availabilityRules: this.availabilityRules,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
