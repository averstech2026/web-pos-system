import { auth, db } from '../../shared/firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { COL, ROLES } from '../../shared/schema.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const DEMO_HINT = `<code>ivanov@ifcm.demo</code> / <code>demo1234</code>`;

export class AuthPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.mode = 'login'; // 'login' | 'register'
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-logo">
          <img class="auth-logo-img" src="${logoUrl}" alt="iFCM TECH" />
          <div class="auth-logo-subtitle">Lunch System</div>
        </div>

        <div class="auth-card card">
          <div class="auth-tabs">
            <button class="auth-tab ${this.mode === 'login' ? 'active' : ''}" data-tab="login">Вход</button>
            <button class="auth-tab ${this.mode === 'register' ? 'active' : ''}" data-tab="register">Регистрация</button>
          </div>

          <div class="auth-fields" id="auth-fields">
            ${this.mode === 'register' ? `
            <div class="form-group">
              <label>Имя</label>
              <input type="text" id="auth-name" placeholder="Иванов Иван" autocomplete="name" />
            </div>` : ''}

            <div class="form-group">
              <label>Email</label>
              <input type="email" id="auth-email" placeholder="email@company.ru" autocomplete="email" />
            </div>

            <div class="form-group">
              <label>Пароль</label>
              <input type="password" id="auth-password" placeholder="••••••••" autocomplete="${this.mode === 'login' ? 'current-password' : 'new-password'}" />
            </div>

            <div id="auth-error" class="auth-error" style="display:none"></div>

            <button id="auth-submit" class="btn btn-primary btn-pill btn-press auth-btn">
              ${this.mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </div>
        </div>

        ${this.mode === 'login' ? `<p class="auth-hint">Демо: ${DEMO_HINT}</p>` : ''}
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.tab;
        this.render();
      });
    });

    document.getElementById('auth-submit').addEventListener('click', () => this.submit());
    document.getElementById('auth-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
    });
  }

  async submit() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = this.mode === 'login' ? 'Вхожу...' : 'Создаю аккаунт...';

    try {
      if (this.mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        // Ensure Firestore user doc exists (e.g. demo user created via console)
        await this.ensureUserDoc();
      } else {
        const name = document.getElementById('auth-name')?.value.trim() || email.split('@')[0];
        if (!name) { throw { code: 'app/no-name' }; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await this.createUserDoc(cred.user.uid, name, email);
      }
      this.navigate('/home');
    } catch (err) {
      errorEl.textContent = this.errMsg(err.code);
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = this.mode === 'login' ? 'Войти' : 'Создать аккаунт';
    }
  }

  async ensureUserDoc() {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, COL.USERS, user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: user.uid,
        name: user.email.split('@')[0],
        email: user.email,
        role: ROLES.CLIENT,
        balance: 500,
        printReceipt: true,
      });
    }
  }

  async createUserDoc(uid, name, email) {
    await setDoc(doc(db, COL.USERS, uid), {
      id: uid,
      name,
      email,
      role: ROLES.CLIENT,
      balance: 500,
      printReceipt: true,
    });
  }

  errMsg(code) {
    const map = {
      'auth/user-not-found': 'Пользователь не найден',
      'auth/wrong-password': 'Неверный пароль',
      'auth/invalid-credential': 'Неверный email или пароль',
      'auth/invalid-email': 'Некорректный email',
      'auth/email-already-in-use': 'Этот email уже зарегистрирован. Перейдите на вкладку «Вход» или используйте другой email.',
      'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
      'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
      'app/no-name': 'Введите ваше имя',
    };
    return map[code] || `Ошибка: ${code}`;
  }
}
