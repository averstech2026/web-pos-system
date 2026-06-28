import '../shared/styles.css';
import '../shared/global.css';
import './style.css';

import { auth } from '../shared/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';

// ── Dev helpers ───────────────────────────────────────────
// In the browser console run: await seed()  or  await updateItemImages()
if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedDatabase, updateItemImages, seedStaffAuth }) => {
    window.seed = seedDatabase;
    window.updateItemImages = updateItemImages;
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      '%c[DEV] Seed helpers loaded.\n' +
      'Run: await seed()\n' +
      'Run: await updateItemImages()\n' +
      'Run: await seedStaffAuth()',
      'color:#1E1B4B;font-weight:bold'
    );
  });
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

async function renderRoute(path, params) {
  // Destroy previous page if it has cleanup
  currentPage?.destroy?.();
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

  // Lazy-load page modules to keep initial bundle small
  if (path === '/auth') {
    const { AuthPage } = await import('./pages/auth.js');
    currentPage = new AuthPage(app, navigate);
  } else if (path === '/menu') {
    const { MenuPage } = await import('./pages/menu.js');
    currentPage = new MenuPage(app, navigate, params);
  } else if (path === '/payment') {
    const { PaymentPage } = await import('./pages/payment.js');
    currentPage = new PaymentPage(app, navigate, params);
  } else if (path === '/history') {
    const { HistoryPage } = await import('./pages/history.js');
    currentPage = new HistoryPage(app, navigate);
  } else if (path === '/notifications') {
    const { NotificationsPage } = await import('./pages/notifications.js');
    currentPage = new NotificationsPage(app, navigate);
  } else if (path === '/profile') {
    const { ProfilePage } = await import('./pages/profile.js');
    currentPage = new ProfilePage(app, navigate);
  } else {
    const { HomePage } = await import('./pages/home.js');
    currentPage = new HomePage(app, navigate);
  }
}

// Wait for Firebase auth state before first render
let authReady = false;
onAuthStateChanged(auth, () => {
  const { path, params } = parseHash();
  authReady = true;
  renderRoute(path, params);
});

window.addEventListener('hashchange', () => {
  if (!authReady) return;
  const { path, params } = parseHash();
  renderRoute(path, params);
});
