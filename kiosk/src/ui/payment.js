import { state } from '../core/state.js';
import { DEMO_CUSTOMER, EMAIL_KEYBOARD_ROWS } from '../data/constants.js';
import { formatPrice } from '../core/format.js';
import { getSubtotal, getCartTotal } from '../core/cart.js';
import { showModal, hideModal } from '../core/navigation.js';

// ─── Рендер оплаты ─────────────────────────────────────────────
function renderPayment() {
  document.getElementById('pay-subtotal').textContent = formatPrice(getSubtotal());
  document.getElementById('pay-total').textContent = formatPrice(getCartTotal());
  const upsellRow = document.getElementById('pay-upsell-row');
  if (state.upsellAdded) {
    upsellRow.classList.remove('hidden');
    upsellRow.classList.add('flex');
  } else {
    upsellRow.classList.add('hidden');
    upsellRow.classList.remove('flex');
  }
  setPrintReceipt(state.printReceipt);
}

function maskEmail(email) {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.');
  if (dot <= 0) return `***${local.slice(-4)}@**${domain}`;
  const domainName = domain.slice(0, dot);
  const tld = domain.slice(dot);
  const maskedLocal = `***${local.slice(-Math.min(4, local.length))}`;
  const maskedDomain = `**${domainName.slice(2)}${tld}`;
  return `${maskedLocal}@${maskedDomain}`;
}

function updatePrintReceiptUI() {
  const indicator = document.getElementById('print-receipt-indicator');
  if (!indicator) return;
  if (state.printReceipt) {
    indicator.textContent = '✓';
    indicator.classList.add('bg-navy', 'text-white');
    indicator.classList.remove('bg-white', 'text-transparent');
  } else {
    indicator.textContent = '';
    indicator.classList.remove('bg-navy', 'text-white');
    indicator.classList.add('bg-white', 'text-transparent');
  }
}

function setPrintReceipt(checked) {
  state.printReceipt = checked;
  if (checked) {
    state.emailReceipt = false;
    state.receiptEmail = null;
  }
  updatePrintReceiptUI();
}

function togglePrintReceipt() {
  if (state.printReceipt) {
    state.printReceipt = false;
    updatePrintReceiptUI();
    if (state.customer) {
      openCustomerReceiptModal();
    } else {
      openGuestReceiptModal();
    }
  } else {
    setPrintReceipt(true);
  }
}

function getReceiptEmailInput() {
  return document.getElementById('receipt-email-input');
}

function renderEmailKeyboard() {
  const kb = document.getElementById('email-keyboard');
  if (!kb) return;
  const rows = EMAIL_KEYBOARD_ROWS.map(row => `
    <div class="flex flex-wrap gap-2 justify-center">
      ${row.map(key => `
        <button type="button" data-action="email-key" data-key="${key}"
                class="btn-press email-key">${key}</button>`).join('')}
    </div>`).join('');
  kb.innerHTML = rows + `
    <div class="flex flex-wrap gap-2 justify-center">
      <button type="button" data-action="email-backspace"
              class="btn-press email-key email-key-wide">⌫ Стереть</button>
    </div>`;
}

function openGuestReceiptModal() {
  const input = getReceiptEmailInput();
  if (input) input.textContent = state.receiptEmail || '';
  showModal('modal-receipt-email');
}

function openCustomerReceiptModal() {
  const email = state.customer?.email || DEMO_CUSTOMER.email;
  document.getElementById('receipt-customer-email').textContent = maskEmail(email);
  showModal('modal-receipt-customer');
}

function appendReceiptEmailChar(ch) {
  const input = getReceiptEmailInput();
  if (!input) return;
  input.textContent = (input.textContent || '') + ch;
}

function backspaceReceiptEmail() {
  const input = getReceiptEmailInput();
  if (!input) return;
  input.textContent = (input.textContent || '').slice(0, -1);
}

function confirmReceiptCustomer() {
  state.emailReceipt = true;
  hideModal('modal-receipt-customer');
}

function confirmReceiptEmail() {
  const email = (getReceiptEmailInput()?.textContent || '').trim();
  if (!email.includes('@') || email.indexOf('@') === 0 || !email.includes('.')) return;
  state.receiptEmail = email;
  state.emailReceipt = true;
  hideModal('modal-receipt-email');
}

function cancelReceiptEmail() {
  hideModal('modal-receipt-email');
  setPrintReceipt(true);
}

function resetReceiptSettings() {
  state.printReceipt = true;
  state.emailReceipt = false;
  state.receiptEmail = null;
  setPrintReceipt(true);
  hideModal('modal-receipt-customer');
  hideModal('modal-receipt-email');
}

export {
  renderPayment,
  maskEmail,
  updatePrintReceiptUI,
  setPrintReceipt,
  togglePrintReceipt,
  getReceiptEmailInput,
  renderEmailKeyboard,
  openGuestReceiptModal,
  openCustomerReceiptModal,
  appendReceiptEmailChar,
  backspaceReceiptEmail,
  confirmReceiptCustomer,
  confirmReceiptEmail,
  cancelReceiptEmail,
  resetReceiptSettings,
};
