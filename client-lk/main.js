import '../shared/styles.css';
import '../shared/global.css';
import '../shared/demo-preset.css';
import '../shared/sales-channel-maintenance.css';
import '../shared/composite-lunch.css';
import './style.css';

import { initDemoPreset } from '../shared/demo-preset.js';
import logoUrl from '../shared/assets/logo-ifcm-tech.png';
import { auth } from '../shared/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { renderWebChannelMaintenanceIfNeeded } from './services/sales-channel-guard.js';
import { installSeedStaffAuthHelper } from '../shared/install-seed-helpers.js';

initDemoPreset({
  applyTheme: true,
  fallbackLogoUrl: logoUrl,
  documentTitle: { page: 'Личный кабинет' },
});
installSeedStaffAuthHelper();

// PWA: allow "Install app" on mobile browsers.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => console.info('[pwa] service worker registered'))
      .catch(err => console.warn('[pwa] service worker registration failed', err));
  });
}

if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedDatabase, updateItemImages, updateItemNutrition, seedStaffAuth }) => {
    window.seed = seedDatabase;
    window.updateItemImages = updateItemImages;
    window.updateItemNutrition = updateItemNutrition;
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      '%c[DEV] Seed helpers loaded.\n' +
      'Run: await seed()\n' +
      'Run: await updateItemImages()\n' +
      'Run: await updateItemNutrition()\n' +
      'Run: await seedStaffAuth()',
      'color:#1E1B4B;font-weight:bold'
    );
  });
} else {
  console.info('%cSeed: await seedStaffAuth()', 'color:#1E1B4B;font-weight:bold');
}

const app = document.getElementById('app');

/** Parse `#/path?key=val` → { path, params } */
function parseHash() {
  const raw = location.hash.slice(1) || '/home';
  const [path, qs] = raw.split('?');
  return { path, params: new URLSearchParams(qs || '') };
}

/** Change route without full reload */
export function navigate(path) {
  location.hash = path;
}

let currentPage = null;
let authReady = false;
let lastAuthUid = undefined;
let renderSeq = 0;

async function renderRoute(path, params) {
  const seq = ++renderSeq;
  currentPage?.destroy?.();
  currentPage = null;
  app.innerHTML = '';

  const user = auth.currentUser;

  if (!user && path !== '/auth') {
    navigate('/auth');
    return;
  }
  if (user && path === '/auth') {
    navigate('/home');
    return;
  }

  if (user && path !== '/auth') {
    try {
      if (await renderWebChannelMaintenanceIfNeeded(app)) {
        if (seq !== renderSeq) return;
        currentPage = null;
        return;
      }
    } catch (err) {
      console.warn('[lk] sales channel guard failed', err);
    }
  }

  if (seq !== renderSeq) return;

  // Lazy-load page modules to keep initial bundle small
  if (path === '/auth') {
    const { AuthPage } = await import('./pages/auth.js');
    if (seq !== renderSeq) return;
    currentPage = new AuthPage(app, navigate);
  } else if (path === '/menu') {
    const { MenuPage } = await import('./pages/menu.js');
    if (seq !== renderSeq) return;
    currentPage = new MenuPage(app, navigate, params);
  } else if (path === '/payment') {
    const { PaymentPage } = await import('./pages/payment.js');
    if (seq !== renderSeq) return;
    currentPage = new PaymentPage(app, navigate, params);
  } else if (path === '/history') {
    const { HistoryPage } = await import('./pages/history.js');
    if (seq !== renderSeq) return;
    currentPage = new HistoryPage(app, navigate);
  } else if (path === '/notifications') {
    const { NotificationsPage } = await import('./pages/notifications.js');
    if (seq !== renderSeq) return;
    currentPage = new NotificationsPage(app, navigate);
  } else if (path === '/profile') {
    const { ProfilePage } = await import('./pages/profile.js');
    if (seq !== renderSeq) return;
    currentPage = new ProfilePage(app, navigate);
  } else {
    const { HomePage } = await import('./pages/home.js');
    if (seq !== renderSeq) return;
    currentPage = new HomePage(app, navigate);
  }
}

onAuthStateChanged(auth, user => {
  const uid = user?.uid ?? null;
  authReady = true;
  if (window.__SEED_STAFF_AUTH__) return;
  if (lastAuthUid === uid && currentPage) return;
  lastAuthUid = uid;
  const { path, params } = parseHash();
  renderRoute(path, params);
});

window.addEventListener('hashchange', () => {
  if (!authReady || window.__SEED_STAFF_AUTH__) return;
  const { path, params } = parseHash();
  renderRoute(path, params);
});

window.addEventListener('seed-staff-auth-done', () => {
  lastAuthUid = undefined;
  if (!authReady) return;
  navigate('/auth');
});
