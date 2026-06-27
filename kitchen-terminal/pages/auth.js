import { auth, db } from '../../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../../shared/schema.js';
import { STAFF_DEMO_PASSWORD } from '../../shared/seed.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const STAFF_ROLES = [ROLES.COOK, ROLES.ADMIN, ROLES.MANAGER];

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
      <div class="kt-auth-wrap">
        <div class="kt-auth-logo">
          <img src="${logoUrl}" alt="iFCM TECH" />
          <div class="kt-auth-sub">Кухонный терминал</div>
        </div>

        <div class="kt-auth-card card">
          <h2 class="kt-auth-title">Вход для персонала</h2>

          <div class="form-stack">
            <div class="form-group">
              <label for="kt-email">Email</label>
              <input id="kt-email" type="email" autocomplete="username"
                     value="cook@ifcm.demo" placeholder="cook@ifcm.demo" />
            </div>
            <div class="form-group">
              <label for="kt-pass">Пароль</label>
              <input id="kt-pass" type="password" autocomplete="current-password"
                     value="${STAFF_DEMO_PASSWORD}" placeholder="demo1234" />
            </div>
            <div id="kt-auth-error" class="auth-error" hidden></div>
            <button class="btn btn-primary btn-pill btn-press" id="kt-login" type="button">
              Войти
            </button>
          </div>
        </div>

        <p class="kt-auth-hint">
          Демо: <strong>cook@ifcm.demo</strong> / <strong>${STAFF_DEMO_PASSWORD}</strong>
        </p>
      </div>
    `;

    document.getElementById('kt-login').addEventListener('click', () => this.submit());
    document.getElementById('kt-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
    });
  }

  async submit() {
    const email = document.getElementById('kt-email').value.trim();
    const password = document.getElementById('kt-pass').value;
    const errEl = document.getElementById('kt-auth-error');
    const btn = document.getElementById('kt-login');

    errEl.hidden = true;
    errEl.style.color = '';
    btn.disabled = true;
    btn.textContent = 'Входим…';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, COL.USERS, cred.user.uid));
      const role = snap.data()?.role;

      if (!STAFF_ROLES.includes(role)) {
        await signOut(auth);
        throw new Error(
          `Роль «${role || 'нет'}» — нужна cook, manager или admin.`,
        );
      }

      this.navigate('/orders');
    } catch (err) {
      errEl.textContent = authErrorMessage(err);
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }
}
