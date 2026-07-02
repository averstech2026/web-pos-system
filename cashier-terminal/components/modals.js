import { formatMoney, esc, escAttr } from '../core/format.js';
import { state, getTotal, getSubtotal, getDiscountAmount, nextLineId } from '../core/state.js';
import { renderNumpad, bindNumpad } from './numpad.js';
import {
  filterClientsForPicker,
  crmUserToGuest,
  renderGuestDetailsBody,
} from '../services/guests.js';
import { finalizePosOrderOnPayment } from '../services/orders.js';
import { resolvePosPaymentMethodButtons } from '../services/payment-methods.js';

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
  return `<button type="button" class="ct-modal-btn ct-modal-btn--close btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalSecondaryBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--secondary btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
}

function renderModalPrimaryBtn(label, action) {
  return `<button type="button" class="ct-modal-btn ct-modal-btn--primary btn-press" data-action="${escAttr(action)}">${esc(label)}</button>`;
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
    customer_search: renderCustomerSearchModal,
    guest_details: renderGuestDetailsModal,
    quantity: renderQuantityModal,
    price_list: renderPriceListModal,
    discount: renderDiscountModal,
    payments_log: renderPaymentsLogModal,
  }[state.modal]?.();

  existing.innerHTML = html || '';
  bindModalHandlers(existing);
}

function renderHonestSignModal() {
  const product = state.pendingProduct;
  return renderModalShell({
    title: product?.name || 'Товар',
    widthClass: 'ct-modal--shell-medium',
    body: `
      <div class="ct-scan-body">
        <div class="ct-scan-logo">ЧЕСТНЫЙ ЗНАК</div>
        <p class="ct-scan-title">Товар подлежит обязательной маркировке.<br>Отсканируйте марку Datamatrix</p>
        <div class="ct-scan-illustration" aria-hidden="true">
          <div class="ct-datamatrix"></div>
        </div>
        <p class="ct-scan-hint">ОТСКАНИРУЙТЕ МАРКУ НА УПАКОВКЕ ТОВАРА</p>
        <div class="ct-scan-actions">
          <button type="button" class="ct-modal-btn ct-modal-btn--primary btn-press" data-action="hz-success">Эмулировать успешный скан марки</button>
          <button type="button" class="ct-modal-btn ct-modal-btn--danger btn-press" data-action="hz-error">Эмулировать ошибку ЧЗ</button>
        </div>
      </div>
    `,
    foot: renderModalCloseBtn('Закрыть'),
  });
}

function renderErrorModal() {
  const message = state.modalData.message || 'Ошибка выполнения';
  return renderModalShell({
    title: 'Ошибка',
    barClass: 'ct-modal-bar--error',
    widthClass: 'ct-modal--shell-narrow',
    body: `
      <div class="ct-modal-message">
        <div class="ct-modal-message-icon" aria-hidden="true">!</div>
        <p class="ct-modal-message-text">${esc(message)}</p>
      </div>
    `,
    foot: renderModalPrimaryBtn('OK', 'close-modal'),
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

function renderPaymentModal() {
  const total = getTotal();
  const received = state.modalData.received ?? String(total.toFixed(2)).replace('.', ',');
  const change = Math.max(0, parseFloat(received.replace(',', '.')) - total);
  const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
  const selectedId = state.modalData.selectedPaymentMethodId || methods[0]?.id || '';
  const methodsHtml = methods.length
    ? methods.map(method => `
        <button type="button"
                class="ct-pay-method btn-press ${method.id === selectedId ? 'ct-pay-method--active' : ''}"
                data-pay-method="${escAttr(method.id)}">
          ${esc(method.name)}
        </button>
      `).join('')
    : '<p class="ct-payment-methods-empty">Нет доступных способов оплаты. Настройте их в админке: Каналы продаж → Касса и раздел «Платежи».</p>';

  const changeDue = change > 0;

  return `
    <div class="ct-modal ct-modal--payment">
      <div class="ct-modal-bar ct-modal-bar--pay">К оплате</div>
      <div class="ct-payment-body">
        <div class="ct-payment-top-row">
          <div class="ct-payment-amount-row">
            <input class="ct-payment-amount" data-payment-amount value="${escAttr(received)}" readonly />
          </div>
          <div class="ct-payment-change-widget ${changeDue ? 'ct-payment-change-widget--due' : ''}" data-payment-change-widget>
            <span class="ct-payment-change-label">Сдача</span>
            <strong class="ct-payment-change-value" data-payment-change>${formatMoney(change)} ₽</strong>
          </div>
        </div>

        <div class="ct-payment-keypad-row">
          <div class="ct-payment-numpad-wrap">
            ${renderNumpad({ value: received, showDot: true, enterLabel: 'ОПЛАТИТЬ', layout: 'payment' })}
          </div>
          <div class="ct-payment-methods-panel">
            <div class="ct-payment-methods">
              ${methodsHtml}
            </div>
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

function renderGuestDetailsModal() {
  const guest = state.guest;
  if (!guest) return '';

  return renderModalShell({
    title: 'Клиент',
    widthClass: 'ct-modal--shell-medium ct-modal--guest-details',
    body: renderGuestDetailsBody(guest),
    foot: `
      ${renderModalCloseBtn('Закрыть')}
      ${renderModalSecondaryBtn('Сменить клиента', 'change-guest-modal')}
      ${renderModalDangerBtn('Отменить выбор', 'clear-guest-modal')}
    `,
  });
}

function renderCustomerSearchModal() {
  const query = state.modalData.search || '';
  const groupsById = state.crmGroupsById || {};
  const clients = filterClientsForPicker(state.crmClients || [], groupsById, query);
  const selectedId = state.guest?.id || state.modalData.selectedId;

  const listHtml = clients.length
    ? clients.map(({ user, name, tag }) => `
        <button type="button"
                class="ct-guest-btn btn-press ${user.id === selectedId ? 'ct-guest-btn--active' : ''}"
                data-guest-id="${escAttr(user.id)}">
          <span class="ct-guest-btn__name">${esc(name)}</span>
          ${tag ? `<span class="ct-guest-btn__tag">${esc(tag)}</span>` : ''}
        </button>
      `).join('')
    : `<p class="ct-guest-picker-empty">
        Нет клиентов с правилами валидации.
        Создайте клиента в CRM, назначьте группу и добавьте правило для этой группы.
      </p>`;

  return renderModalShell({
    title: 'Выбор клиента',
    widthClass: 'ct-modal--shell-wide ct-modal--guest-picker',
    head: `
      <label class="ct-modal-shell-search">
        <span>Поиск</span>
        <input type="text" data-guest-search value="${escAttr(query)}" placeholder="Имя, карта, телефон…" />
      </label>
    `,
    body: `<div class="ct-guest-btns">${listHtml}</div>`,
    foot: `
      ${renderModalCloseBtn('Закрыть')}
      ${state.guest ? renderModalDangerBtn('Отменить выбор', 'clear-guest-modal') : ''}
    `,
  });
}

function renderQuantityModal() {
  const value = state.modalData.value || '1';
  const presets = ['0,25', '0,33', '0,5', '1,5'];
  const active = state.modalData.preset || '';

  return renderModalShell({
    title: 'Ввод количества',
    widthClass: 'ct-modal--shell-medium',
    head: `<input class="ct-modal-shell-input" data-qty-value value="${escAttr(value)}" readonly />`,
    body: `
      <div class="ct-qty-main">
        ${renderModalNumpad(value)}
        <div class="ct-qty-presets">
          <div class="ct-qty-presets-label">Порция</div>
          ${presets.map(p => `
            <button type="button" class="ct-qty-preset btn-press ${active === p ? 'ct-qty-preset--active' : ''}" data-qty-preset="${escAttr(p)}">${p}</button>
          `).join('')}
        </div>
      </div>
    `,
    foot: renderModalCloseBtn('Закрыть'),
  });
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

function renderDiscountModal() {
  const value = state.modalData.value || String(state.receiptDiscountPct || '');
  return renderModalShell({
    title: 'Скидка %',
    widthClass: 'ct-modal--shell-medium',
    head: `<input class="ct-modal-shell-input" data-discount-value value="${escAttr(value)}" readonly />`,
    body: renderModalNumpad(value, { showDot: false, enterLabel: 'OK' }),
    foot: renderModalCloseBtn('Закрыть'),
  });
}

function renderPaymentsLogModal() {
  const rows = state.paymentsLog;
  return renderModalShell({
    title: 'Платежи',
    widthClass: 'ct-modal--shell-medium',
    body: `
      <div class="ct-payments-log">
        ${rows.length ? rows.map(p => `
          <div class="ct-payment-log-row">
            <span>${esc(p.method)}</span>
            <span>${formatMoney(p.amount)} Р</span>
          </div>
        `).join('') : '<p class="ct-empty-hint">Внесённых платежей пока нет</p>'}
      </div>
    `,
    foot: renderModalCloseBtn('Закрыть'),
  });
}

/** @param {HTMLElement} layer */
function bindModalHandlers(layer) {
  layer.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => {
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
    state.pendingProduct = null;
    state.modal = 'error';
    state.modalData = { message: 'Ошибка проверки марки в системе Честный Знак' };
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
    completePayment();
  });

  function completePayment() {
    const total = getTotal();
    const methods = resolvePosPaymentMethodButtons(state.channel, state.paymentMethods);
    const selected = methods.find(m => m.id === state.modalData.selectedPaymentMethodId) || methods[0];
    state.paymentsLog.push({
      method: selected?.name || 'Оплата',
      methodId: selected?.id,
      amount: total,
      at: new Date(),
    });
    void finalizePosOrderOnPayment().then(() => {
      state.receiptLines = [];
      state.guest = null;
      state.receiptDiscountPct = 0;
      state.receivedAmount = 0;
      state.modal = null;
      state.modalData = {};
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  }

  function selectGuestById(guestId) {
    const user = (state.crmClients || []).find(c => c.id === guestId);
    if (!user) return;
    state.guest = crmUserToGuest(user, state.crmGroupsById || {});
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  }

  layer.querySelectorAll('[data-guest-id]').forEach(btn => {
    btn.addEventListener('click', () => selectGuestById(btn.dataset.guestId));
  });

  layer.querySelector('[data-guest-search]')?.addEventListener('input', e => {
    state.modalData.search = e.target.value;
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="clear-guest-modal"]')?.addEventListener('click', () => {
    state.guest = null;
    state.modal = null;
    state.modalData = {};
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelector('[data-action="change-guest-modal"]')?.addEventListener('click', () => {
    state.modal = 'customer_search';
    state.modalData = { search: '', selectedId: state.guest?.id };
    window.dispatchEvent(new CustomEvent('ct:rerender'));
  });

  layer.querySelectorAll('[data-price-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.priceCategory = btn.dataset.priceCategory;
      state.modal = null;
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  });

  const qtyInput = layer.querySelector('[data-qty-value]');
  const numpad = layer.querySelector('.ct-numpad');
  if (numpad && qtyInput) {
    bindNumpad(numpad, {
      onChange: (val) => {
        state.modalData.value = val;
        qtyInput.value = val;
      },
      onEnter: () => {
        const qty = parseFloat((state.modalData.value || '1').replace(',', '.'));
        applyQuantityToSelection(Number.isFinite(qty) ? qty : 1);
        state.modal = null;
        state.modalData = {};
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
      onCancel: () => {
        state.modal = null;
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
    });
    layer.querySelectorAll('[data-qty-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.modalData.preset = btn.dataset.qtyPreset;
        state.modalData.value = btn.dataset.qtyPreset;
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      });
    });
  }

  const discountNumpad = layer.querySelector('.ct-modal--shell .ct-numpad');
  if (discountNumpad && state.modal === 'discount') {
    const input = layer.querySelector('[data-discount-value]');
    bindNumpad(discountNumpad, {
      onChange: (val) => {
        state.modalData.value = val;
        if (input) input.value = val;
      },
      onEnter: () => {
        const pct = parseFloat(state.modalData.value || '0');
        state.receiptDiscountPct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
        state.modal = null;
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
      onCancel: () => {
        state.modal = null;
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
    });
  }

  layer.querySelectorAll('[data-pay-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.modalData.selectedPaymentMethodId = btn.dataset.payMethod;
      window.dispatchEvent(new CustomEvent('ct:rerender'));
    });
  });

  const paymentNumpad = layer.querySelector('.ct-modal--payment .ct-numpad');
  const paymentAmount = layer.querySelector('[data-payment-amount]');
  if (paymentNumpad && paymentAmount) {
    bindNumpad(paymentNumpad, {
      onChange: (val) => {
        state.modalData.received = val;
        paymentAmount.value = val;
        const total = getTotal();
        const change = Math.max(0, parseFloat(val.replace(',', '.')) - total);
        const changeEl = layer.querySelector('[data-payment-change]');
        const changeWidget = layer.querySelector('[data-payment-change-widget]');
        if (changeEl) changeEl.textContent = `${formatMoney(change)} ₽`;
        if (changeWidget) changeWidget.classList.toggle('ct-payment-change-widget--due', change > 0);
      },
      onEnter: () => completePayment(),
      onCancel: () => {
        state.modal = null;
        window.dispatchEvent(new CustomEvent('ct:rerender'));
      },
    });
  }
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
