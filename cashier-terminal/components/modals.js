import chestnyZnakLogoUrl from '../../shared/assets/chestny-znak-logo.png';
import chestnyZnakQrUrl from '../../shared/assets/chestny-znak-qr.png';
import milkBottleUrl from '../../shared/assets/milk-bottle.png';
import bankTerminalUrl from '../../shared/assets/bank-terminal.png';
import { POS_PAYMENT_TYPE_IDS } from '../../shared/pos-channel.js';
import { slugFromCategoryName } from '../../shared/menu-catalog.js';
import { resolveOrderCategoryGroupIds } from '../../shared/wallets.js';
import { formatMoney, esc, escAttr } from '../core/format.js';
import { state, getTotal, getSubtotal, getDiscountAmount, getPaymentRemaining, getReceivedTotal, nextLineId } from '../core/state.js';
import { renderNumpad, bindNumpad } from './numpad.js';
import { renderGuestSearchZone, bindGuestSearchZone } from './search-keyboard.js';
import {
  filterClientsForPicker,
  crmUserToGuest,
  renderGuestDetailsBody,
} from '../services/guests.js';
import { finalizePosOrderOnPayment } from '../services/orders.js';
import { resolvePosPaymentMethodButtons } from '../services/payment-methods.js';
import { markServiceMessageRead, resetServiceMessagesUnread } from '../services/service-messages.js';

function renderModalShell({ title, widthClass = '', head = '', body = '', foot = '', barClass = 'ct-modal-bar--default' }) {
  return `
    <div class="ct-modal ct-modal--shell ${widthClass}">
      <div class="ct-modal-bar ${barClass}">${esc(title)}</div>
      <div class="ct-modal-shell-content">
        ${head ? `<div class="ct-modal-shell-head">${head}</div>` : ''}
        <div class="ct-modal-shell-body">${body}</div>
        ${foot ? `<div class="ct-modal-shell-foot">${foot}</div>` : ''}
      </div>
    </div>
  `;
}

function renderModalCloseBtn(label = 'Закрыть', action = 'close-modal') {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--steel btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalSecondaryBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--secondary btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalPrimaryBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--primary btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalSteelBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--steel btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalAccentBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--accent btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalDangerBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--danger btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalNumpad(value, { showDot = true, enterLabel = 'ВВОД' } = {}) {
  return renderNumpad({ value, showDot, enterLabel, layout: 'modal' });
}

/** @param {HTMLElement} root */
export function renderModals(root) {
  if (!state.modal) {
    const existing = root.querySelector('.ct-modal-layer');
    existing?.remove();
    return;
  }

  let existing = root.querySelector('.ct-modal-layer');
  if (!existing) {
    existing = document.createElement('div');
    existing.className = 'ct-modal-layer';
    root.appendChild(existing);
  }

  const html = {
    honest_sign: renderHonestSignModal,
    error: renderErrorModal,
    confirm: renderConfirmModal,
    payment: renderPaymentModal,
    terminal_waiting: renderTerminalWaitingModal,
    customer_search: renderCustomerSearchModal,
    guest_details: renderGuestDetailsModal,
    quantity: renderQuantityModal,
    price_list: renderPriceListModal,
    discount: renderDiscountModal,
    payments_log: renderPaymentsLogModal,
    service_messages: renderServiceMessagesModal,
  }[state.modal]?.();

  existing.innerHTML = html || '';
  bindModalHandlers(existing);
}

const HZ_SALE_BLOCK_REASONS = [
  'Код маркировки не найден в системе. Система «Честный знак» вообще не знает такого кода. Причины: производитель или импортёр не внёс его в систему, сканер плохо считал код, или произошла ошибка при передаче данных.',
  'Нет сведений о нанесении кода или вводе в оборот. Код есть в системе, но система не зафиксировала, что его нанесли на товар или ввели в оборот. Это значит, что товар как бы «не легален» для продажи.',
  'Товар уже выведен из оборота. Ранее этот код уже продали на кассе или списали по другой причине (например, из-за брака). Часто это случается, если кассир отсканировал код с одной упаковки, а отдал покупателю другую.',
  'Истёк срок годности. Система видит, что срок, установленный производителем, уже прошёл.',
  'Продажа заблокирована по решению госоргана. Например, контролирующий орган выявил серьёзное нарушение (опасная технология производства) и внёс код в «чёрный список».',
  'Цена выходит за допустимые рамки. Для некоторых категорий (например, табачной продукции) установлена максимальная розничная цена (МРЦ). Если цена в чеке ниже МРЦ или выше неё — продажа блокируется.',
  'Код не прошёл криптографическую проверку. В структуре кода есть ошибка: отсутствует криптохвост (цифровая часть), неверно указан разделитель GS или другие данные в коде некорректны.',
];

const HZ_EMULATED_MARK_CODE = '0104600266012429215M...X';

let hzSaleBlockReasonIndex = 0;

function renderHonestSignFoot() {
  return `
    <div class="ct-scan-foot">
      <div class="ct-scan-emulate">
        <button type="button" class="ct-scan-emulate-btn ct-scan-emulate-btn--success btn-press" data-action="hz-success">Успешный скан</button>
        <button type="button" class="ct-scan-emulate-btn ct-scan-emulate-btn--error btn-press" data-action="hz-error">Ошибка ЧЗ</button>
        <button type="button" class="ct-scan-emulate-btn ct-scan-emulate-btn--block btn-press" data-action="hz-block-sale">Эмуляция: Запрет продажи (ЧЗ)</button>
      </div>
      ${renderModalCloseBtn('Закрыть')}
    </div>
  `;
}

function renderHonestSignModal() {
  const product = state.pendingProduct;
  return renderModalShell({
    title: product?.name || 'Товар',
    widthClass: 'ct-modal--shell-medium ct-modal--honest-sign',
    body: `
      <div class="ct-scan-body">
        <div class="ct-scan-head">
          <div class="ct-scan-heading">
            <h2 class="ct-scan-title">Товар подлежит обязательной маркировке.</h2>
            <p class="ct-scan-subtitle">Отсканируйте марку Datamatrix</p>
          </div>
          <img class="ct-scan-logo" src="${escAttr(chestnyZnakLogoUrl)}" alt="Честный ЗНАК" width="144" height="44" />
          <div class="ct-scan-bottle" aria-hidden="true">
            <img class="ct-scan-bottle-img" src="${escAttr(milkBottleUrl)}" alt="" width="300" height="300" />
            <div class="ct-scan-qr-focus">
              <span class="ct-scan-qr-focus__corner ct-scan-qr-focus__corner--tl" aria-hidden="true"></span>
              <span class="ct-scan-qr-focus__corner ct-scan-qr-focus__corner--tr" aria-hidden="true"></span>
              <span class="ct-scan-qr-focus__corner ct-scan-qr-focus__corner--bl" aria-hidden="true"></span>
              <span class="ct-scan-qr-focus__corner ct-scan-qr-focus__corner--br" aria-hidden="true"></span>
              <img class="ct-scan-qr" src="${escAttr(chestnyZnakQrUrl)}" alt="" width="64" height="64" />
            </div>
          </div>
        </div>
      </div>
    `,
    foot: renderHonestSignFoot(),
  });
}

const ERROR_MODAL_ICON = `<svg class="ct-modal-message-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" stroke="#ff5c5c" stroke-width="2" fill="#fff5f5"/>
  <path d="M24 15v13" stroke="#ff5c5c" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="24" cy="33.5" r="1.75" fill="#ff5c5c"/>
</svg>`;

const HZ_BLOCK_MODAL_ICON = `<svg class="ct-modal-message-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" stroke="#f97316" stroke-width="2" fill="#fff7ed"/>
  <path d="M24 14v14" stroke="#ea580c" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="24" cy="34" r="1.75" fill="#ea580c"/>
</svg>`;

function renderHzErrorModalFoot() {
  return `
    <div class="ct-error-modal-foot ct-error-modal-foot--hz">
      ${renderModalCloseBtn('Закрыть')}
      ${renderModalAccentBtn('Повторить запрос', 'repeat-hz-request')}
    </div>
  `;
}

function renderErrorModal() {
  const data = state.modalData || {};
  const errorType = data.type || 'generic';

  if (errorType === 'sale_blocked') {
    const reason = data.reason || HZ_SALE_BLOCK_REASONS[0];
    const markCode = data.markCode || HZ_EMULATED_MARK_CODE;
    return renderModalShell({
      title: 'Внимание: Запрет продажи',
      barClass: 'ct-modal-bar--error',
      widthClass: 'ct-modal--shell-narrow ct-modal--error ct-modal--error-blocked',
      body: `
        <div class="ct-modal-message ct-modal-message--error ct-modal-message--hz-block">
          <div class="ct-modal-message-icon" aria-hidden="true">${HZ_BLOCK_MODAL_ICON}</div>
          <div class="ct-hz-block-content">
            <span class="ct-hz-mark-code">Код маркировки: ${esc(markCode)}</span>
            <strong class="ct-hz-block-status">ПРОДАЖА ЗАПРЕЩЕНА</strong>
            <p class="ct-hz-block-reason">${esc(reason)}</p>
          </div>
        </div>
      `,
      foot: renderHzErrorModalFoot(),
    });
  }

  if (errorType === 'technical') {
    const message = data.message || 'Ошибка проверки марки в системе Честный Знак';
    return renderModalShell({
      title: 'Ошибка',
      barClass: 'ct-modal-bar--error',
      widthClass: 'ct-modal--shell-narrow ct-modal--error',
      body: `
        <div class="ct-modal-message ct-modal-message--error">
          <div class="ct-modal-message-icon" aria-hidden="true">${ERROR_MODAL_ICON}</div>
          <div class="ct-hz-error-text">
            <p class="ct-modal-message-text">${esc(message)}</p>
            <p class="ct-hz-error-detail">Причина: Сбой сервиса ГИС МТ / Сетевой таймаут</p>
          </div>
        </div>
      `,
      foot: renderHzErrorModalFoot(),
    });
  }

  const message = data.message || 'Ошибка выполнения';
  return renderModalShell({
    title: 'Ошибка',
    barClass: 'ct-modal-bar--error',
    widthClass: 'ct-modal--shell-narrow ct-modal--error',
    body: `
      <div class="ct-modal-message ct-modal-message--error">
        <div class="ct-modal-message-icon" aria-hidden="true">${ERROR_MODAL_ICON}</div>
        <p class="ct-modal-message-text">${esc(message)}</p>
      </div>
    `,
    foot: `
      <div class="ct-error-modal-foot">
        ${renderModalCloseBtn('Закрыть')}
      </div>
    `,
  });
}

function renderConfirmModal() {
  const message = state.modalData.message || '';
  return renderModalShell({
    title: 'Требуется подтверждение',
    barClass: 'ct-modal-bar--info',
    widthClass: 'ct-modal--shell-narrow',
    body: `
      <div class="ct-modal-message">
        <div class="ct-modal-message-icon ct-modal-message-icon--info" aria-hidden="true">!</div>
        <p class="ct-modal-message-text">${esc(message)}</p>
      </div>
    `,
    foot: `
      ${renderModalSecondaryBtn('Нет', 'confirm-no')}
      ${renderModalPrimaryBtn('Да', 'confirm-yes')}
    `,
  });
}

function formatPaymentInputAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '0,00';
  return String(n.toFixed(2)).replace('.', ',');
}

function parsePaymentInput(val) {
  const n = parseFloat(String(val ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** @param {number} walletBalance @param {number} amountDue */
function resolveWalletFillAmount(walletBalance, amountDue) {
  return Math.min(Math.max(0, walletBalance), Math.max(0, amountDue));
}

function resolvePaymentInputReceived(remaining) {
  const raw = state.modalData.received;
  if (raw === '' || raw == null) {
    return formatPaymentInputAmount(remaining);
  }
  return raw;
}

function renderPaymentHeaderHtml() {
  const orderTotal = getTotal();
  const remaining = getPaymentRemaining();
  const paidSoFar = getReceivedTotal();
  if (paidSoFar > 0.009) {
    return `Осталось оплатить: ${formatMoney(remaining)} ₽ <span class="ct-payment-header__meta">из ${formatMoney(orderTotal)} ₽</span>`;
  }
  return `К оплате: ${formatMoney(orderTotal)} ₽`;
}

/** @param {HTMLElement|null|undefined} layer */
function updatePaymentChangeDisplay(layer) {
  if (!layer) return;
  const remaining = getPaymentRemaining();
  const entered = parsePaymentInput(state.modalData.received);
  const change = Math.max(0, Math.round((entered - remaining) * 100) / 100);
  const changeEl = layer.querySelector('[data-payment-change]');
  const changeWidget = layer.querySelector('[data-payment-change-widget]');
  if (changeEl) changeEl.textContent = `${formatMoney(change)} ₽`;
  if (changeWidget) changeWidget.classList.toggle('ct-payment-change-widget--due', change > 0);
}

/** @param {HTMLElement|null|undefined} layer @param {{ setValue?: (v: string, opts?: object) => void, armReplace?: () => void }|null|undefined} numpadControl @param {HTMLElement|null|undefined} [paymentAmount] */
function resetPaymentInput(layer, numpadControl, paymentAmount) {
  if (numpadControl?.setValue) {
    numpadControl.setValue('', { replaceOnNextInput: true });
    armPaymentAmountInput(paymentAmount, numpadControl);
    return;
  }
  state.modalData.received = '';
  const amountEl = paymentAmount || layer?.querySelector('[data-payment-amount]');
  const hidden = layer?.querySelector('.ct-modal--payment [data-numpad-value]');
  if (amountEl) amountEl.value = '';
  if (hidden) hidden.value = '';
  updatePaymentChangeDisplay(layer);
  armPaymentAmountInput(amountEl, numpadControl);
}

/** @param {HTMLElement|null|undefined} paymentAmount @param {{ armReplace?: () => void, isReplacePending?: () => boolean }|null|undefined} numpadControl */
function armPaymentAmountInput(paymentAmount, numpadControl) {
  numpadControl?.armReplace?.();
  if (!paymentAmount) return;
  paymentAmount.classList.add('ct-payment-amount--armed');
  requestAnimationFrame(() => {
    paymentAmount.focus({ preventScroll: true });
    paymentAmount.select();
  });
}

/** @param {HTMLElement|null|undefined} paymentAmount */
function disarmPaymentAmountInput(paymentAmount) {
  paymentAmount?.classList.remove('ct-payment-amount--armed');
}

function renderStandardPayMethod(method, selectedId) {
  return `
    <button type="button"
            class="ct-pay-method btn-press ${method.id === selectedId ? 'ct-pay-method--active' : ''}"
            data-pay-method="${escAttr(method.id)}">
      ${esc(method.name)}
    </button>
  `;
}

/** @param {object} guest */
function guestPaymentDisplayName(guest) {
  return String(guest.fullName || guest.name || '—').trim();
}

const PAYMENT_CLIENT_ICON = `<svg class="ct-payment-client-badge__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 19.5c.9-3.2 3.2-5.5 6.5-5.5s5.6 2.3 6.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** @param {string} walletId @param {string} caption @param {number} balance @param {string} methodId @param {string} variant */
function renderClientWalletCard(walletId, caption, balance, methodId, variant) {
  const disabled = balance <= 0 ? ' disabled' : '';
  return `
    <button type="button"
            class="ct-payment-wallet-card ct-payment-wallet-card--${variant} btn-press"
            data-client-wallet="${escAttr(walletId)}"
            data-pay-method="${escAttr(methodId)}"
            data-wallet-balance="${balance}"${disabled}>
      <span class="ct-payment-wallet-card__caption">${esc(caption)}</span>
      <strong class="ct-payment-wallet-card__amount">${formatMoney(balance)} ₽</strong>
    </button>
  `;
}

function walletPaymentMethodId(walletId) {
  if (walletId === 'personal') return POS_PAYMENT_TYPE_IDS.INTERNAL;
  if (walletId === 'dotation') return POS_PAYMENT_TYPE_IDS.DOTATION;
  return walletId;
}

function walletCardVariant(walletId) {
  if (walletId === 'dotation') return 'dotation';
  if (walletId === 'personal') return 'personal';
  return 'other';
}

/** @param {object} guest */
function resolveGuestPaymentWallets(guest) {
  if (guest.wallets?.length) {
    return guest.wallets.filter(w => w.available !== false && w.canPay !== false && (Number(w.balance) || 0) > 0);
  }
  return [];
}

/** @param {object} guest */
function renderClientBalancesPanel(guest) {
  const wallets = resolveGuestPaymentWallets(guest);
  const cards = wallets.map(wallet => renderClientWalletCard(
    wallet.id,
    wallet.name,
    wallet.balance,
    walletPaymentMethodId(wallet.id),
    walletCardVariant(wallet.id),
  ));

  if (!cards.length) return '';

  return `
    <aside class="ct-payment-client-panel" aria-label="Балансы клиента">
      <div class="ct-payment-client-badge">
        ${PAYMENT_CLIENT_ICON}
        <div class="ct-payment-client-badge__body">
          <span class="ct-payment-client-badge__label">Клиент</span>
          <span class="ct-payment-client-badge__name">${esc(guestPaymentDisplayName(guest))}</span>
        </div>
      </div>
      <div class="ct-payment-client-wallets">
        ${cards.join('')}
      </div>
    </aside>
  `;
}

/** @param {Array<{ id: string, name: string }>} methods @param {string} selectedId */
function renderPaymentMethodsHtml(methods, selectedId) {
  if (!methods.length) {
    return '<p class="ct-payment-methods-empty">Нет доступных способов оплаты. Настройте их в админке: Каналы продаж → Касса и раздел «Платежи».</p>';
  }

  return methods.map(method => renderStandardPayMethod(method, selectedId)).join('');
}

function renderPaymentModal() {
  const remaining = getPaymentRemaining();
  const received = resolvePaymentInputReceived(remaining);
  const entered = parsePaymentInput(received);
  const change = Math.max(0, Math.round((entered - remaining) * 100) / 100);
  const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
  const selectedId = state.modalData.selectedPaymentMethodId || methods[0]?.id || '';
  const methodsHtml = renderPaymentMethodsHtml(methods, selectedId);
  const guest = state.guest;
  const clientPanelHtml = guest ? renderClientBalancesPanel(guest) : '';
  const hasClientPanel = Boolean(clientPanelHtml);
  const headerHtml = renderPaymentHeaderHtml();

  const changeDue = change > 0;

  return `
    <div class="ct-modal ct-modal--payment ${hasClientPanel ? 'ct-modal--payment-with-client' : ''}">
      <div class="ct-modal-bar ct-modal-bar--pay ct-payment-header">${headerHtml}</div>
      <div class="ct-payment-body">
        <div class="ct-payment-top-row ${hasClientPanel ? 'ct-payment-top-row--with-client' : ''}">
          <div class="ct-payment-amount-row ct-keypad-top-row">
            <div class="ct-payment-amount-wrap ct-keypad-amount-wrap">
              <input class="ct-payment-amount" data-payment-amount value="${escAttr(received)}" readonly />
              <button type="button" class="ct-payment-amount-clear btn-press" data-action="payment-clear" aria-label="Очистить сумму">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <div class="ct-payment-change-widget ${changeDue ? 'ct-payment-change-widget--due' : ''}" data-payment-change-widget>
            <span class="ct-payment-change-label">Сдача</span>
            <strong class="ct-payment-change-value" data-payment-change>${formatMoney(change)} ₽</strong>
          </div>
        </div>

        <div class="ct-payment-keypad-row ${hasClientPanel ? 'ct-payment-keypad-row--with-client' : ''}">
          <div class="ct-payment-numpad-wrap ct-keypad-numpad-wrap">
            ${renderNumpad({ value: received, showDot: true, enterLabel: 'ОПЛАТИТЬ', layout: 'payment' })}
          </div>
          <div class="ct-payment-right-col ${hasClientPanel ? 'ct-payment-right-col--with-client' : ''}">
            <div class="ct-payment-methods-panel ${hasClientPanel ? 'ct-payment-methods-panel--with-client' : ''}">
              <div class="ct-payment-methods">
                ${methodsHtml}
              </div>
            </div>
            ${clientPanelHtml}
          </div>
        </div>

        <div class="ct-payment-footer">
          <div class="ct-payment-footer-fields">
            <label class="ct-payment-field ct-payment-field--stacked">
              <span class="ct-payment-field-label">Отправить чек на email</span>
              <input type="text" value="12345@max.ru" />
            </label>
            <label class="ct-payment-field ct-payment-field--stacked">
              <span class="ct-payment-field-label">Номер телефона</span>
              <input type="text" value="+7(916)9876543" />
            </label>
            <div class="ct-payment-field ct-payment-field--stacked ct-payment-field--print">
              <span class="ct-payment-field-label">Печать бумажного чека</span>
              <label class="ct-toggle ct-toggle--compact">
                <input type="checkbox" class="ct-toggle-input" data-print-receipt checked />
                <span class="ct-toggle-track" aria-hidden="true">
                  <span class="ct-toggle-thumb"></span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTerminalWaitingFoot() {
  return `
    <div class="ct-scan-foot">
      <div class="ct-scan-emulate">
        <button type="button" class="ct-scan-emulate-btn ct-scan-emulate-btn--success btn-press" data-action="terminal-success">Успешная оплата</button>
        <button type="button" class="ct-scan-emulate-btn ct-scan-emulate-btn--error btn-press" data-action="terminal-error">Ошибка терминала</button>
      </div>
      ${renderModalCloseBtn('Закрыть', 'terminal-dismiss')}
    </div>
  `;
}

function renderTerminalWaitingModal() {
  return renderModalShell({
    title: 'Оплата по терминалу',
    widthClass: 'ct-modal--shell-medium ct-modal--terminal-wait',
    body: `
      <div class="ct-terminal-wait">
        <h2 class="ct-terminal-wait__title">Следуйте инструкциям на терминале</h2>
        <p class="ct-terminal-wait__subtitle">Чтобы прервать операцию нажмите кнопку «отмена» на терминале</p>
        <div class="ct-terminal-wait-panel">
          <div class="ct-terminal-wait-visual" aria-hidden="true">
            <div class="ct-terminal-wait-spinner"></div>
            <img class="ct-terminal-wait-img" src="${escAttr(bankTerminalUrl)}" alt="" width="256" height="256" />
          </div>
        </div>
      </div>
    `,
    foot: renderTerminalWaitingFoot(),
  });
}

function renderGuestDetailsModal() {
  const guest = state.guest;
  if (!guest) return '';

  return renderModalShell({
    title: 'Клиент',
    widthClass: 'ct-modal--shell-medium ct-modal--guest-details',
    body: renderGuestDetailsBody(guest),
    foot: `
      <div class="ct-guest-detail-foot">
        ${renderModalCloseBtn('Закрыть')}
        ${renderModalAccentBtn('Сменить', 'change-guest-modal')}
        ${renderModalDangerBtn('Отменить выбор', 'clear-guest-modal')}
      </div>
    `,
  });
}

function renderGuestPickerWalletHtml(wallets) {
  if (!wallets?.length) {
    return '<span class="ct-guest-picker-row__wallet-empty">—</span>';
  }

  return wallets.map(wallet => `
    <span class="ct-guest-picker-row__wallet">
      <span class="ct-guest-picker-row__wallet-name">${esc(wallet.name)}</span>
      <span class="ct-guest-picker-row__wallet-balance">${formatMoney(wallet.balance)} ₽</span>
    </span>
  `).join('');
}

function buildGuestPickerListHtml(query = state.modalData.search || '') {
  const groupsById = state.crmGroupsById || {};
  const clients = filterClientsForPicker(state.crmClients || [], groupsById, query);
  const selectedId = state.guest?.id || state.modalData.selectedId;

  if (!clients.length) {
    return query.trim()
      ? '<p class="ct-guest-picker-empty">Клиенты не найдены</p>'
      : `<p class="ct-guest-picker-empty">
          Нет клиентов с правилами валидации.
          Создайте клиента в CRM, назначьте группу и добавьте правило для этой группы.
        </p>`;
  }

  return `
    <div class="ct-guest-picker-list-head" aria-hidden="true">
      <span class="ct-guest-picker-list-col ct-guest-picker-list-col--name">ФИО</span>
      <span class="ct-guest-picker-list-col ct-guest-picker-list-col--group">Группа</span>
      <span class="ct-guest-picker-list-col ct-guest-picker-list-col--wallets">Кошельки</span>
    </div>
    ${clients.map(({ user, displayName, tag, identifier, wallets }) => `
      <button type="button"
              class="ct-guest-picker-row btn-press ${user.id === selectedId ? 'ct-guest-picker-row--active' : ''}"
              data-guest-id="${escAttr(user.id)}">
        <span class="ct-guest-picker-list-col ct-guest-picker-list-col--name">
          ${identifier ? `<span class="ct-guest-picker-row__meta">${esc(identifier)}</span>` : ''}
          <span class="ct-guest-picker-row__name">${esc(displayName)}</span>
        </span>
        <span class="ct-guest-picker-list-col ct-guest-picker-list-col--group">
          <span class="ct-guest-picker-row__group">${tag ? esc(tag) : '—'}</span>
        </span>
        <span class="ct-guest-picker-list-col ct-guest-picker-list-col--wallets">
          <span class="ct-guest-picker-row__wallets">${renderGuestPickerWalletHtml(wallets)}</span>
        </span>
      </button>
    `).join('')}
  `;
}

/** @param {HTMLElement} layer @param {(guestId: string) => void} selectGuestById */
function refreshGuestPickerList(layer, selectGuestById) {
  const listEl = layer.querySelector('.ct-guest-picker-list');
  if (!listEl) return;
  listEl.innerHTML = buildGuestPickerListHtml();
  bindGuestPickerRows(layer, selectGuestById);
}

/** @param {HTMLElement} layer */
function bindGuestPickerRows(layer, selectGuestById) {
  layer.querySelectorAll('[data-guest-id]').forEach(btn => {
    btn.addEventListener('click', () => selectGuestById(btn.dataset.guestId));
  });
}

const SERVICE_MSG_ICON_CRITICAL = `<svg class="ct-service-msg-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>`;

const SERVICE_MSG_ICON_WARNING = `<svg class="ct-service-msg-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.5 20.5 19H3.5L12 4.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>`;

const SERVICE_MSG_ICON_INFO = `<svg class="ct-service-msg-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" stroke="currentColor" stroke-width="2"/><path d="M8.5 12.5 11 15l4.5-5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SERVICE_MSG_MARK_READ_ICON = `<svg class="ct-service-msg-mark-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 12.5 10 16.5 18 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderServiceMessageIcon(type) {
  if (type === 'critical') {
    return `<span class="ct-service-msg-icon ct-service-msg-icon--critical" aria-hidden="true">${SERVICE_MSG_ICON_CRITICAL}</span>`;
  }
  if (type === 'warning') {
    return `<span class="ct-service-msg-icon ct-service-msg-icon--warning" aria-hidden="true">${SERVICE_MSG_ICON_WARNING}</span>`;
  }
  return `<span class="ct-service-msg-icon ct-service-msg-icon--info" aria-hidden="true">${SERVICE_MSG_ICON_INFO}</span>`;
}

function renderServiceMessagesListHtml() {
  return state.serviceMessages.map(msg => `
    <div
      class="ct-service-msg-row ${msg.unread ? 'ct-service-msg-row--unread' : 'ct-service-msg-row--read'}"
      data-service-msg-id="${escAttr(msg.id)}"
      role="button"
      tabindex="0"
    >
      ${renderServiceMessageIcon(msg.type)}
      <span class="ct-service-msg-text">${esc(msg.text)}</span>
      ${msg.unread ? `
        <button
          type="button"
          class="ct-service-msg-mark btn-press"
          data-action="mark-service-msg-read"
          data-msg-id="${escAttr(msg.id)}"
          aria-label="Прочитано"
        >${SERVICE_MSG_MARK_READ_ICON}</button>
      ` : ''}
    </div>
  `).join('');
}

function renderServiceMessagesModal() {
  return renderModalShell({
    title: 'Служебные сообщения',
    widthClass: 'ct-modal--shell ct-modal--service-messages',
    body: `<div class="ct-service-messages-list">${renderServiceMessagesListHtml()}</div>`,
    foot: `
      <div class="ct-service-messages-foot">
        ${renderModalSecondaryBtn('Сброс', 'reset-service-messages-read')}
        ${renderModalCloseBtn('ЗАКРЫТЬ')}
      </div>
    `,
  });
}

/** @param {HTMLElement} layer */
function bindServiceMessagesHandlers(layer) {
  layer.querySelectorAll('[data-action="mark-service-msg-read"]').forEach(btn => {
    const markRead = (e) => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      if (markServiceMessageRead(state.serviceMessages, btn.dataset.msgId)) {
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      }
    };
    btn.addEventListener('click', markRead);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') markRead(e);
    });
  });

  layer.querySelectorAll('[data-service-msg-id]').forEach(row => {
    const markRowRead = () => {
      if (markServiceMessageRead(state.serviceMessages, row.dataset.serviceMsgId)) {
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      }
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="mark-service-msg-read"]')) return;
      markRowRead();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        markRowRead();
      }
    });
  });

  layer.querySelector('[data-action="reset-service-messages-read"]')?.addEventListener('click', () => {
    if (resetServiceMessagesUnread(state.serviceMessages)) {
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    }
  });
}

function renderCustomerSearchModal() {
  const query = state.modalData.search || '';
  const keyboardOpen = state.modalData.guestKeyboardOpen !== false;
  const keyboardLayout = state.modalData.guestKeyboardLayout || 'jcuken';
  const listHtml = buildGuestPickerListHtml(query);

  return renderModalShell({
    title: 'Выбор клиента',
    widthClass: 'ct-modal--shell ct-modal--guest-picker',
    body: `
      <div class="ct-guest-picker-layout">
        <div class="ct-guest-picker-panel">
          <div class="ct-guest-picker-list">${listHtml}</div>
        </div>
        ${renderGuestSearchZone({ query, keyboardOpen, layout: keyboardLayout })}
      </div>
    `,
    foot: `
      <div class="ct-guest-picker-foot">
        ${renderModalCloseBtn('Закрыть')}
        ${state.guest ? renderModalDangerBtn('Отменить выбор', 'clear-guest-modal') : ''}
      </div>
    `,
  });
}

/** @param {HTMLElement|null|undefined} qtyInput @param {{ armReplace?: () => void }|null|undefined} numpadControl */
function resetQtyInput(qtyInput, numpadControl, layer) {
  state.modalData.value = '0';
  state.modalData.preset = '';
  numpadControl?.setValue('0', { replaceOnNextInput: true });
  if (qtyInput) qtyInput.value = '0';
  layer?.querySelector('[data-action="qty-clear"]')
    ?.classList.add('ct-payment-amount-clear--hidden');
  layer?.querySelectorAll('[data-qty-preset]').forEach(btn => {
    btn.classList.remove('ct-qty-preset-card--active');
  });
  armPaymentAmountInput(qtyInput, numpadControl);
}

/** @param {HTMLElement} layer */
function bindQuantityModalHandlers(layer) {
  const qtyInput = layer.querySelector('[data-qty-value]');
  const numpad = layer.querySelector('.ct-modal--quantity .ct-numpad');
  if (!numpad || !qtyInput) return;

  const qtyNumpadControl = bindNumpad(numpad, {
    replaceOnNextInput: true,
    onChange: (val) => {
      state.modalData.value = val;
      qtyInput.value = val;
      if (state.modalData.preset && val !== state.modalData.preset) {
        state.modalData.preset = '';
      }
      disarmPaymentAmountInput(qtyInput);
      layer.querySelector('[data-action="qty-clear"]')
        ?.classList.toggle('ct-payment-amount-clear--hidden', !val || val === '0');
      layer.querySelectorAll('[data-qty-preset]').forEach(btn => {
        btn.classList.toggle(
          'ct-qty-preset-card--active',
          Boolean(state.modalData.preset) && btn.dataset.qtyPreset === state.modalData.preset,
        );
      });
    },
    onEnter: () => {
      const qty = parseFloat((state.modalData.value || '0').replace(',', '.'));
      applyQuantityToSelection(Number.isFinite(qty) ? Math.max(0.01, qty) : 1);
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    },
    onCancel: () => {
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    },
  });

  armPaymentAmountInput(qtyInput, qtyNumpadControl);

  layer.querySelector('[data-action="qty-clear"]')?.addEventListener('click', () => {
    resetQtyInput(qtyInput, qtyNumpadControl, layer);
  });

  layer.querySelectorAll('[data-qty-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.qtyPreset || '';
      state.modalData.preset = preset;
      state.modalData.value = preset;
      qtyNumpadControl.setValue(preset, { replaceOnNextInput: true });
      qtyInput.value = preset;
      disarmPaymentAmountInput(qtyInput);
      layer.querySelector('[data-action="qty-clear"]')
        ?.classList.toggle('ct-payment-amount-clear--hidden', !preset || preset === '0');
      layer.querySelectorAll('[data-qty-preset]').forEach(item => {
        item.classList.toggle('ct-qty-preset-card--active', item === btn);
      });
    });
  });
}

function renderQuantityModal() {
  const value = state.modalData.value || '1';
  const presets = ['0,25', '0,33', '0,5', '1,5'];
  const active = state.modalData.preset || '';
  const productName = state.modalData.productName
    || state.receiptLines.find(l => l.id === state.selectedLineId)?.name
    || 'Товар';
  const showClear = value && value !== '0';

  return `
    <div class="ct-modal ct-modal--quantity">
      <div class="ct-modal-bar ct-modal-bar--pay ct-qty-header">
        Ввод количества: <span class="ct-qty-header__product">${esc(productName)}</span>
      </div>
      <div class="ct-qty-body ct-keypad-body">
        <div class="ct-qty-top-row ct-keypad-top-row">
          <div class="ct-qty-amount-wrap ct-keypad-amount-wrap">
            <input class="ct-payment-amount ct-qty-amount" data-qty-value value="${escAttr(value)}" readonly />
            <button type="button" class="ct-payment-amount-clear btn-press ${showClear ? '' : 'ct-payment-amount-clear--hidden'}" data-action="qty-clear" aria-label="Очистить количество">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
        <div class="ct-qty-keypad-row">
          <div class="ct-qty-numpad-wrap ct-keypad-numpad-wrap">
            ${renderNumpad({ value, showDot: true, enterLabel: 'ВВОД', layout: 'payment' })}
          </div>
          <aside class="ct-qty-presets-panel" aria-label="Быстрый выбор порции">
            <span class="ct-qty-presets-label">Быстрый выбор</span>
            <div class="ct-qty-presets">
              ${presets.map(p => `
                <button type="button" class="ct-qty-preset-card btn-press ${active === p ? 'ct-qty-preset-card--active' : ''}" data-qty-preset="${escAttr(p)}">${esc(p)}</button>
              `).join('')}
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;
}

function renderPriceListModal() {
  const current = state.modalData.category || state.priceCategory;
  const options = [
    { id: 'main', label: 'Основной' },
    { id: 'employees', label: 'Сотрудники' },
  ];
  return renderModalShell({
    title: 'Прайс-лист',
    widthClass: 'ct-modal--shell-narrow',
    body: options.map(o => `
      <button type="button" class="ct-price-option btn-press ${current === o.id ? 'ct-price-option--active' : ''}" data-price-category="${escAttr(o.id)}">${esc(o.label)}</button>
    `).join(''),
    foot: renderModalCloseBtn('Закрыть'),
  });
}

/** @param {HTMLElement|null|undefined} discountInput @param {{ setValue?: (v: string, opts?: object) => void, armReplace?: () => void }|null|undefined} numpadControl @param {HTMLElement} layer */
function resetDiscountInput(discountInput, numpadControl, layer) {
  state.modalData.value = '0';
  numpadControl?.setValue('0', { replaceOnNextInput: true });
  if (discountInput) discountInput.value = '0';
  layer.querySelector('[data-action="discount-clear"]')
    ?.classList.add('ct-payment-amount-clear--hidden');
  armPaymentAmountInput(discountInput, numpadControl);
}

/** @param {HTMLElement} layer */
function bindDiscountModalHandlers(layer) {
  const discountInput = layer.querySelector('[data-discount-value]');
  const numpad = layer.querySelector('.ct-modal--discount .ct-numpad');
  if (!numpad || !discountInput) return;

  const discountNumpadControl = bindNumpad(numpad, {
    replaceOnNextInput: true,
    onChange: (val) => {
      state.modalData.value = val;
      discountInput.value = val;
      disarmPaymentAmountInput(discountInput);
      layer.querySelector('[data-action="discount-clear"]')
        ?.classList.toggle('ct-payment-amount-clear--hidden', !val || val === '0');
    },
    onEnter: () => {
      const pct = parseFloat((state.modalData.value || '0').replace(',', '.'));
      state.receiptDiscountPct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    },
    onCancel: () => {
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    },
  });

  armPaymentAmountInput(discountInput, discountNumpadControl);

  layer.querySelector('[data-action="discount-clear"]')?.addEventListener('click', () => {
    resetDiscountInput(discountInput, discountNumpadControl, layer);
  });
}

function renderDiscountModal() {
  const raw = state.modalData.value ?? String(state.receiptDiscountPct ?? '');
  const value = raw === '' ? '0' : raw;
  const showClear = value && value !== '0';

  return `
    <div class="ct-modal ct-modal--discount">
      <div class="ct-modal-bar ct-modal-bar--pay ct-discount-header">Скидка %</div>
      <div class="ct-discount-body ct-keypad-body">
        <div class="ct-discount-top-row ct-keypad-top-row">
          <div class="ct-discount-amount-wrap ct-keypad-amount-wrap">
            <input class="ct-payment-amount ct-discount-amount" data-discount-value value="${escAttr(value)}" readonly />
            <button type="button" class="ct-payment-amount-clear btn-press ${showClear ? '' : 'ct-payment-amount-clear--hidden'}" data-action="discount-clear" aria-label="Очистить скидку">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
        <div class="ct-discount-keypad-row">
          <div class="ct-discount-numpad-wrap ct-keypad-numpad-wrap">
            ${renderNumpad({ value, showDot: false, enterLabel: 'ВВОД', layout: 'payment' })}
          </div>
        </div>
      </div>
    </div>
  `;
}

const PAYMENTS_EMPTY_ICON = `<svg class="ct-payments-empty__icon" viewBox="0 0 48 48" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="8" width="28" height="32" rx="4" stroke="currentColor" stroke-width="2"/>
  <path d="M16 16h16M16 22h16M16 28h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="7" stroke="currentColor" stroke-width="2"/>
  <path d="M29.5 32h5M32 29.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

function renderPaymentsEmptyState() {
  return `
    <div class="ct-payments-empty">
      ${PAYMENTS_EMPTY_ICON}
      <p class="ct-payments-empty__text">Внесённых платежей пока нет</p>
    </div>
  `;
}

function renderPaymentsLogModal() {
  const rows = state.paymentsLog;
  return renderModalShell({
    title: 'Платежи',
    widthClass: 'ct-modal--shell-medium ct-modal--payments-log',
    body: `
      <div class="ct-payments-log ${rows.length ? 'ct-payments-log--filled' : 'ct-payments-log--empty'}">
        ${rows.length ? rows.map(p => `
          <div class="ct-payment-log-row">
            <span>${esc(p.method)}</span>
            <span>${formatMoney(p.amount)} Р</span>
          </div>
        `).join('') : renderPaymentsEmptyState()}
      </div>
    `,
    foot: `
      <div class="ct-payments-log-foot">
        ${renderModalCloseBtn('Закрыть')}
      </div>
    `,
  });
}

/** @param {HTMLElement} layer */
function bindModalHandlers(layer) {
  layer.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => {
    if (state.modal === 'error' && state.modalData?.hzContext) {
      state.pendingProduct = null;
    }
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="hz-success"]')?.addEventListener('click', () => {
    const product = state.pendingProduct;
    if (!product) return;
    addProductToReceipt(product, `DM-${Date.now()}`);
    state.pendingProduct = null;
    state.modal = null;
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="hz-error"]')?.addEventListener('click', () => {
    state.modal = 'error';
    state.modalData = {
      type: 'technical',
      hzContext: true,
      message: 'Ошибка проверки марки в системе Честный Знак',
    };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="hz-block-sale"]')?.addEventListener('click', () => {
    const reason = HZ_SALE_BLOCK_REASONS[hzSaleBlockReasonIndex];
    hzSaleBlockReasonIndex = (hzSaleBlockReasonIndex + 1) % HZ_SALE_BLOCK_REASONS.length;
    state.modal = 'error';
    state.modalData = {
      type: 'sale_blocked',
      hzContext: true,
      reason,
      markCode: HZ_EMULATED_MARK_CODE,
    };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="repeat-hz-request"]')?.addEventListener('click', () => {
    if (!state.pendingProduct) return;
    state.modal = 'honest_sign';
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="confirm-yes"]')?.addEventListener('click', () => {
    state.modalData.onYes?.();
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="confirm-no"]')?.addEventListener('click', () => {
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="complete-payment"]')?.addEventListener('click', () => {
    submitPayment();
  });

  function submitPayment() {
    const entered = parsePaymentInput(state.modalData.received);
    if (entered <= 0) return;

    const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
    const selected = methods.find(m => m.id === state.modalData.selectedPaymentMethodId) || methods[0];
    if (selected?.id === POS_PAYMENT_TYPE_IDS.CARD) {
      state.modal = 'terminal_waiting';
      state.modalData = {
        ...state.modalData,
        paymentReturn: {
          received: state.modalData.received,
          selectedPaymentMethodId: state.modalData.selectedPaymentMethodId,
        },
      };
      window.dispatchEvent(new CustomEvent('ct:rerender'));
      return;
    }
    completePayment(layer);
  }

  function completePayment(layer) {
    const remainingBefore = getPaymentRemaining();
    const entered = parsePaymentInput(state.modalData.received);
    if (entered <= 0 || remainingBefore <= 0) return;

    const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
    const selected = methods.find(m => m.id === state.modalData.selectedPaymentMethodId) || methods[0];
    const paymentAmount = Math.min(entered, remainingBefore);

    state.paymentsLog.push({
      method: selected?.name || 'Оплата',
      methodId: selected?.id,
      amount: paymentAmount,
      at: new Date(),
    });

    const remainingAfter = getPaymentRemaining();
    if (remainingAfter > 0.009) {
      state.modal = 'payment';
      state.modalData = {
        received: formatPaymentInputAmount(remainingAfter),
        selectedPaymentMethodId: state.modalData.selectedPaymentMethodId,
      };
      window.dispatchEvent(new CustomEvent('ct:rerender'));
      return;
    }

    const payments = [...state.paymentsLog];
    void finalizePosOrderOnPayment(payments).then(() => {
      state.receiptLines = [];
      state.guest = null;
      state.receiptDiscountPct = 0;
      state.receivedAmount = 0;
      state.paymentsLog = [];
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  }

  layer.querySelector('[data-action="terminal-success"]')?.addEventListener('click', () => {
    completePayment(layer);
  });

  layer.querySelector('[data-action="terminal-error"]')?.addEventListener('click', () => {
    state.modal = 'error';
    state.modalData = { message: 'Ошибка оплаты на банковском терминале' };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="terminal-dismiss"]')?.addEventListener('click', () => {
    const ret = state.modalData.paymentReturn;
    state.modal = 'payment';
    state.modalData = {
      received: ret?.received ?? '0',
      selectedPaymentMethodId: ret?.selectedPaymentMethodId,
    };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  function receiptCategoryGroupIds() {
    const dishCategoryById = Object.fromEntries(
      state.items.map(i => [i.id, i.categoryId || slugFromCategoryName(i.category || '')]),
    );
    return resolveOrderCategoryGroupIds(
      state.receiptLines.map(l => ({ dishId: l.productId })),
      state.categoryGroups,
      dishCategoryById,
    );
  }

  function selectGuestById(guestId) {
    const user = (state.crmClients || []).find(c => c.id === guestId);
    if (!user) return;
    state.guest = crmUserToGuest(user, state.crmGroupsById || {}, receiptCategoryGroupIds());
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  }

  bindGuestPickerRows(layer, selectGuestById);

  const guestSearchZone = layer.querySelector('[data-guest-search-zone]');
  if (guestSearchZone) {
    bindGuestSearchZone(guestSearchZone, {
      onQueryChange: (next) => {
        if (!state.modalData) state.modalData = {};
        state.modalData.search = next;
        refreshGuestPickerList(layer, selectGuestById);
      },
      onCollapseToggle: () => {
        state.modalData.guestKeyboardOpen = state.modalData.guestKeyboardOpen === false;
        const root = layer.parentElement;
        if (root) renderModals(root);
      },
      onLayoutChange: (layout) => {
        state.modalData.guestKeyboardLayout = layout;
        const root = layer.parentElement;
        if (root) renderModals(root);
      },
    });
  }

  layer.querySelector('[data-action="clear-guest-modal"]')?.addEventListener('click', () => {
    state.guest = null;
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="change-guest-modal"]')?.addEventListener('click', () => {
    state.modal = 'customer_search';
    state.modalData = { search: '', selectedId: state.guest?.id, guestKeyboardOpen: true, guestKeyboardLayout: 'jcuken' };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelectorAll('[data-price-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.priceCategory = btn.dataset.priceCategory;
      state.modal = null;
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  });

  if (state.modal === 'quantity') {
    bindQuantityModalHandlers(layer);
  }

  if (state.modal === 'discount') {
    bindDiscountModalHandlers(layer);
  }

  if (state.modal === 'service_messages') {
    bindServiceMessagesHandlers(layer);
  }

  layer.querySelectorAll('[data-pay-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.modalData.selectedPaymentMethodId = btn.dataset.payMethod;
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  });

  layer.querySelectorAll('[data-client-wallet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const methodId = btn.dataset.payMethod;
      const walletBalance = parseFloat(String(btn.dataset.walletBalance).replace(',', '.')) || 0;
      state.modalData.selectedPaymentMethodId = methodId;
      state.modalData.received = formatPaymentInputAmount(
        resolveWalletFillAmount(walletBalance, getPaymentRemaining()),
      );
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  });

  const paymentNumpad = layer.querySelector('.ct-modal--payment .ct-numpad');
  const paymentAmount = layer.querySelector('[data-payment-amount]');
  let paymentNumpadControl = null;
  if (paymentNumpad && paymentAmount) {
    paymentNumpadControl = bindNumpad(paymentNumpad, {
      replaceOnNextInput: true,
      onChange: (val) => {
        state.modalData.received = val;
        paymentAmount.value = val;
        disarmPaymentAmountInput(paymentAmount);
        updatePaymentChangeDisplay(layer);
      },
      onEnter: () => submitPayment(),
      onCancel: () => {
        state.paymentsLog = [];
        state.modal = null;
        state.modalData = {};
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
    });
    armPaymentAmountInput(paymentAmount, paymentNumpadControl);
  }

  layer.querySelector('[data-action="payment-clear"]')?.addEventListener('click', () => {
    resetPaymentInput(layer, paymentNumpadControl, paymentAmount);
  });
}

/** @param {object} product @param {string} [honestSignCode] */
export function addProductToReceipt(product, honestSignCode) {
  const price = state.priceCategory === 'employees'
    ? Math.round(product.price * 0.85)
    : product.price;

  const existing = state.receiptLines.find(l => l.productId === product.id && !product.honestSignMarked);
  if (existing && !honestSignCode) {
    existing.quantity += 1;
    state.selectedLineId = existing.id;
    return;
  }

  const line = {
    id: nextLineId(),
    productId: product.id,
    name: product.name,
    price,
    quantity: 1,
    priceCategory: state.priceCategory,
    discountPct: 0,
    kitchenStatus: 'Кухня',
    honestSignCode: honestSignCode || undefined,
    honestSignMarked: Boolean(honestSignCode),
  };
  state.receiptLines.push(line);
  state.selectedLineId = line.id;
}

/** @param {number} qty */
function applyQuantityToSelection(qty) {
  const id = state.selectedLineId;
  if (!id) return;
  state.receiptLines = state.receiptLines.map(line =>
    line.id === id ? { ...line, quantity: qty } : line,
  );
}

export function openProduct(product) {
  if (product.honestSignMarked) {
    state.pendingProduct = product;
    state.modal = 'honest_sign';
    return;
  }
  addProductToReceipt(product);
}
