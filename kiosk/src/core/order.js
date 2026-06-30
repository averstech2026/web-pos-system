import { state } from './state.js';
import { DEMO_CUSTOMER } from '../data/constants.js';
import { formatPrice } from './format.js';
import {
  getCartCount,
  getCartTotal,
  updateCartBadge,
} from './cart.js';
import {
  navigateTo,
  showModal,
  hideModal,
} from './navigation.js';
import { renderMenu } from '../ui/menu.js';
import { renderSearchResults } from '../ui/search.js';
import { renderVoiceResults, closeVoiceSearch } from '../ui/voice.js';
import { renderCart } from '../ui/cartView.js';
import { resetReceiptSettings } from '../ui/payment.js';
import { updateCustomerStatus } from '../ui/customer.js';
import { completeKioskPayment } from '../services/order-service.js';

let paying = false;

function setTerminalPayBusy(busy) {
  const modal = document.getElementById('modal-terminal-pay');
  if (!modal) return;
  modal.querySelectorAll('[data-action="confirm-terminal-pay"], [data-action="cancel-terminal-pay"]').forEach(btn => {
    btn.disabled = busy;
    btn.classList.toggle('opacity-50', busy);
  });
  const okBtn = modal.querySelector('[data-action="confirm-terminal-pay"]');
  if (okBtn) {
    okBtn.dataset.defaultLabel = okBtn.dataset.defaultLabel || okBtn.textContent.trim();
    okBtn.textContent = busy ? 'Обработка…' : okBtn.dataset.defaultLabel;
  }
}

function setTerminalPayError(message = '') {
  const errorEl = document.getElementById('terminal-pay-error');
  if (!errorEl) return;
  if (!message) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function tryPay() {
  if (getCartCount() === 0) return;
  if (!state.upsellShown) {
    showModal('modal-upsell');
  } else {
    navigateTo('payment');
  }
}

function proceedToPayment(withUpsell) {
  hideModal('modal-upsell');
  state.upsellShown = true;
  state.upsellAdded = withUpsell;
  navigateTo('payment');
}

function clearCart() {
  state.cart = {};
  state.upsellAdded = false;
  state.upsellShown = false;
  updateCartBadge();
  renderCart();
  if (state.screen === 'menu') renderMenu();
  if (state.screen === 'search') renderSearchResults();
  if (state.screen === 'voice') renderVoiceResults();
}

function resetOrder() {
  state.cart = {};
  state.upsellAdded = false;
  state.upsellShown = false;
  state.currentProduct = null;
  state.customer = null;
  state.pendingSubsidyPay = false;
  paying = false;
  updateCartBadge();
  updateCustomerStatus();
  hideModal('modal-upsell');
  hideModal('modal-customer-card');
  hideModal('modal-terminal-pay');
  hideModal('modal-voice-choice');
  closeVoiceSearch();
  resetReceiptSettings();
  navigateTo('start');
}

function applyCustomer() {
  state.customer = { ...DEMO_CUSTOMER };
  hideModal('modal-customer-card');
  updateCustomerStatus();
  if (state.pendingSubsidyPay) {
    completeSubsidyPayment();
  }
}

function removeCustomer() {
  state.customer = null;
  updateCustomerStatus();
}

async function completeSubsidyPayment() {
  if (paying) return;
  paying = true;
  state.pendingSubsidyPay = false;
  try {
    await completeKioskPayment(true);
    navigateTo('pay-success');
  } catch (err) {
    console.error('[kiosk] subsidy payment', err);
    alert(formatPaymentError(err));
  } finally {
    paying = false;
  }
}

function startSubsidyPayment() {
  if (state.customer) {
    completeSubsidyPayment();
    return;
  }
  state.pendingSubsidyPay = true;
  showModal('modal-customer-card');
}

function cancelCustomerCard() {
  hideModal('modal-customer-card');
  state.pendingSubsidyPay = false;
}

function formatPaymentError(err) {
  const code = err?.code || '';
  const message = err?.message || '';
  if (code === 'permission-denied') {
    return 'Нет доступа для проведения оплаты. Обновите страницу или выполните seedStaffAuth() в консоли.';
  }
  if (code === 'resource-exhausted' || /quota/i.test(message)) {
    return 'Превышен лимит запросов Firebase. Подождите немного и попробуйте снова.';
  }
  return message || 'Не удалось провести оплату';
}

function startPayment() {
  const totalEl = document.getElementById('terminal-pay-total');
  if (totalEl) totalEl.textContent = formatPrice(getCartTotal());
  setTerminalPayError('');
  setTerminalPayBusy(false);
  showModal('modal-terminal-pay');
}

async function confirmTerminalPay() {
  if (paying) return;
  paying = true;
  setTerminalPayError('');
  setTerminalPayBusy(true);
  try {
    await completeKioskPayment(false);
    hideModal('modal-terminal-pay');
    navigateTo('pay-success');
  } catch (err) {
    console.error('[kiosk] card payment', err);
    setTerminalPayError(formatPaymentError(err));
  } finally {
    paying = false;
    setTerminalPayBusy(false);
  }
}

function cancelTerminalPay() {
  if (paying) return;
  setTerminalPayError('');
  hideModal('modal-terminal-pay');
}

function submitRating() {
  resetOrder();
}

export {
  tryPay,
  proceedToPayment,
  clearCart,
  resetOrder,
  applyCustomer,
  removeCustomer,
  completeSubsidyPayment,
  startSubsidyPayment,
  cancelCustomerCard,
  startPayment,
  confirmTerminalPay,
  cancelTerminalPay,
  submitRating,
};
