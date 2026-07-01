import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { fetchDashboardSnapshot, fetchPeriodAnalytics } from '../services/dashboard-data.js';
import { resolvePeriod, toDateInputValue } from '../utils/dates.js';
import {
  fmtCount,
  fmtDayLabel,
  fmtDecimal,
  fmtDeltaVsYesterday,
  fmtDuration,
  fmtHourLabel,
  fmtMoney,
  fmtPercent,
  fmtTodayLong,
} from '../utils/format.js';

function metricCard(label, value, hint = '') {
  return `
    <article class="metric-card">
      <span class="metric-card-label">${label}</span>
      <span class="metric-card-value">${value}</span>
      ${hint ? `<span class="metric-card-hint">${hint}</span>` : ''}
    </article>
  `;
}

function metricCardHot(label, value, deltaPct, hint = '', options = {}) {
  const deltaHtml = deltaPct === undefined
    ? ''
    : (() => {
        const delta = fmtDeltaVsYesterday(deltaPct, options);
        return `<span class="metric-delta ${delta.className}">${delta.text}</span>`;
      })();
  return `
    <article class="metric-card metric-card--hot">
      <span class="metric-card-label">${label}</span>
      <span class="metric-card-value">${value}</span>
      ${deltaHtml}
      ${hint ? `<span class="metric-card-hint">${hint}</span>` : ''}
    </article>
  `;
}

function periodDateLabel(preset, period, customFrom, customTo) {
  if (preset === 'day') return fmtTodayLong();
  if (preset === 'custom') {
    return `${fmtDayLabel(customFrom)} — ${fmtDayLabel(customTo)}`;
  }
  return `${fmtDayLabel(toDateInputValue(period.start))} — ${fmtDayLabel(toDateInputValue(period.end))}`;
}

function periodBar(preset, analytics, customFrom, customTo, period) {
  const a = analytics;
  const dateLabel = periodDateLabel(preset, period, customFrom, customTo);
  return `
    <section class="period-bar card" aria-label="Фильтр периода">
      <div class="period-bar-row">
        <div class="period-bar-controls">
          <div class="period-bar-heading">
            <span class="period-bar-label">Период</span>
            <time class="period-bar-date" datetime="${toDateInputValue(period.start)}">${dateLabel}</time>
          </div>
          <div class="period-tabs" role="tablist">${periodTabs(preset)}</div>
        </div>
        <div class="period-chips">
          <span class="period-chip"><strong>${fmtCount(a.ordersCount)}</strong> заказов</span>
          <span class="period-chip"><strong>${fmtMoney(a.revenue)}</strong> выручка</span>
          <span class="period-chip"><strong>${fmtMoney(a.avgCheck)}</strong> ср. чек</span>
          <span class="period-chip"><strong>${fmtCount(a.uniqueClients)}</strong> клиентов</span>
        </div>
      </div>
      <div class="period-bar-custom ${preset === 'custom' ? '' : 'period-bar-custom--hidden'}">
        <label class="period-date">
          <span>С</span>
          <input type="date" id="period-from" value="${customFrom}" />
        </label>
        <label class="period-date">
          <span>По</span>
          <input type="date" id="period-to" value="${customTo}" />
        </label>
        <button type="button" class="btn btn-outline btn-press period-apply-btn" id="period-apply">Применить</button>
      </div>
    </section>
  `;
}

function periodTabs(active) {
  const tabs = [
    { id: 'day', label: 'День' },
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'custom', label: 'Период' },
  ];
  return tabs.map(t => `
    <button
      type="button"
      class="period-tab btn-press ${t.id === active ? 'period-tab--active' : ''}"
      data-period="${t.id}"
    >${t.label}</button>
  `).join('');
}

function barChartHtml({ items, valueKey, labelKey, emptyText }) {
  const max = Math.max(...items.map(i => i[valueKey]), 1);
  if (!items.length || items.every(i => !i[valueKey])) {
    return `<p class="chart-empty">${emptyText}</p>`;
  }

  return `
    <div class="bar-chart" role="img" aria-label="График">
      ${items.map(item => {
        const pct = Math.round((item[valueKey] / max) * 100);
        return `
          <div class="bar-chart-col">
            <span class="bar-chart-value">${item[valueKey]}</span>
            <div class="bar-chart-track">
              <div class="bar-chart-fill" style="height: ${pct}%"></div>
            </div>
            <span class="bar-chart-label">${item[labelKey]}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function hBarChartHtml(items, emptyText) {
  const max = Math.max(...items.map(i => i.qty), 1);
  if (!items.length) {
    return `<p class="chart-empty">${emptyText}</p>`;
  }

  return `
    <div class="hbar-chart">
      ${items.map(item => {
        const pct = Math.round((item.qty / max) * 100);
        return `
          <div class="hbar-row">
            <span class="hbar-name" title="${item.name}">${item.name}</span>
            <div class="hbar-track">
              <div class="hbar-fill" style="width: ${pct}%"></div>
            </div>
            <span class="hbar-qty">${item.qty}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export class DashboardPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.periodPreset = 'day';
    this.customFrom = toDateInputValue();
    this.customTo = toDateInputValue();
    this.loading = true;
    this.init();
  }

  async init() {
    this.renderSkeleton();
    await this.loadData();
  }

  renderSkeleton() {
    this.container.innerHTML = renderAdminShell({
      active: 'dashboard',
      title: 'Дашборд',
      subtitle: 'Оперативные показатели и аналитика',
      bodyHtml: '<div class="admin-loading">Загрузка данных…</div>',
    });
    bindAdminShell(this.container, this.navigate);
  }

  async loadData() {
    this.loading = true;
    const period = resolvePeriod(this.periodPreset, this.customFrom, this.customTo);

    try {
      const [snapshot, analytics] = await Promise.all([
        fetchDashboardSnapshot(),
        fetchPeriodAnalytics(period.start, period.end),
      ]);
      this.snapshot = snapshot;
      this.analytics = analytics;
      this.period = period;
    } catch (err) {
      console.error('[dashboard]', err);
      this.error = err.message || 'Не удалось загрузить данные';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    const bodyHtml = this.error
      ? `<div class="admin-error card">${this.error}</div>`
      : this.renderBody();

    this.container.innerHTML = renderAdminShell({
      active: 'dashboard',
      title: 'Дашборд',
      subtitle: 'Оперативные показатели и аналитика',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.error) this.bindEvents();
  }

  renderBody() {
    const s = this.snapshot;
    const a = this.analytics;

    const hourItems = a.ordersByHour
      .filter(b => b.hour >= 7 && b.hour <= 21)
      .map(b => ({ hour: fmtHourLabel(b.hour), count: b.count }));

    const dayItems = a.ordersByDay.map(d => ({
      day: fmtDayLabel(d.key),
      count: d.count,
    }));

    return `
      ${periodBar(this.periodPreset, a, this.customFrom, this.customTo, this.period)}

      <div class="dashboard-page">
      <section class="metrics-hot" aria-label="Ключевые показатели">
        ${metricCardHot('Заказов сегодня', fmtCount(s.ordersToday), s.ordersTodayDelta, `вчера: ${fmtCount(s.ordersYesterday)}`)}
        ${metricCardHot('Выручка сегодня', fmtMoney(s.revenueToday), s.revenueTodayDelta, `вчера: ${fmtMoney(s.revenueYesterday)}`)}
        ${metricCardHot('Средний чек', fmtMoney(s.avgCheckToday), s.avgCheckTodayDelta, `вчера: ${s.checksYesterdayCount ? fmtMoney(s.avgCheckYesterday) : '—'}`)}
        ${metricCardHot('Ср. время готовки', fmtDuration(s.avgPrepMin), s.avgPrepMinDelta, `вчера: ${fmtDuration(s.avgPrepYesterday)}`, { invert: true })}
      </section>

      <section class="metrics-grid" aria-label="Оперативные метрики за сегодня">
        ${metricCard('Активных клиентов', fmtCount(s.clientsTotal), 'всего в базе')}
        ${metricCard('В работе', fmtCount(s.inProgress), 'готовятся и готовы')}
        ${metricCard('Завершено сегодня', fmtCount(s.completedToday))}
        ${metricCard('Оплата балансом', fmtPercent(s.balanceShare), fmtMoney(s.balanceAmount))}
        ${metricCard('Ср. блюд в заказе', fmtDecimal(s.avgItemsPerOrder), 'за сегодня')}
        ${metricCard('Порций продано', fmtCount(s.portionsSoldToday), 'за сегодня')}
        ${metricCard('Отмен сегодня', fmtCount(s.cancelledToday))}
        ${metricCard(
          'Каналы продаж',
          `${fmtCount(s.ordersByChannel.web)} · ${fmtCount(s.ordersByChannel.kiosk)}`,
          'Веб · Киоск',
        )}
      </section>

      <div class="charts-grid">
        <section class="chart-card card">
          <h3 class="chart-title">Заказы по часам</h3>
          <p class="chart-sub">Пиковое время заказов</p>
          ${barChartHtml({
            items: hourItems.map(i => ({ label: i.hour, count: i.count })),
            valueKey: 'count',
            labelKey: 'label',
            emptyText: 'Нет заказов за выбранный период',
          })}
        </section>

        <section class="chart-card card">
          <h3 class="chart-title">Заказы по дням</h3>
          <p class="chart-sub">Динамика количества заказов</p>
          ${barChartHtml({
            items: dayItems.map(i => ({ label: i.day, count: i.count })),
            valueKey: 'count',
            labelKey: 'label',
            emptyText: 'Нет заказов за выбранный период',
          })}
        </section>

        <section class="chart-card card">
          <h3 class="chart-title">Каналы продаж</h3>
          <p class="chart-sub">Заказы по источнику: веб и киоск</p>
          ${barChartHtml({
            items: [
              { label: 'Веб', count: a.ordersByChannel.web },
              { label: 'Киоск', count: a.ordersByChannel.kiosk },
            ],
            valueKey: 'count',
            labelKey: 'label',
            emptyText: 'Нет заказов за выбранный период',
          })}
        </section>

        <section class="chart-card card chart-card--wide">
          <h3 class="chart-title">Топ блюд</h3>
          <p class="chart-sub">По количеству проданных порций</p>
          ${hBarChartHtml(a.topDishes, 'Нет данных о продажах за период')}
        </section>
      </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('.period-tabs')?.addEventListener('click', async e => {
      const tab = e.target.closest('[data-period]');
      if (!tab) return;
      this.periodPreset = tab.dataset.period;
      if (this.periodPreset !== 'custom') {
        await this.loadData();
      } else {
        this.render();
      }
    });

    this.container.querySelector('#period-apply')?.addEventListener('click', async () => {
      this.customFrom = this.container.querySelector('#period-from')?.value || this.customFrom;
      this.customTo = this.container.querySelector('#period-to')?.value || this.customTo;
      await this.loadData();
    });
  }

  destroy() {}
}
