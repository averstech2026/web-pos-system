import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import {
  POS_SOFTWARE_VERSION,
  POS_SUPPORT_PHONE,
} from '../../shared/pos-channel.js';
import { getPosHeaderContext } from '../core/header-context.js';
import { formatClock, formatDateLong, formatOrderCreated, esc } from '../core/format.js';
import { state } from '../core/state.js';

const SUPPORT_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="2"/></svg>`;

const CASHIER_AVATAR = `<svg viewBox="0 0 40 40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="20" fill="#f5b8d4"/>
  <circle cx="20" cy="15" r="7" fill="#fff"/>
  <path d="M7 36c2.2-7.5 7-12 13-12s10.8 4.5 13 12" fill="#fff"/>
  <ellipse cx="20" cy="38" rx="14" ry="3" fill="#e8a0c0" opacity="0.35"/>
</svg>`;

/**
 * @param {object} opts
 * @param {'auth'|'sales'} opts.variant
 * @param {boolean} [opts.showBillInfo]
 */
export function renderShellHeader({ variant, showBillInfo = false }) {
  const isSales = variant === 'sales';
  const isAuth = variant === 'auth';
  const useSalesLayout = isSales || isAuth;
  const header = useSalesLayout ? getPosHeaderContext() : null;

  let billInfoHtml = '';
  if (showBillInfo && header) {
    if (isSales) {
      billInfoHtml = `
        <div class="ct-bill-info">
          <div data-live-bill-title>Заказ № ${esc(header.orderNumber)} / ${esc(header.pointName)}</div>
          <div class="ct-bill-sub" data-live-bill-sub>
            Создан: <span data-live-order-created>${esc(header.createdAtLabel)}</span>
          </div>
        </div>
      `;
    } else if (isAuth) {
      billInfoHtml = `
        <div class="ct-bill-info">
          <div class="ct-bill-info-point" data-live-point-name>${esc(header.pointName)}</div>
        </div>
      `;
    }
  }

  const centerHtml = isSales && header
    ? `
      <div class="ct-cashier-avatar" aria-hidden="true">${CASHIER_AVATAR}</div>
      <div class="ct-header-center-text">
        <div class="ct-header-title" data-live-cashier-line>${esc(header.stationName)} | ${esc(header.cashierLogin)}</div>
      </div>
    `
    : `<div class="ct-header-title" data-live-station-name>${esc(header?.stationName || state.channel?.stationName || 'Касса')}</div>`;

  const metaHtml = `
    <div class="ct-header-meta">
      <span>Техподдержка 24/7: ${esc(POS_SUPPORT_PHONE)}</span>
      <span>Версия: ${esc(POS_SOFTWARE_VERSION)}</span>
    </div>
  `;

  const headerClass = isSales ? 'ct-header--sales' : isAuth ? 'ct-header--auth' : '';

  return `
    <header class="ct-header ${headerClass}">
      <div class="ct-header-top">
        <div class="ct-header-left">
          <button type="button" class="ct-support-btn btn-press" title="Техподдержка">
            ${SUPPORT_ICON}
            <span class="ct-support-badge">1</span>
          </button>
          ${billInfoHtml}
        </div>
        <div class="ct-header-center">
          ${centerHtml}
        </div>
        <div class="ct-header-right">
          <div class="ct-clock-wrap">
            <div class="ct-clock" data-live-clock>${formatClock()}</div>
            <div class="ct-date" data-live-date>${formatDateLong()}</div>
          </div>
          <img class="ct-logo" src="${logoUrl}" alt="AVERS TECHNOLOGY" />
        </div>
      </div>
      ${isSales ? metaHtml : ''}
    </header>
  `;
}

export function renderShellFooter() {
  return `
    <footer class="ct-footer">
      <span>Техподдержка 24/7: ${esc(POS_SUPPORT_PHONE)}</span>
      <span>Версия: ${esc(POS_SOFTWARE_VERSION)}</span>
    </footer>
  `;
}

export function bindLiveClock(root) {
  const tick = () => {
    const now = new Date();
    root.querySelectorAll('[data-live-clock]').forEach(el => {
      el.textContent = formatClock(now);
    });
    root.querySelectorAll('[data-live-date]').forEach(el => {
      el.textContent = formatDateLong(now);
    });
    root.querySelectorAll('[data-live-order-created]').forEach(el => {
      el.textContent = formatOrderCreated(state.currentOrder?.createdAt);
    });

    const header = getPosHeaderContext();

    root.querySelectorAll('[data-live-bill-title]').forEach(el => {
      el.textContent = `Заказ № ${header.orderNumber} / ${header.pointName}`;
    });
    root.querySelectorAll('[data-live-bill-sub]').forEach(el => {
      el.innerHTML = `Создан: <span data-live-order-created>${esc(header.createdAtLabel)}</span>`;
    });
    root.querySelectorAll('[data-live-point-name]').forEach(el => {
      el.textContent = header.pointName;
    });
    root.querySelectorAll('[data-live-station-name]').forEach(el => {
      el.textContent = header.stationName;
    });
    root.querySelectorAll('[data-live-cashier-line]').forEach(el => {
      el.textContent = `${header.stationName} | ${header.cashierLogin}`;
    });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

/**
 * @param {HTMLElement} container
 * @param {string} screenFormat
 */
export function applyScreenFormat(container, screenFormat) {
  container.classList.remove('ct-viewport--wide', 'ct-viewport--pos');
  container.classList.add(screenFormat === '1920x1080' ? 'ct-viewport--wide' : 'ct-viewport--pos');
}
