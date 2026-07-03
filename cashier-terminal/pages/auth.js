import { renderShellHeader, renderShellFooter, bindLiveClock, bindRuntimeModeFooter, bindSupportMessagesBtn } from '../components/shell.js';
import { renderNumpad, bindNumpad } from '../components/numpad.js';
import { renderModals } from '../components/modals.js';
import { esc, escAttr } from '../core/format.js';
import { state } from '../core/state.js';
import { ROLES } from '../../shared/schema.js';

const NFC_BADGE_ICON = `<svg class="ct-nfc-badge-icon" viewBox="0 0 128 128" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path class="ct-nfc-wave ct-nfc-wave--1" d="M34 64c0-8.3 3.4-15.8 8.8-21.2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path class="ct-nfc-wave ct-nfc-wave--2" d="M24 64c0-13.8 5.6-26.3 14.6-35.3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <path class="ct-nfc-wave ct-nfc-wave--3" d="M14 64c0-19.3 7.8-36.8 20.4-49.4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  <rect x="52" y="40" width="56" height="48" rx="10" stroke="currentColor" stroke-width="2.5"/>
  <rect x="62" y="52" width="16" height="14" rx="3" stroke="currentColor" stroke-width="2"/>
  <circle cx="88" cy="58" r="3.5" fill="currentColor"/>
  <path d="M62 76h36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M62 82h24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
</svg>`;

const DEMO_CASHIERS = {
  '1234': { name: 'Кассир', login: 'cashier', role: ROLES.CASHIER, department: 'ИТ Отдел Аверс Технолоджи', pin: '1234' },
  '0000': { name: 'Администратор', login: 'admin', role: ROLES.ADMIN, department: 'ИТ Отдел Аверс Технолоджи', pin: '0000' },
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
        ${renderShellFooter({ showRuntimeMode: true })}
      </div>
    `;
    this.bind();
    renderModals(this.container);
    this.cleanupClock?.();
    this.cleanupClock = bindLiveClock(this.container);
  }

  renderPinMode() {
    return `
      <div class="ct-auth-card ct-auth-card--pin">
        <div class="ct-modal-bar ct-modal-bar--auth ct-auth-pin-header">Введите ваш код</div>
        <div class="ct-keypad-body">
          <div class="ct-keypad-top-row">
            <div class="ct-keypad-amount-wrap">
              <input class="ct-payment-amount ct-auth-pin-input" id="ct-pin-display" value="${escAttr(state.pinInput)}" readonly />
            </div>
          </div>
          <div class="ct-keypad-numpad-wrap">
            ${renderNumpad({ value: state.pinInput, showDot: false, enterLabel: 'ВВОД', layout: 'payment' })}
          </div>
          <p class="ct-auth-switch">
            <button type="button" class="ct-link-btn btn-press" data-action="switch-card">Войти по карте →</button>
          </p>
        </div>
      </div>
    `;
  }

  renderCardMode() {
    return `
      <div class="ct-auth-card ct-auth-card--card">
        <h1 class="ct-auth-title ct-auth-title--card">Зарегистрируйтесь картой</h1>
        <div class="ct-auth-card-body">
          <div class="ct-nfc-badge" aria-hidden="true">
            ${NFC_BADGE_ICON}
          </div>
        </div>
        <div class="ct-auth-card-foot">
          <button type="button" class="ct-auth-emulate-btn btn-press" data-action="emulate-card">
            Эмулировать скан бейджа
          </button>
          <p class="ct-auth-switch">
            <button type="button" class="ct-auth-link-back btn-press" data-action="switch-pin">← Ввести код</button>
          </p>
        </div>
      </div>
    `;
  }

  bind() {
    const root = this.container;
    bindRuntimeModeFooter(root);
    bindSupportMessagesBtn(root);

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
