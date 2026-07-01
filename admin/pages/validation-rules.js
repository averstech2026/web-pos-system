import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createValidationRulesEditor } from '../components/validation-rules-editor.js';
import { fetchUserGroups } from '../services/crm-ref-data.js';
import { fetchAllItems } from '../services/products-data.js';
import { fetchWallets, ensureDefaultWallets } from '../services/wallets-data.js';
import { fetchActiveAvailabilityRules } from '../services/availability-rules-data.js';
import { fetchAllValidationRules } from '../services/validation-rules-data.js';
import { ensureWorkShiftsMigration, fetchWorkShifts } from '../services/work-shifts-data.js';

export class ValidationRulesPage {
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
      await ensureDefaultWallets();
      await ensureWorkShiftsMigration();
      const [rules, userGroups, wallets, items, availabilityRules, workShifts] = await Promise.all([
        fetchAllValidationRules(),
        fetchUserGroups(),
        fetchWallets(),
        fetchAllItems(),
        fetchActiveAvailabilityRules(),
        fetchWorkShifts(),
      ]);
      this.rules = rules;
      this.userGroups = userGroups;
      this.wallets = wallets;
      this.items = items;
      this.availabilityRules = availabilityRules;
      this.workShifts = workShifts;
      this.loading = false;
      this.renderShell();
    } catch (err) {
      console.error('[validation-rules]', err);
      this.error = err.message || 'Не удалось загрузить правила';
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка правил…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="vld-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'validation-rules',
      title: 'Правила валидации и списания',
      subtitle: 'Конструктор правил прохода и списания пайки / средств',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#vld-editor-host');
    if (!host) return;

    this.editor = createValidationRulesEditor(host, {
      rules: this.rules,
      userGroups: this.userGroups,
      wallets: this.wallets,
      items: this.items,
      availabilityRules: this.availabilityRules || [],
      workShifts: this.workShifts || [],
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
  }
}
