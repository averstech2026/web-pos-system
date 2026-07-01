import { auth, db } from '../../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../../shared/schema.js';
import { STAFF_DEMO_PASSWORD } from '../../shared/seed.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const STAFF_ROLES = [ROLES.COOK, ROLES.CASHIER, ROLES.ADMIN, ROLES.MANAGER];
const DEMO_EMAIL = 'cook@ifcm.demo';
const DEMO_PASSWORD = STAFF_DEMO_PASSWORD;

function authErrorMessage(err) {
  const code = err?.code;
  const map = {
    'auth/invalid-credential': `Неверный email или пароль. Демо: cook@ifcm.demo / ${STAFF_DEMO_PASSWORD}`,
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
      <div class="vtd-auth-wrap">
        <div class="vtd-auth-logo">
          <img src="${logoUrl}" alt="iFCM TECH" />
          <div class="vtd-auth-sub">Терминал валидатора</div>
        </div>

        <div class="vtd-auth-card card">
          <h2 class="vtd-auth-title">Вход для персонала</h2>

          <div class="form-stack">
            <div class="form-group">
              <label for="vtd-email">Email</label>
              <input id="vtd-email" type="email" autocomplete="username"
                     placeholder="cook@ifcm.demo" />
            </div>
            <div class="form-group">
              <label for="vtd-pass">Пароль</label>
              <input id="vtd-pass" type="password" autocomplete="current-password"
                     placeholder="demo1234" />
            </div>
            <div id="vtd-auth-error" class="auth-error" hidden></div>
            <button class="btn btn-primary btn-pill btn-press" id="vtd-login" type="button">
              Войти
            </button>
          </div>
        </div>

        <p class="vtd-auth-hint">
          Демо:
          <button type="button" class="vtd-auth-demo-btn" id="vtd-demo-fill" aria-label="Заполнить демо-данные">
            <code>${DEMO_EMAIL}</code> / <code>${DEMO_PASSWORD}</code>
          </button>
        </p>
      </div>
    `;

    document.getElementById('vtd-login').addEventListener('click', () => this.submit());
    document.getElementById('vtd-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
    });
    document.getElementById('vtd-demo-fill')?.addEventListener('click', () => {
      document.getElementById('vtd-email').value = DEMO_EMAIL;
      document.getElementById('vtd-pass').value = DEMO_PASSWORD;
      document.getElementById('vtd-auth-error').hidden = true;
    });
  }

  async submit() {
    const email = document.getElementById('vtd-email').value.trim();
    const password = document.getElementById('vtd-pass').value;
    const errEl = document.getElementById('vtd-auth-error');
    const btn = document.getElementById('vtd-login');

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Входим…';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, COL.USERS, cred.user.uid));
      const role = snap.data()?.role;

      if (!STAFF_ROLES.includes(role)) {
        await signOut(auth);
        throw new Error(`Роль «${role || 'нет'}» — нужна cook, cashier, manager или admin.`);
      }

      this.navigate('/');
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }
}
