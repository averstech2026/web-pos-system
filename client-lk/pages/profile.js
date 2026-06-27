import { auth, db } from '../../shared/firebase.js';
import {
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { COL } from '../../shared/schema.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

export class ProfilePage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.user = null;
    this.userData = null;
    this.init();
  }

  async init() {
    this.user = auth.currentUser;
    if (!this.user) { this.navigate('/auth'); return; }

    const snap = await getDoc(doc(db, COL.USERS, this.user.uid));
    this.userData = snap.exists()
      ? snap.data()
      : { name: this.user.email.split('@')[0], email: this.user.email, printReceipt: true };

    this.render();
  }

  render() {
    const u = this.userData;
    const email = this.user.email;

    this.container.innerHTML = `
      <div class="lk-shell subpage-shell">
        <header class="lk-header">
          <div class="lk-header-left">
            <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
            <span class="subpage-title">Профиль</span>
          </div>
          <div class="lk-header-right">
            <img class="header-logo" src="${logoUrl}" alt="iFCM TECH" />
          </div>
        </header>

        <main class="lk-main profile-main">
          <div class="profile-hero card">
            <div class="profile-avatar">${(u.name || '?').charAt(0).toUpperCase()}</div>
            <div class="profile-hero-name">${u.name || '—'}</div>
            <div class="profile-hero-email">${email}</div>
          </div>

          <section class="profile-section card">
            <h3 class="profile-section-title">Личные данные</h3>
            <div class="form-stack">
              <div class="form-group">
                <label>Имя</label>
                <input type="text" id="profile-name" value="${u.name || ''}" autocomplete="name" />
              </div>
              <div class="form-group">
                <label>Дата рождения</label>
                <input type="date" id="profile-birth" value="${u.birthDate || ''}" />
              </div>
              <button class="btn btn-primary btn-pill btn-press" id="btn-save-personal">Сохранить</button>
              <div id="personal-msg" class="profile-msg" style="display:none"></div>
            </div>
          </section>

          <section class="profile-section card">
            <h3 class="profile-section-title">Email</h3>
            <div class="form-stack">
              <div class="form-group">
                <label>Новый email</label>
                <input type="email" id="profile-email" placeholder="${email}" autocomplete="email" />
              </div>
              <div class="form-group">
                <label>Текущий пароль</label>
                <input type="password" id="profile-email-pass" autocomplete="current-password" />
              </div>
              <button class="btn btn-outline btn-pill btn-press" id="btn-change-email">Сменить email</button>
              <div id="email-msg" class="profile-msg" style="display:none"></div>
            </div>
          </section>

          <section class="profile-section card">
            <h3 class="profile-section-title">Пароль</h3>
            <div class="form-stack">
              <div class="form-group">
                <label>Текущий пароль</label>
                <input type="password" id="profile-old-pass" autocomplete="current-password" />
              </div>
              <div class="form-group">
                <label>Новый пароль</label>
                <input type="password" id="profile-new-pass" autocomplete="new-password" />
              </div>
              <button class="btn btn-outline btn-pill btn-press" id="btn-change-pass">Сменить пароль</button>
              <div id="pass-msg" class="profile-msg" style="display:none"></div>
            </div>
          </section>

          <section class="profile-section card">
            <h3 class="profile-section-title">Настройки</h3>
            <div class="balance-toggle">
              <div>
                <div class="balance-toggle-label">Печатать чек на кассе</div>
                <div class="balance-toggle-sub">При получении заказа</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="profile-print-receipt" ${u.printReceipt !== false ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </section>

          <button class="btn btn-outline-danger btn-pill btn-press profile-logout" id="btn-logout">
            Выйти из аккаунта
          </button>
        </main>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));

    document.getElementById('btn-save-personal').addEventListener('click', () => this.savePersonal());
    document.getElementById('btn-change-email').addEventListener('click', () => this.changeEmail());
    document.getElementById('btn-change-pass').addEventListener('click', () => this.changePassword());

    document.getElementById('profile-print-receipt').addEventListener('change', e => {
      this.savePrintReceipt(e.target.checked);
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
      if (confirm('Выйти из системы?')) {
        await signOut(auth);
        this.navigate('/auth');
      }
    });
  }

  showMsg(elId, text, isError = false) {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.className = `profile-msg ${isError ? 'profile-msg--error' : 'profile-msg--ok'}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  async savePersonal() {
    const name = document.getElementById('profile-name').value.trim();
    const birthDate = document.getElementById('profile-birth').value || null;
    if (!name) {
      this.showMsg('personal-msg', 'Введите имя', true);
      return;
    }

    try {
      await updateDoc(doc(db, COL.USERS, this.user.uid), { name, birthDate });
      this.userData = { ...this.userData, name, birthDate };
      this.showMsg('personal-msg', 'Сохранено');
    } catch (err) {
      console.error(err);
      this.showMsg('personal-msg', 'Не удалось сохранить', true);
    }
  }

  async savePrintReceipt(checked) {
    try {
      await updateDoc(doc(db, COL.USERS, this.user.uid), { printReceipt: checked });
      this.userData.printReceipt = checked;
    } catch (err) {
      console.error(err);
      alert('Не удалось сохранить настройку');
    }
  }

  async reauth(password) {
    const cred = EmailAuthProvider.credential(this.user.email, password);
    await reauthenticateWithCredential(this.user, cred);
  }

  async changeEmail() {
    const newEmail = document.getElementById('profile-email').value.trim();
    const password = document.getElementById('profile-email-pass').value;
    if (!newEmail || !password) {
      this.showMsg('email-msg', 'Заполните email и пароль', true);
      return;
    }

    const btn = document.getElementById('btn-change-email');
    btn.disabled = true;

    try {
      await this.reauth(password);
      await verifyBeforeUpdateEmail(this.user, newEmail);
      await updateDoc(doc(db, COL.USERS, this.user.uid), { email: newEmail });
      this.showMsg('email-msg', 'Письмо для подтверждения отправлено на новый адрес');
    } catch (err) {
      this.showMsg('email-msg', this.authErr(err.code), true);
    } finally {
      btn.disabled = false;
    }
  }

  async changePassword() {
    const oldPass = document.getElementById('profile-old-pass').value;
    const newPass = document.getElementById('profile-new-pass').value;
    if (!oldPass || !newPass) {
      this.showMsg('pass-msg', 'Заполните оба поля', true);
      return;
    }
    if (newPass.length < 6) {
      this.showMsg('pass-msg', 'Новый пароль — минимум 6 символов', true);
      return;
    }

    const btn = document.getElementById('btn-change-pass');
    btn.disabled = true;

    try {
      await this.reauth(oldPass);
      await updatePassword(this.user, newPass);
      document.getElementById('profile-old-pass').value = '';
      document.getElementById('profile-new-pass').value = '';
      this.showMsg('pass-msg', 'Пароль изменён');
    } catch (err) {
      this.showMsg('pass-msg', this.authErr(err.code), true);
    } finally {
      btn.disabled = false;
    }
  }

  authErr(code) {
    const map = {
      'auth/wrong-password': 'Неверный пароль',
      'auth/invalid-credential': 'Неверный пароль',
      'auth/email-already-in-use': 'Email уже используется',
      'auth/invalid-email': 'Некорректный email',
      'auth/weak-password': 'Пароль слишком короткий',
      'auth/requires-recent-login': 'Войдите заново и повторите',
    };
    return map[code] || `Ошибка: ${code}`;
  }
}
