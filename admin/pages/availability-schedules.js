import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createAvailabilityRulesEditor } from '../components/availability-rules-editor.js';
import { fetchAllAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchAllItems } from '../services/products-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';

export class AvailabilitySchedulesPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.editor = null;
    this.loading = true;
    this.error = null;
    this.items = [];
    this.categoryGroups = [];
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
      const [rules, settings] = await Promise.all([
        fetchAllAvailabilityRules(),
        fetchMenuSettings(items.map(i => i.category)),
      ]);
      this.rules = rules;
      this.items = items;
      this.categoryGroups = settings.categoryGroups;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[availability-schedules]', err);
      this.error = err.message || 'Не удалось загрузить расписания';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка расписаний…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="avr-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'schedules',
      title: 'Расписания / Матрицы',
      subtitle: 'Централизованные шаблоны доступности для групп и товаров',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#avr-editor-host');
    if (!host) return;

    this.editor = createAvailabilityRulesEditor(host, {
      rules: this.rules,
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
