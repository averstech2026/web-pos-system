import { auth, db } from '../../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../../shared/schema.js';
import { STAFF_DEMO_PASSWORD } from '../../shared/seed.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const STAFF_ROLES = [ROLES.CASHIER, ROLES.ADMIN, ROLES.MANAGER];
const DEMO_EMAIL = 'cashier@ifcm.demo';
const DEMO_PASSWORD = STAFF_DEMO_PASSWORD;

function authErrorMessage(err) {
  const code = err?.code;
  const map = {
    'auth/invalid-credential': `Неверный email или пароль. Демо: cashier@ifcm.demo / ${STAFF_DEMO_PASSWORD}`,
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
      <div class="dt-auth-wrap">
        <div class="dt-auth-logo">
          <img src="${logoUrl}" alt="iFCM TECH" />
          <div class="dt-auth-sub">Терминал выдачи</div>
        </div>

        <div class="dt-auth-card card">
          <h2 class="dt-auth-title">Вход для кассира</h2>

          <div class="form-stack">
            <div class="form-group">
              <label for="dt-email">Email</label>
              <input id="dt-email" type="email" autocomplete="username"
                     placeholder="cashier@ifcm.demo" />
            </div>
            <div class="form-group">
              <label for="dt-pass">Пароль</label>
              <input id="dt-pass" type="password" autocomplete="current-password"
                     placeholder="demo1234" />
            </div>
            <div id="dt-auth-error" class="auth-error" hidden></div>
            <button class="btn btn-primary btn-pill btn-press" type="button" id="dt-auth-submit">
              Войти
            </button>
          </div>
        </div>

        <p class="dt-auth-hint">
          Демо:
          <button type="button" class="dt-auth-demo-btn btn-press" id="dt-auth-demo">
            <code>cashier@ifcm.demo</code> / <code>${DEMO_PASSWORD}</code>
          </button>
        </p>
      </div>
    `;

    this.container.querySelector('#dt-auth-submit')?.addEventListener('click', () => this.login());
    this.container.querySelector('#dt-auth-demo')?.addEventListener('click', () => {
      this.container.querySelector('#dt-email').value = DEMO_EMAIL;
      this.container.querySelector('#dt-pass').value = DEMO_PASSWORD;
      this.login();
    });
    this.container.querySelector('#dt-pass')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.login();
    });
  }

  async login() {
    const email = this.container.querySelector('#dt-email')?.value.trim();
    const pass = this.container.querySelector('#dt-pass')?.value;
    const errEl = this.container.querySelector('#dt-auth-error');

    if (!email || !pass) {
      if (errEl) {
        errEl.textContent = 'Введите email и пароль.';
        errEl.hidden = false;
      }
      return;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const snap = await getDoc(doc(db, COL.USERS, cred.user.uid));
      if (!snap.exists() || !STAFF_ROLES.includes(snap.data().role)) {
        await signOut(auth);
        if (errEl) {
          errEl.textContent = 'Доступ только для кассира, менеджера или администратора.';
          errEl.hidden = false;
        }
        return;
      }
      this.navigate('/queue');
    } catch (err) {
      if (errEl) {
        errEl.textContent = authErrorMessage(err);
        errEl.hidden = false;
      }
    }
  }

  destroy() {}
}
