import '../shared/styles.css';
import '../shared/global.css';
import './style.css';

import { auth, db } from '../shared/firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../shared/schema.js';

if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedStaffAuth, patchDemoItemCategories }) => {
    window.seedStaffAuth = seedStaffAuth;
    window.patchDemoItemCategories = patchDemoItemCategories;
    console.info(
      '%c[DEV] Staff setup helper loaded.\nRun: await seedStaffAuth()\nRun: await patchDemoItemCategories()',
      'color:#1E1B4B;font-weight:bold',
    );
  });
}

const ADMIN_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

const app = document.getElementById('app');

function parseHash() {
  return (location.hash.slice(1) || '/dashboard').split('?')[0];
}

export function navigate(path) {
  location.hash = path;
}

let currentPage = null;
let authReady = false;

async function isAdminUser(user) {
  if (!user) return false;
  const snap = await getDoc(doc(db, COL.USERS, user.uid));
  return snap.exists() && ADMIN_ROLES.includes(snap.data().role);
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

  if (!(await isAdminUser(user))) {
    alert('Доступ только для администратора или менеджера.');
    await signOut(auth);
    navigate('/auth');
    return;
  }

  if (path === '/auth') {
    navigate('/dashboard');
    return;
  }

  const routes = {
    '/dashboard': () => import('./pages/dashboard.js').then(m => m.DashboardPage),
    '/orders': () => import('./pages/orders.js').then(m => m.OrdersPage),
    '/products': () => import('./pages/products.js').then(m => m.ProductsPage),
    '/groups': () => import('./pages/category-groups.js').then(m => m.CategoryGroupsPage),
    '/allergens': () => import('./pages/allergens.js').then(m => m.AllergensPage),
    '/data-import': () => import('./pages/data-import.js').then(m => m.DataImportPage),
    '/schedules': () => import('./pages/availability-schedules.js').then(m => m.AvailabilitySchedulesPage),
    '/calendar': () => import('./pages/calendar-days.js').then(m => m.CalendarDaysPage),
    '/marketing': () => import('./pages/marketing.js').then(m => m.MarketingPage),
    '/marketing-banners': () => import('./pages/marketing-banners.js').then(m => m.MarketingBannersPage),
    '/users': () => import('./pages/users.js').then(m => m.UsersPage),
    '/crm-groups': () => import('./pages/crm-user-groups.js').then(m => m.CrmUserGroupsPage),
    '/crm-loyalty': () => import('./pages/crm-loyalty-categories.js').then(m => m.CrmLoyaltyCategoriesPage),
    '/crm-wallets': () => import('./pages/crm-wallets.js').then(m => m.CrmWalletsPage),
    '/payments': () => import('./pages/payments.js').then(m => m.PaymentsPage),
    '/reports': () => import('./pages/reports.js').then(m => m.ReportsPage),
  };

  const loader = routes[path] || routes['/dashboard'];
  const Page = await loader();
  currentPage = new Page(app, navigate);
}

onAuthStateChanged(auth, () => {
  authReady = true;
  if (window.__SEED_STAFF_AUTH__) return;
  renderRoute(parseHash());
});

window.addEventListener('hashchange', () => {
  if (authReady) renderRoute(parseHash());
});

window.addEventListener('seed-staff-auth-done', () => {
  if (authReady) renderRoute(parseHash());
});
