import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createProductionCalendarEditor } from '../components/production-calendar-editor.js';
import { loadOrSyncProductionCalendar, fetchProductionCalendar } from '../services/production-calendar-data.js';

export class CalendarDaysPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.editor = null;
    this.loading = true;
    this.error = null;
    this.year = new Date().getFullYear();
    this.days = {};
    this.manualOverrides = {};
    this.apiDays = null;
    this.syncedAt = null;
    this.init();
  }

  async init() {
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    const remount = !this.editor;

    if (remount) {
      this.loading = true;
      this.error = null;
      this.renderShell();
    } else {
      this.editor.setLoading(true);
    }

    try {
      this.days = await loadOrSyncProductionCalendar(this.year, { forceSync: false });
      const meta = await fetchProductionCalendar(this.year);
      this.syncedAt = meta?.syncedAt ?? null;
      this.manualOverrides = meta?.manualOverrides ?? {};
      this.apiDays = meta?.apiDays ?? null;
      this.loading = false;

      if (remount) {
        this.renderShell();
      } else {
        this.editor.setLoading(false);
        this.editor.updateData({
          year: this.year,
          days: this.days,
          manualOverrides: this.manualOverrides,
          apiDays: this.apiDays,
          syncedAt: this.syncedAt,
        });
      }
    } catch (err) {
      console.error('[calendar-days]', err);
      this.error = err.message || 'Не удалось загрузить производственный календарь';
      this.loading = false;
      if (remount) {
        this.renderShell();
      } else {
        this.editor.setLoading(false);
        alert(this.error);
      }
    }
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка календаря…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="pc-page card" id="pc-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'calendar',
      title: 'Календарь дней',
      subtitle: 'Праздники, выходные и переносы — единый справочник для товаров, акций и смен',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);

    if (!this.loading && !this.error) {
      this.mountEditor();
    }
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#pc-editor-host');
    if (!host) return;

    this.editor = createProductionCalendarEditor(host, {
      year: this.year,
      days: this.days,
      manualOverrides: this.manualOverrides,
      apiDays: this.apiDays,
      syncedAt: this.syncedAt,
      onYearChange: year => {
        this.year = year;
        this.loadData();
      },
      onSynced: ({ days, manualOverrides, apiDays, syncedAt }) => {
        this.days = days;
        this.manualOverrides = manualOverrides ?? {};
        this.apiDays = apiDays ?? null;
        this.syncedAt = syncedAt;
      },
      onDaySaved: ({ days, manualOverrides, apiDays }) => {
        this.days = days;
        this.manualOverrides = manualOverrides ?? {};
        this.apiDays = apiDays ?? null;
      },
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
