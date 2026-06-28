import { auth } from '../../shared/firebase.js';
import { signOut } from 'firebase/auth';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

/** @typedef {'dashboard' | 'orders' | 'products' | 'groups' | 'users' | 'reports'} AdminSection */

const NAV = [
  { id: 'dashboard', path: '/dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'orders', path: '/orders', label: 'Заказы', icon: '🧾' },
  { id: 'products', path: '/products', label: 'Товары', icon: '🍽️' },
  { id: 'groups', path: '/groups', label: 'Группы', icon: '📂' },
  { id: 'users', path: '/users', label: 'Пользователи', icon: '👥' },
  { id: 'reports', path: '/reports', label: 'Отчёты', icon: '📈' },
];

let sidebarCollapsed = false;

/**
 * @param {object} p
 * @param {AdminSection} p.active
 * @param {string} p.title
 * @param {string} p.subtitle
 * @param {string} p.bodyHtml
 * @param {string} [p.toolbarHtml]
 */
export function renderAdminShell({ active, title, subtitle = '', bodyHtml, toolbarHtml = '' }) {
  const userEmail = auth.currentUser?.email || '';

  const navHtml = NAV.map(item => `
    <button
      type="button"
      class="admin-nav-item btn-press ${item.id === active ? 'admin-nav-item--active' : ''}"
      data-path="${item.path}"
      aria-current="${item.id === active ? 'page' : 'false'}"
      title="${item.label}"
    >
      <span class="admin-nav-icon" aria-hidden="true">${item.icon}</span>
      <span class="admin-nav-label">${item.label}</span>
    </button>
  `).join('');

  return `
    <div class="admin-shell ${sidebarCollapsed ? 'admin-shell--collapsed' : ''}">
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-sidebar-head">
          <a class="admin-sidebar-brand" href="#/dashboard" data-path="/dashboard">
            <img class="admin-sidebar-logo" src="${logoUrl}" alt="iFCM TECH" />
          </a>
          <button
            type="button"
            class="admin-menu-toggle btn-press"
            id="admin-menu-toggle"
            aria-label="${sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}"
            aria-expanded="${!sidebarCollapsed}"
          >
            <span></span><span></span><span></span>
          </button>
        </div>

        <nav class="admin-nav" aria-label="Разделы админки">${navHtml}</nav>
      </aside>

      <div class="admin-body">
        <header class="admin-topbar">
          <div class="admin-topbar-left">
            <button
              type="button"
              class="admin-topbar-menu btn-press"
              id="admin-topbar-menu"
              aria-label="Открыть меню"
            >
              <span></span><span></span><span></span>
            </button>
            <div class="admin-topbar-titles">
              <h1 class="admin-page-title">${title}</h1>
              ${subtitle ? `<p class="admin-page-subtitle">${subtitle}</p>` : ''}
            </div>
          </div>
          <div class="admin-topbar-right">
            ${toolbarHtml}
            <div class="admin-user" title="${userEmail}">
              <span class="admin-user-dot" aria-hidden="true"></span>
              <span class="admin-user-email">${userEmail}</span>
            </div>
            <button type="button" class="admin-logout btn-press" id="admin-logout">
              <span class="admin-logout-icon" aria-hidden="true">⎋</span>
              Выйти
            </button>
          </div>
        </header>

        <main class="admin-content kiosk-scroll" id="admin-content">
          ${bodyHtml}
        </main>
        <div class="admin-scroll-fade" id="admin-scroll-fade" hidden aria-hidden="true"></div>
      </div>

      <div class="admin-sidebar-backdrop" id="admin-sidebar-backdrop" hidden></div>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {(path: string) => void} navigate
 */
export function bindAdminShell(root, navigate) {
  const shell = root.querySelector('.admin-shell');
  const backdrop = root.querySelector('#admin-sidebar-backdrop');

  root.querySelector('.admin-nav')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-path]');
    if (!btn) return;
    navigate(btn.dataset.path);
    if (window.innerWidth <= 768) {
      shell?.classList.remove('admin-shell--mobile-open');
      backdrop?.setAttribute('hidden', '');
    }
  });

  root.querySelector('.admin-sidebar-brand')?.addEventListener('click', e => {
    e.preventDefault();
    navigate('/dashboard');
  });

  root.querySelector('#admin-menu-toggle')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      openMobileSidebar(shell, backdrop);
      return;
    }

    sidebarCollapsed = !sidebarCollapsed;
    shell?.classList.toggle('admin-shell--collapsed', sidebarCollapsed);
    const toggle = root.querySelector('#admin-menu-toggle');
    toggle?.setAttribute('aria-expanded', String(!sidebarCollapsed));
    toggle?.setAttribute(
      'aria-label',
      sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню',
    );
  });

  root.querySelector('#admin-topbar-menu')?.addEventListener('click', () => {
    openMobileSidebar(shell, backdrop);
  });

  backdrop?.addEventListener('click', () => {
    shell?.classList.remove('admin-shell--mobile-open');
    backdrop.setAttribute('hidden', '');
  });

  root.querySelector('#admin-logout')?.addEventListener('click', async () => {
    if (!confirm('Выйти из админ-панели?')) return;
    await signOut(auth);
    navigate('/auth');
  });

  bindContentScroll(root);
}

function bindContentScroll(root) {
  const bodyEl = root.querySelector('.admin-body');
  const content = root.querySelector('#admin-content');
  const fade = root.querySelector('#admin-scroll-fade');
  if (!bodyEl || !content) return;

  const update = () => {
    const scrolled = content.scrollTop > 50;
    bodyEl.classList.toggle('admin-body--scrolled', scrolled);
    const hasOverflow = content.scrollHeight > content.clientHeight + 8;
    if (fade) fade.hidden = !hasOverflow || scrolled;
  };

  content.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  requestAnimationFrame(update);
  setTimeout(update, 120);
}

function openMobileSidebar(shell, backdrop) {
  shell?.classList.add('admin-shell--mobile-open');
  backdrop?.removeAttribute('hidden');
}
