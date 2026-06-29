import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createLoyaltyCategoriesEditor } from '../components/loyalty-categories-editor.js';
import { ensureDefaultCrmRefs, fetchLoyaltyCategories } from '../services/crm-ref-data.js';

export class CrmLoyaltyCategoriesPage {
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
      await ensureDefaultCrmRefs();
      this.categories = await fetchLoyaltyCategories();
      this.error = null;
    } catch (err) {
      console.error('[crm-loyalty]', err);
      this.error = err.message || 'Не удалось загрузить категории';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка категорий…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="lyc-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'crm-loyalty',
      title: 'Категории лояльности',
      subtitle: 'Скидки и кэшбэк для клиентов',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#lyc-editor-host');
    if (!host) return;
    this.editor = createLoyaltyCategoriesEditor(host, {
      categories: this.categories,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
