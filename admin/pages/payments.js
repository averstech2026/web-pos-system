import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createPaymentsEditor } from '../components/payments-editor.js';
import { ensureDefaultCrmRefs, fetchUserGroups } from '../services/crm-ref-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { ensureDefaultPaymentMethods, fetchPaymentMethods } from '../services/payments-data.js';

export class PaymentsPage {
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
      await ensureDefaultPaymentMethods();
      const [paymentMethods, userGroups, menuSettings] = await Promise.all([
        fetchPaymentMethods(),
        fetchUserGroups(),
        fetchMenuSettings([]),
      ]);
      this.paymentMethods = paymentMethods;
      this.userGroups = userGroups;
      this.categoryGroups = menuSettings.categoryGroups || [];
      this.error = null;
    } catch (err) {
      console.error('[payments]', err);
      this.error = err.message || 'Не удалось загрузить способы оплаты';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка способов оплаты…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="pay-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'payments',
      title: 'Платежи',
      subtitle: 'Справочник типов оплат и настройка ограничений',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#pay-editor-host');
    if (!host) return;
    this.editor = createPaymentsEditor(host, {
      paymentMethods: this.paymentMethods,
      categoryGroups: this.categoryGroups,
      userGroups: this.userGroups,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
