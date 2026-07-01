import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createModifiersEditor } from '../components/modifiers-editor.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';

export class ModifiersPage {
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
      const settings = await fetchMenuSettings();
      this.modifierGroups = settings.modifierGroups;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[modifiers]', err);
      this.error = err.message || 'Не удалось загрузить справочник модификаторов';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка модификаторов…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="mod-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'modifiers',
      title: 'Модификаторы товаров',
      subtitle: 'Группы опций: прожарка, соусы, добавки к блюдам',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#mod-editor-host');
    if (!host) return;

    this.editor = createModifiersEditor(host, {
      modifierGroups: this.modifierGroups,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
