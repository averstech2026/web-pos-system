import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createUserGroupsEditor } from '../components/user-groups-editor.js';
import { ensureDefaultCrmRefs, fetchUserGroups } from '../services/crm-ref-data.js';
import { ensureDefaultWallets, fetchWallets } from '../services/wallets-data.js';

export class CrmUserGroupsPage {
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
      await Promise.all([ensureDefaultCrmRefs(), ensureDefaultWallets()]);
      [this.groups, this.wallets] = await Promise.all([
        fetchUserGroups(),
        fetchWallets(),
      ]);
      this.error = null;
    } catch (err) {
      console.error('[crm-groups]', err);
      this.error = err.message || 'Не удалось загрузить группы';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка групп…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="ugg-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'crm-groups',
      title: 'Группы клиентов',
      subtitle: 'Справочник организаций и контрагентов',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#ugg-editor-host');
    if (!host) return;
    this.editor = createUserGroupsEditor(host, {
      groups: this.groups,
      wallets: this.wallets,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
