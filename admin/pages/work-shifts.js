import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createWorkShiftsEditor } from '../components/work-shifts-editor.js';
import { ensureWorkShiftsMigration, fetchWorkShifts } from '../services/work-shifts-data.js';

export class WorkShiftsPage {
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
      await ensureWorkShiftsMigration();
      this.shifts = await fetchWorkShifts();
      this.error = null;
    } catch (err) {
      console.error('[work-shifts]', err);
      this.error = err.message || 'Не удалось загрузить смены';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка смен…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="wsh-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'work-shifts',
      title: 'Рабочие смены',
      subtitle: 'Справочник графиков и временных рамок смен',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#wsh-editor-host');
    if (!host) return;
    this.editor = createWorkShiftsEditor(host, {
      shifts: this.shifts,
      onSaved: () => this.loadData(),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
