import '../shared/styles.css';
import '../shared/global.css';
import './style.css';

import { fetchPosChannelSettings } from './services/channel-settings.js';
import { loadPosCatalog } from './services/catalog.js';
import {
  ensurePosTerminalSession,
  waitForAuthReady,
  getRateLimitRemainingMs,
  clearRateLimitCooldown,
} from './services/auth.js';
import {
  isDemoModeActive,
  enableDemoMode,
  getDemoChannel,
  getDemoCatalog,
} from './services/dev-demo.js';
import { loadPosGuests, getDemoPosGuests } from './services/guests.js';
import { loadPosPaymentMethods, getDemoPaymentMethods } from './services/payment-methods.js';
import { applyScreenFormat } from './components/shell.js';
import { renderModals } from './components/modals.js';
import { state } from './core/state.js';
import { SALES_CHANNEL_STATUS } from '../shared/sales-channels.js';
import { POS_OPERATION_MODE } from '../shared/pos-channel.js';
import { shouldShowSalesChannelMaintenance } from '../shared/sales-channel-availability.js';

const app = document.getElementById('app');

if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedStaffAuth, STAFF_DEMO_PASSWORD }) => {
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      `%c[DEV] POS helpers:\n`
      + `• Демо UI: ?demo=1 или кнопка на экране ошибки\n`
      + `• Seed: откройте админку localhost:3002 → F12 → await seedStaffAuth()\n`
      + `• Terminal: pos@ifcm.demo / ${STAFF_DEMO_PASSWORD}`,
      'color:#1E1B4B;font-weight:bold',
    );
  });
}

/** @type {import('./pages/auth.js').AuthPage|import('./pages/sales.js').SalesPage|import('./pages/maintenance.js').MaintenancePage|null} */
let currentPage = null;
let bootSeq = 0;
let bootStarted = false;

/** @param {number} ms */
function formatWait(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} сек`;
}

/** @param {HTMLElement} viewport */
function revealViewport(viewport) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      viewport.classList.remove('ct-viewport--booting');
    });
  });
}

/**
 * @param {object} channel
 * @param {object[]} items
 * @param {object[]} categoryGroups
 * @param {HTMLElement} viewport
 */
async function mountApp(channel, items, categoryGroups, viewport) {
  state.channel = channel;
  state.items = items;
  state.categoryGroups = categoryGroups;

  const maintenance = shouldShowSalesChannelMaintenance(channel);
  if (channel.status === SALES_CHANNEL_STATUS.HIDDEN || maintenance) {
    const { MaintenancePage } = await import('./pages/maintenance.js');
    currentPage = new MaintenancePage(viewport, channel);
    return;
  }

  if (channel.operationMode === POS_OPERATION_MODE.SCO) {
    await showSales(viewport);
    return;
  }

  const { AuthPage } = await import('./pages/auth.js');
  currentPage = new AuthPage(viewport, () => showSales(viewport));
}

/** @param {boolean} [demoMode] */
async function boot(demoMode = isDemoModeActive()) {
  const seq = ++bootSeq;

  try {
    let channel;
    let items;
    let categoryGroups;

    if (demoMode) {
      channel = getDemoChannel();
      ({ items, categoryGroups } = getDemoCatalog());
      const { clients, groupsById } = getDemoPosGuests();
      state.crmClients = clients;
      state.crmGroupsById = Object.fromEntries(groupsById);
      state.paymentMethods = getDemoPaymentMethods();
    } else {
      await ensurePosTerminalSession();
      if (seq !== bootSeq) return;

      channel = await fetchPosChannelSettings();
      if (seq !== bootSeq) return;

      ({ items, categoryGroups } = await loadPosCatalog());
      if (seq !== bootSeq) return;

      try {
        const { clients, groupsById } = await loadPosGuests();
        if (seq !== bootSeq) return;
        state.crmClients = clients;
        state.crmGroupsById = Object.fromEntries(groupsById);
      } catch (guestErr) {
        console.warn('[cashier-terminal] guests', guestErr);
        state.crmClients = [];
        state.crmGroupsById = {};
      }

      try {
        state.paymentMethods = await loadPosPaymentMethods();
        if (seq !== bootSeq) return;
      } catch (payErr) {
        console.warn('[cashier-terminal] payment methods', payErr);
        state.paymentMethods = getDemoPaymentMethods();
      }

      if (!items.some(i => i.honestSignMarked)) {
        items.push({
          id: 'demo-water-hz',
          name: 'Вода Aqua Minerale 1л',
          price: 89,
          category: 'Напитки',
          tileColor: '#C5D8E8',
          honestSignMarked: true,
          honestSignCategory: 'water',
          visibleInPos: true,
        });
      }

      if (!items.some(i => i.id === 'demo-bun')) {
        items.push({
          id: 'demo-bun',
          name: 'Булочка ванильная',
          price: 150,
          category: 'Выпечка',
          tileColor: '#E8D4B8',
          visibleInPos: true,
        });
      }
    }

    if (seq !== bootSeq) return;

    currentPage?.destroy?.();

    const viewport = document.createElement('div');
    viewport.className = 'ct-viewport ct-viewport--booting';
    applyScreenFormat(viewport, channel.screenFormat || '1024x768');
    viewport.id = 'ct-viewport';
    app.innerHTML = '';
    app.appendChild(viewport);

    if (demoMode && import.meta.env.DEV) {
      const banner = document.createElement('div');
      banner.className = 'ct-demo-banner';
      banner.innerHTML = 'Демо-режим (без Firebase) — заказы не сохраняются';
      viewport.prepend(banner);
    }

    if (state.savedCart) {
      state.receiptLines = state.savedCart.lines || [];
      state.guest = state.savedCart.guest || null;
      state.receiptDiscountPct = state.savedCart.discount || 0;
      state.currentOrder = state.savedCart.currentOrder || null;
      state.savedCart = null;
    }

    await mountApp(channel, items, categoryGroups, viewport);
    revealViewport(viewport);
  } catch (err) {
    if (seq !== bootSeq) return;
    console.error('[cashier-terminal] boot', err);
    renderBootError(err);
  }
}

/** @param {Error} err */
function renderBootError(err) {
  const code = err?.code || '';
  const msg = err?.message || 'Неизвестная ошибка';
  const rateLimited = code === 'auth/too-many-requests' || msg.includes('блокирует вход');
  const remaining = getRateLimitRemainingMs();

  let hint = '';
  if (rateLimited) {
    hint = `
      <p class="ct-boot-hint" id="ct-boot-countdown">
        Повторный вход будет доступен через: <strong>${formatWait(remaining)}</strong>
      </p>
      <p class="ct-boot-hint">
        Создайте аккаунты один раз в <strong>админке</strong> (localhost:3002):
        F12 → <code>await seedStaffAuth()</code>
      </p>`;
  } else if (code.startsWith('auth/') || msg.includes('seedStaffAuth')) {
    hint = `
      <p class="ct-boot-hint">
        Откройте админку <strong>localhost:3002</strong>, в консоли (F12):
        <code>await seedStaffAuth()</code>, затем обновите кассу.
      </p>`;
  }

  const devDemoBtn = import.meta.env.DEV
    ? '<button type="button" class="ct-boot-demo btn-press" id="ct-boot-demo">Открыть демо UI (без Firebase)</button>'
    : '';

  const clearBtn = rateLimited
    ? '<button type="button" class="ct-boot-clear btn-press" id="ct-boot-clear">Сбросить таймер ожидания</button>'
    : '';

  app.innerHTML = `
    <div class="ct-boot-error">
      <p class="ct-boot-error-title">Не удалось загрузить кассовый модуль</p>
      <p class="ct-boot-error-msg">${esc(msg)}</p>
      ${hint}
      <div class="ct-boot-actions">
        ${devDemoBtn}
        <button type="button" class="ct-boot-retry btn-press" id="ct-boot-retry">Повторить</button>
        ${clearBtn}
      </div>
    </div>`;

  document.getElementById('ct-boot-demo')?.addEventListener('click', () => {
    enableDemoMode();
    boot(true);
  });

  document.getElementById('ct-boot-retry')?.addEventListener('click', () => boot(false));

  document.getElementById('ct-boot-clear')?.addEventListener('click', () => {
    clearRateLimitCooldown();
    boot(false);
  });

  if (rateLimited && remaining > 0) {
    const countdownEl = document.getElementById('ct-boot-countdown');
    const timer = setInterval(() => {
      const left = getRateLimitRemainingMs();
      if (!countdownEl) {
        clearInterval(timer);
        return;
      }
      if (left <= 0) {
        countdownEl.innerHTML = 'Можно повторить вход — нажмите «Повторить»';
        clearInterval(timer);
        return;
      }
      countdownEl.innerHTML = `Повторный вход будет доступен через: <strong>${formatWait(left)}</strong>`;
    }, 1000);
  }
}

/** @param {HTMLElement} viewport */
async function showSales(viewport) {
  currentPage?.destroy?.();
  viewport.classList.remove('ct-viewport--booting');

  if (state.savedCart) {
    state.receiptLines = state.savedCart.lines || [];
    state.guest = state.savedCart.guest || null;
    state.receiptDiscountPct = state.savedCart.discount || 0;
    state.currentOrder = state.savedCart.currentOrder || null;
    state.savedCart = null;
  }

  const { SalesPage } = await import('./pages/sales.js');
  currentPage = new SalesPage(viewport, async () => {
    const channel = state.channel;
    if (channel?.operationMode === POS_OPERATION_MODE.SCO) {
      currentPage?.destroy?.();
      app.innerHTML = '<div class="ct-boot-error">Выход недоступен в режиме самообслуживания</div>';
      return;
    }
    const { AuthPage } = await import('./pages/auth.js');
    state.cashier = null;
    currentPage = new AuthPage(viewport, () => showSales(viewport));
  });
}

window.addEventListener('ct:rerender', () => {
  const viewport = document.getElementById('ct-viewport') || app;
  if (state.modal) {
    renderModals(viewport);
  } else {
    viewport.querySelector('.ct-modal-layer')?.remove();
  }
  currentPage?.render?.();
});

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function init() {
  if (bootStarted) return;
  bootStarted = true;

  if (isDemoModeActive()) {
    boot(true);
    return;
  }

  await waitForAuthReady();
  boot(false);
}

init();
