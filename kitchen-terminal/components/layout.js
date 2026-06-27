import { auth } from '../../shared/firebase.js';
import { signOut } from 'firebase/auth';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import { fmtClock, fmtDateLong } from '../utils/format.js';

/**
 * @param {object} p
 * @param {string} p.title
 * @param {'orders'|'assembly'} p.activeTab
 * @param {string} p.toolbarHtml
 * @param {string} p.bodyHtml
 */
export function renderKitchenShell({ title, activeTab, toolbarHtml = '', bodyHtml }) {
  return `
    <div class="kt-shell">
      <header class="kt-header">
        <img class="kt-logo" src="${logoUrl}" alt="iFCM TECH" />
        <h1 class="kt-title">${title}</h1>
        <div class="kt-clock">
          <span class="kt-clock-time" id="kt-clock-time">${fmtClock()}</span>
          <span class="kt-clock-date" id="kt-clock-date">${fmtDateLong()}</span>
        </div>
      </header>

      ${toolbarHtml ? `<div class="kt-toolbar">${toolbarHtml}</div>` : ''}

      <main class="kt-main kiosk-scroll" id="kt-main">${bodyHtml}</main>

      <nav class="kt-nav" aria-label="Навигация терминала">
        <button class="kt-nav-btn btn-press" type="button" data-nav="sort" aria-label="Сортировка">
          <span class="kt-nav-icon">⇅</span>
          <span>Сортировка</span>
        </button>
        <button class="kt-nav-btn btn-press" type="button" data-nav="search" aria-label="Поиск заказа">
          <span class="kt-nav-icon kt-nav-icon--search">⌕</span>
          <span>Поиск заказа</span>
        </button>
        <button class="kt-nav-btn btn-press ${activeTab === 'orders' ? 'kt-nav-btn--active' : ''}"
                type="button" data-nav="orders">
          <span class="kt-nav-icon">▤</span>
          <span>Текущие заказы</span>
        </button>
        <button class="kt-nav-btn btn-press ${activeTab === 'assembly' ? 'kt-nav-btn--active' : ''}"
                type="button" data-nav="assembly">
          <span class="kt-nav-icon">⊞</span>
          <span>Блюда к сборке</span>
        </button>
        <button class="kt-nav-btn kt-nav-btn--exit btn-press" type="button" data-nav="exit">
          <span class="kt-nav-icon">⎋</span>
          <span>Выход</span>
        </button>
      </nav>
    </div>
  `;
}

let clockTimer = null;

export function startClock() {
  stopClock();
  const tick = () => {
    const t = document.getElementById('kt-clock-time');
    const d = document.getElementById('kt-clock-date');
    if (t) t.textContent = fmtClock();
    if (d) d.textContent = fmtDateLong();
  };
  tick();
  clockTimer = setInterval(tick, 30_000);
}

export function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

/**
 * @param {HTMLElement} root
 * @param {(path: string) => void} navigate
 * @param {{ onSort?: () => void, onSearch?: () => void }} handlers
 */
export function bindKitchenNav(root, navigate, handlers = {}) {
  root.querySelector('.kt-nav')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const action = btn.dataset.nav;
    if (action === 'orders') navigate('/orders');
    if (action === 'assembly') navigate('/assembly');
    if (action === 'sort') handlers.onSort?.();
    if (action === 'search') handlers.onSearch?.();
    if (action === 'exit') {
      if (!confirm('Выйти из терминала?')) return;
      await signOut(auth);
      navigate('/auth');
    }
  });
}
