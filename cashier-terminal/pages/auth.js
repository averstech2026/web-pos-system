import { renderShellHeader, renderShellFooter, bindLiveClock } from '../components/shell.js';
import { renderNumpad, bindNumpad } from '../components/numpad.js';
import { renderModals } from '../components/modals.js';
import { esc, escAttr } from '../core/format.js';
import { state } from '../core/state.js';
import cardHandUrl from '../../shared/assets/card-hand.png';

const DEMO_CASHIERS = {
  '1234': { name: 'Кассир', login: 'cashier', department: 'ИТ Отдел Аверс Технолоджи', pin: '1234' },
  '0000': { name: 'Администратор', login: 'admin', department: 'ИТ Отдел Аверс Технолоджи', pin: '0000' },
};

export class AuthPage {
  /** @param {HTMLElement} container @param {() => void} onSuccess */
  constructor(container, onSuccess) {
    this.container = container;
    this.onSuccess = onSuccess;
    this.cleanupClock = null;
    this.render();
  }

  render() {
    const isCard = state.authMode === 'card';
    this.container.innerHTML = `
      <div class="ct-auth-screen">
        ${renderShellHeader({ variant: 'auth', showBillInfo: true })}
        <main class="ct-auth-main">
          ${isCard ? this.renderCardMode() : this.renderPinMode()}
        </main>
        ${renderShellFooter()}
      </div>
    `;
    this.bind();
    renderModals(this.container);
    this.cleanupClock?.();
    this.cleanupClock = bindLiveClock(this.container);
  }

  renderPinMode() {
    return `
      <div class="ct-auth-card">
        <h1 class="ct-auth-title">Введите ваш код</h1>
        <input class="ct-auth-input" id="ct-pin-display" value="${escAttr(state.pinInput)}" readonly />
        ${renderNumpad({ value: state.pinInput, showDot: false, layout: 'auth' })}
        <p class="ct-auth-switch">
          <button type="button" class="ct-link-btn btn-press" data-action="switch-card">Войти по карте →</button>
        </p>
      </div>
    `;
  }

  renderCardMode() {
    return `
      <div class="ct-auth-card ct-auth-card--card">
        <h1 class="ct-auth-title">Зарегистрируйтесь картой</h1>
        <div class="ct-auth-card-body">
          <div class="ct-card-illustration" aria-hidden="true">
            <img class="ct-card-hand-img" src="${escAttr(cardHandUrl)}" alt="" />
          </div>
        </div>
        <div class="ct-auth-card-foot">
          <button type="button" class="ct-btn-emulate btn-press" data-action="emulate-card">
            Эмулировать прикладывание бейджа
          </button>
          <p class="ct-auth-switch">
            <button type="button" class="ct-link-btn btn-press" data-action="switch-pin">← Ввести код</button>
          </p>
        </div>
      </div>
    `;
  }

  bind() {
    const root = this.container;

    root.querySelector('[data-action="switch-card"]')?.addEventListener('click', () => {
      state.authMode = 'card';
      this.render();
    });
    root.querySelector('[data-action="switch-pin"]')?.addEventListener('click', () => {
      state.authMode = 'pin';
      this.render();
    });
    root.querySelector('[data-action="emulate-card"]')?.addEventListener('click', () => {
      this.loginCashier(DEMO_CASHIERS['1234']);
    });

    const display = root.querySelector('#ct-pin-display');
    const numpad = root.querySelector('.ct-numpad');
    if (numpad) {
      bindNumpad(numpad, {
        onChange: (val) => {
          state.pinInput = val;
          if (display) display.value = val;
        },
        onEnter: () => this.tryPinLogin(),
        onCancel: () => {
          state.pinInput = '';
          if (display) display.value = '';
        },
      });
    }
  }

  tryPinLogin() {
    const cashier = DEMO_CASHIERS[state.pinInput];
    if (!cashier) {
      state.modal = 'error';
      state.modalData = { message: 'Неправильный пароль' };
      window.dispatchEvent(new CustomEvent('ct:rerender'));
      return;
    }
    this.loginCashier(cashier);
  }

  /** @param {object} cashier */
  loginCashier(cashier) {
    state.cashier = cashier;
    state.pinInput = '';
    this.onSuccess();
  }

  destroy() {
    this.cleanupClock?.();
    this.container.innerHTML = '';
  }
}
