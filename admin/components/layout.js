import { auth } from '../../shared/firebase.js';
import { signOut } from 'firebase/auth';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

/** @typedef {'dashboard' | 'orders' | 'products' | 'groups' | 'modifiers' | 'lunches' | 'allergens' | 'data-import' | 'schedules' | 'calendar' | 'marketing' | 'marketing-banners' | 'payments' | 'sales-channels' | 'users' | 'crm-groups' | 'crm-loyalty' | 'crm-wallets' | 'reports'} AdminSection */

/** @type {Record<string, string>} */
const NAV_ICONS = {
  'layout-dashboard': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  'shopping-bag': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,
  'bar-chart-3': `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

/** @type {{ id: string; label: string; icon: keyof typeof NAV_ICONS; items: { id: AdminSection; path: string; label: string }[] }[]} */
const NAV_GROUPS = [
  {
    id: 'main',
    label: 'Главное',
    icon: 'layout-dashboard',
    items: [
      { id: 'dashboard', path: '/dashboard', label: 'Дашборд' },
      { id: 'orders', path: '/orders', label: 'Заказы' },
    ],
  },
  {
    id: 'menu',
    label: 'Меню и товары',
    icon: 'shopping-bag',
    items: [
      { id: 'products', path: '/products', label: 'Товары' },
      { id: 'groups', path: '/groups', label: 'Группы товаров' },
      { id: 'modifiers', path: '/modifiers', label: 'Модификаторы товаров' },
      { id: 'lunches', path: '/lunches', label: 'Конструктор ланчей' },
      { id: 'allergens', path: '/allergens', label: 'Аллергены' },
    ],
  },
  {
    id: 'crm',
    label: 'Клиенты и CRM',
    icon: 'users',
    items: [
      { id: 'users', path: '/users', label: 'Клиенты' },
      { id: 'crm-groups', path: '/crm-groups', label: 'Группы клиентов' },
      { id: 'crm-loyalty', path: '/crm-loyalty', label: 'Категории лояльности' },
    ],
  },
  {
    id: 'finance',
    label: 'Финансы и маркетинг',
    icon: 'wallet',
    items: [
      { id: 'crm-wallets', path: '/crm-wallets', label: 'Кошельки' },
      { id: 'payments', path: '/payments', label: 'Платежи' },
      { id: 'marketing', path: '/marketing', label: 'Конструктор акций' },
      { id: 'marketing-banners', path: '/marketing-banners', label: 'Баннеры' },
    ],
  },
  {
    id: 'settings-analytics',
    label: 'Настройки и аналитика',
    icon: 'settings',
    items: [
      { id: 'schedules', path: '/schedules', label: 'Расписания' },
      { id: 'calendar', path: '/calendar', label: 'Календарь дней' },
      { id: 'sales-channels', path: '/sales-channels', label: 'Каналы продаж' },
      { id: 'reports', path: '/reports', label: 'Отчёты' },
      { id: 'data-import', path: '/data-import', label: 'Импорт данных' },
    ],
  },
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

  const navHtml = NAV_GROUPS.map((group, groupIndex) => `
    <div class="admin-nav-group${groupIndex > 0 ? ' admin-nav-group--spaced' : ''}">
      <div class="admin-nav-group-head" aria-hidden="true">
        <span class="admin-nav-group-icon">${NAV_ICONS[group.icon]}</span>
        <span class="admin-nav-group-label">${group.label}</span>
      </div>
      <div class="admin-nav-group-items">
        ${group.items.map(item => `
          <button
            type="button"
            class="admin-nav-item btn-press ${item.id === active ? 'admin-nav-item--active' : ''}"
            data-path="${item.path}"
            aria-current="${item.id === active ? 'page' : 'false'}"
            title="${item.label}"
          >
            <span class="admin-nav-label">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
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
