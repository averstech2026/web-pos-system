import {
  resolveMaintenanceMessage,
  resolveMaintenanceTitle,
} from './sales-channel-availability.js';

const CLOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;

/**
 * @param {object} [options]
 * @param {import('./sales-channels.d.ts').SalesChannel|null} [options.channel]
 * @param {string} [options.title]
 * @param {string} [options.message]
 * @param {'tailwind'|'lk'} [options.variant]
 */
export function renderSalesChannelMaintenanceHtml({
  channel = null,
  title = resolveMaintenanceTitle(channel || {}),
  message = resolveMaintenanceMessage(channel || {}),
  variant = 'lk',
} = {}) {
  const safeTitle = esc(title);
  const safeMessage = esc(message);

  if (variant === 'tailwind') {
    return `
      <div class="bg-slate-50 flex flex-col items-center justify-center min-h-screen p-6 text-center" role="alert" aria-live="polite">
        <div class="bg-slate-100 text-slate-400 p-4 rounded-full mb-5">${CLOCK_ICON}</div>
        <h1 class="text-xl font-bold text-slate-800 mb-2">${safeTitle}</h1>
        <p class="text-sm text-slate-500 max-w-md">${safeMessage}</p>
      </div>
    `;
  }

  return `
    <div class="sch-maintenance" role="alert" aria-live="polite">
      <div class="sch-maintenance__inner">
        <div class="sch-maintenance__icon" aria-hidden="true">${CLOCK_ICON}</div>
        <h1 class="sch-maintenance__title">${safeTitle}</h1>
        <p class="sch-maintenance__message">${safeMessage}</p>
      </div>
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {Parameters<typeof renderSalesChannelMaintenanceHtml>[0]} [options]
 */
export function mountSalesChannelMaintenance(container, options = {}) {
  if (!container) return;
  container.innerHTML = renderSalesChannelMaintenanceHtml(options);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
