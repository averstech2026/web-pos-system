import { auth, db } from '../../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../../shared/schema.js';
import { STAFF_DEMO_PASSWORD } from '../../shared/seed.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const ADMIN_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const DEMO_EMAIL = 'admin@ifcm.demo';
const DEMO_PASSWORD = STAFF_DEMO_PASSWORD;

function authErrorMessage(err) {
  const code = err?.code;
  const map = {
    'auth/invalid-credential': `Неверный email или пароль. Демо: admin@ifcm.demo / ${STAFF_DEMO_PASSWORD}`,
    'auth/wrong-password': `Неверный пароль. Демо-пароль: ${STAFF_DEMO_PASSWORD}`,
    'auth/user-not-found': 'Пользователь не найден.',
    'auth/too-many-requests': 'Слишком много попыток. Подождите минуту.',
    'auth/invalid-email': 'Некорректный email.',
  };
  return map[code] || err.message || 'Ошибка входа.';
}

export class AuthPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="admin-auth-wrap">
        <div class="admin-auth-logo">
          <img src="${logoUrl}" alt="iFCM TECH" />
          <div class="admin-auth-sub">Админ-панель</div>
        </div>

        <div class="admin-auth-card card">
          <h2 class="admin-auth-title">Вход для администратора</h2>

          <div class="form-stack">
            <div class="form-group">
              <label for="admin-email">Email</label>
              <input id="admin-email" type="email" autocomplete="username"
                     placeholder="admin@ifcm.demo" />
            </div>
            <div class="form-group">
              <label for="admin-pass">Пароль</label>
              <input id="admin-pass" type="password" autocomplete="current-password"
                     placeholder="demo1234" />
            </div>
            <div id="admin-auth-error" class="auth-error" hidden></div>
            <button class="btn btn-primary btn-pill btn-press" id="admin-login" type="button">
              Войти
            </button>
          </div>
        </div>

        <p class="admin-auth-hint">
          Демо:
          <button type="button" class="admin-auth-demo-btn btn-press" id="admin-demo-fill">
            <code>${DEMO_EMAIL}</code> / <code>${DEMO_PASSWORD}</code>
          </button>
        </p>
      </div>
    `;

    document.getElementById('admin-login').addEventListener('click', () => this.submit());
    document.getElementById('admin-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
    });
    document.getElementById('admin-demo-fill')?.addEventListener('click', () => {
      document.getElementById('admin-email').value = DEMO_EMAIL;
      document.getElementById('admin-pass').value = DEMO_PASSWORD;
      document.getElementById('admin-auth-error').hidden = true;
    });
  }

  async submit() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-pass').value;
    const errEl = document.getElementById('admin-auth-error');
    const btn = document.getElementById('admin-login');

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Входим…';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, COL.USERS, cred.user.uid));
      const role = snap.data()?.role;

      if (!ADMIN_ROLES.includes(role)) {
        await signOut(auth);
        throw new Error(`Роль «${role || 'нет'}» — нужна admin или manager.`);
      }

      this.navigate('/dashboard');
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }
}
