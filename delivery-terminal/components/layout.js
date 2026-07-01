import { auth } from '../../shared/firebase.js';
import { signOut } from 'firebase/auth';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import { fmtClock, fmtDateLong } from '../utils/format.js';

/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.countHtml]
 * @param {string} p.bodyHtml
 */
export function renderDeliveryShell({ title, countHtml = '', bodyHtml }) {
  return `
    <div class="dt-shell">
      <div class="dt-top-fixed">
        <header class="dt-header">
          <img class="dt-logo" src="${logoUrl}" alt="iFCM TECH" />
          <h1 class="dt-title">${title}</h1>
          <div class="dt-clock">
            <span class="dt-clock-time" id="dt-clock-time">${fmtClock()}</span>
            <span class="dt-clock-date" id="dt-clock-date">${fmtDateLong()}</span>
          </div>
        </header>
        ${countHtml ? `<div class="dt-toolbar">${countHtml}</div>` : ''}
      </div>

      <main class="dt-main kiosk-scroll" id="dt-main">${bodyHtml}</main>

      <nav class="dt-nav" aria-label="Навигация терминала выдачи">
        <button class="dt-nav-btn btn-press" type="button" data-nav="sort" aria-label="Сортировка">
          <span class="dt-nav-icon">⇅</span>
          <span>Сортировка</span>
        </button>
        <button class="dt-nav-btn btn-press" type="button" data-nav="search" aria-label="Поиск заказа">
          <span class="dt-nav-icon dt-nav-icon--search">⌕</span>
          <span>Поиск</span>
        </button>
        <button class="dt-nav-btn btn-press dt-nav-btn--active" type="button" data-nav="queue">
          <span class="dt-nav-icon">▤</span>
          <span>Очередь</span>
        </button>
        <button class="dt-nav-btn btn-press" type="button" data-nav="scan" aria-label="Сканировать QR">
          <span class="dt-nav-icon">▣</span>
          <span>QR</span>
        </button>
        <button class="dt-nav-btn dt-nav-btn--exit btn-press" type="button" data-nav="exit">
          <span class="dt-nav-icon">⎋</span>
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
    const t = document.getElementById('dt-clock-time');
    const d = document.getElementById('dt-clock-date');
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
 * @param {{ onSort?: () => void, onSearch?: () => void, onScan?: () => void }} handlers
 */
export function bindDeliveryNav(root, handlers = {}) {
  root.querySelector('.dt-nav')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const action = btn.dataset.nav;
    if (action === 'sort') handlers.onSort?.();
    if (action === 'search') handlers.onSearch?.();
    if (action === 'scan') handlers.onScan?.();
    if (action === 'exit') {
      if (!confirm('Выйти из терминала выдачи?')) return;
      await signOut(auth);
      location.hash = '/auth';
    }
  });
}
