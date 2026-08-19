import '../shared/styles.css';
import '../shared/global.css';
import '../shared/demo-preset.css';
import '../shared/composite-lunch.css';
import './style.css';

import { initDemoPreset } from '../shared/demo-preset.js';
import logoUrl from '../shared/assets/logo-ifcm-tech.png';
import { auth, db } from '../shared/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../shared/schema.js';

initDemoPreset({
  applyTheme: true,
  fallbackLogoUrl: logoUrl,
  documentTitle: { page: 'Терминал выдачи' },
});

if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedStaffAuth }) => {
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      '%c[DEV] Staff setup helper loaded.\nRun: await seedStaffAuth()',
      'color:#1E1B4B;font-weight:bold',
    );
  });
}

const STAFF_ROLES = [ROLES.CASHIER, ROLES.ADMIN, ROLES.MANAGER];

const app = document.getElementById('app');

function parseHash() {
  return (location.hash.slice(1) || '/queue').split('?')[0];
}

export function navigate(path) {
  location.hash = path;
}

let currentPage = null;
let authReady = false;

async function isDeliveryStaff(user) {
  if (!user) return false;
  const snap = await getDoc(doc(db, COL.USERS, user.uid));
  return snap.exists() && STAFF_ROLES.includes(snap.data().role);
}

async function renderRoute(path) {
  currentPage?.destroy?.();
  app.innerHTML = '';

  const user = auth.currentUser;

  if (!user) {
    if (path !== '/auth') {
      navigate('/auth');
      return;
    }
    const { AuthPage } = await import('./pages/auth.js');
    currentPage = new AuthPage(app, navigate);
    return;
  }

  if (!(await isDeliveryStaff(user))) {
    if (path !== '/auth') {
      navigate('/auth');
      return;
    }
    const { AuthPage } = await import('./pages/auth.js');
    currentPage = new AuthPage(app, navigate);
    return;
  }

  if (path === '/auth') {
    navigate('/queue');
    return;
  }

  const { QueuePage } = await import('./pages/queue.js');
  currentPage = new QueuePage(app, navigate);
}

onAuthStateChanged(auth, () => {
  authReady = true;
  renderRoute(parseHash());
});

window.addEventListener('hashchange', () => {
  if (authReady) renderRoute(parseHash());
});
