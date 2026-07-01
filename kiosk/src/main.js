import { updateCartBadge } from './core/cart.js';
import { renderMenu } from './ui/menu.js';
import { renderSearchKeyboard } from './ui/search.js';
import {
  renderEmailKeyboard,
  updatePrintReceiptUI,
} from './ui/payment.js';
import { fitKiosk } from './ui/layout.js';
import { bindKioskEvents } from './ui/events.js';
import { loadKioskCatalog } from './services/catalog.js';
import { ensureKioskSession } from './services/auth.js';
import { renderKioskMaintenanceIfNeeded } from './services/sales-channel.js';

if (import.meta.env.DEV) {
  import('@shared/seed.js').then(({ seedStaffAuth, STAFF_DEMO_PASSWORD }) => {
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      `%c[DEV] Kiosk: await seedStaffAuth() if auth fails\nTerminal kiosk@ifcm.demo / ${STAFF_DEMO_PASSWORD}`,
      'color:#1E1B4B;font-weight:bold',
    );
  });
}

function showBootError(message) {
  const wrapper = document.getElementById('kiosk-wrapper');
  if (!wrapper) return;
  wrapper.innerHTML = `
    <div class="flex items-center justify-center w-full h-full bg-zinc-900 text-white p-12 text-center">
      <div>
        <p class="text-2xl font-bold mb-4">Киоск недоступен</p>
        <p class="text-lg opacity-80">${message}</p>
      </div>
    </div>`;
}

function showBootLoading() {
  const wrapper = document.getElementById('kiosk-wrapper');
  if (!wrapper) return;
  const overlay = document.createElement('div');
  overlay.id = 'kiosk-boot';
  overlay.className = 'absolute inset-0 z-[9999] flex items-center justify-center bg-zinc-900/90 text-white text-2xl font-semibold';
  overlay.textContent = 'Загрузка меню…';
  wrapper.appendChild(overlay);
}

function hideBootLoading() {
  document.getElementById('kiosk-boot')?.remove();
}

async function init() {
  fitKiosk();
  showBootLoading();

  const wrapper = document.getElementById('kiosk-wrapper');
  try {
    if (wrapper && await renderKioskMaintenanceIfNeeded(wrapper)) {
      hideBootLoading();
      return;
    }

    await ensureKioskSession();
    await loadKioskCatalog();
  } catch (err) {
    console.error('[kiosk] boot', err);
    hideBootLoading();
    showBootError(err.message || 'Ошибка загрузки меню');
    return;
  }

  hideBootLoading();
  renderEmailKeyboard();
  renderSearchKeyboard();
  updatePrintReceiptUI();
  renderMenu();
  updateCartBadge();
  bindKioskEvents();

  window.addEventListener('resize', fitKiosk);
  window.addEventListener('orientationchange', fitKiosk);
  window.visualViewport?.addEventListener('resize', fitKiosk);
  window.visualViewport?.addEventListener('scroll', fitKiosk);

  const base = import.meta.env.BASE_URL || '/';
  Promise.all([
    ...[`${base}assets/logo.png`, `${base}assets/card.png`].map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = resolve;
          img.src = src;
        }),
    ),
    document.fonts?.ready ?? Promise.resolve(),
  ]).finally(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add('kiosk-ready');
      });
    });
  });
}

init();
