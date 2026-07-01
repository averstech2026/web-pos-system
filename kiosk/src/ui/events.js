import { state } from '../core/state.js';
import { navigateTo, showModal } from '../core/navigation.js';
import {
  getCartCount,
  addToCart,
  setCartQty,
} from '../core/cart.js';
import {
  openSearch,
  appendSearchChar,
  backspaceSearch,
  clearSearchQuery,
} from './search.js';
import {
  openVoiceSearch,
  toggleVoiceListening,
  applyVoiceToSearch,
  clearVoiceList,
  setVoiceQty,
  pickVoiceChoiceProduct,
  dismissVoiceChoice,
} from './voice.js';
import {
  filterToCategory,
  showAllCategories,
  setMenuView,
  scrollMenuRow,
  scrollToCategory,
} from './menu.js';
import { openProduct } from './product.js';
import { tryAddProductToCart, tryOpenProduct } from './composite-lunch.js';
import {
  tryPay,
  proceedToPayment,
  clearCart,
  resetOrder,
  applyCustomer,
  removeCustomer,
  startSubsidyPayment,
  cancelCustomerCard,
  startPayment,
  confirmTerminalPay,
  cancelTerminalPay,
  submitRating,
} from '../core/order.js';
import {
  togglePrintReceipt,
  confirmReceiptCustomer,
  confirmReceiptEmail,
  cancelReceiptEmail,
  appendReceiptEmailChar,
  backspaceReceiptEmail,
} from './payment.js';
import { openKioskBannerModal, closeKioskBannerModal } from './marketing.js';

// ─── Делегирование кликов ──────────────────────────────────────
export function bindKioskEvents() {
  document.getElementById('kiosk').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const productId = btn.dataset.product;
  const categoryId = btn.dataset.category;

  switch (action) {
    case 'go-menu':
      if (state.screen === 'start') state.activeCategory = null;
      navigateTo('menu');
      break;
    case 'open-search':
      openSearch();
      break;
    case 'open-voice-search':
      openVoiceSearch();
      break;
    case 'voice-toggle-listen':
      toggleVoiceListening();
      break;
    case 'voice-apply-search':
      applyVoiceToSearch();
      break;
    case 'voice-clear-all':
      clearVoiceList();
      break;
    case 'voice-inc':
      setVoiceQty(productId, (state.voiceList[productId] || 0) + 1);
      break;
    case 'voice-dec':
      setVoiceQty(productId, (state.voiceList[productId] || 0) - 1);
      break;
    case 'voice-choice-add':
      pickVoiceChoiceProduct(productId);
      break;
    case 'voice-choice-dismiss':
      dismissVoiceChoice(true);
      break;
    case 'search-key':
      appendSearchChar(btn.dataset.key || '');
      break;
    case 'search-backspace':
      backspaceSearch();
      break;
    case 'search-clear-query':
      clearSearchQuery();
      break;
    case 'search-esc':
      navigateTo('menu');
      break;
    case 'search-enter':
      break;
    case 'go-cart':
      if (getCartCount() > 0) navigateTo('cart');
      break;
    case 'go-menu-category':
      navigateTo('menu');
      setTimeout(() => {
        if (state.menuView === 'browse') filterToCategory(categoryId);
        else scrollToCategory(categoryId);
      }, 100);
      break;
    case 'select-category':
      if (state.menuView === 'browse') filterToCategory(categoryId);
      else scrollToCategory(categoryId);
      break;
    case 'menu-back-all':
      showAllCategories();
      break;
    case 'set-menu-view':
      setMenuView(btn.dataset.view);
      break;
    case 'scroll-row':
      scrollMenuRow(btn.dataset.row, parseInt(btn.dataset.dir, 10) || 1);
      break;
    case 'open-product':
      if (!tryOpenProduct(productId)) openProduct(productId);
      break;
    case 'add-to-cart':
      tryAddProductToCart(productId);
      break;
    case 'inc-cart':
      setCartQty(productId, (state.cart[productId] || 0) + 1);
      break;
    case 'dec-cart':
      setCartQty(productId, (state.cart[productId] || 0) - 1);
      break;
    case 'try-pay':
      tryPay();
      break;
    case 'upsell-add':
      proceedToPayment(true);
      break;
    case 'upsell-skip':
      proceedToPayment(false);
      break;
    case 'pay-subsidy':
      startSubsidyPayment();
      break;
    case 'pay-bank':
      startPayment();
      break;
    case 'confirm-terminal-pay':
      confirmTerminalPay();
      break;
    case 'cancel-terminal-pay':
      cancelTerminalPay();
      break;
    case 'pay-success-done':
      navigateTo('rating');
      break;
    case 'submit-rating':
      submitRating();
      break;
    case 'open-customer-card':
      showModal('modal-customer-card');
      break;
    case 'apply-customer':
      applyCustomer();
      break;
    case 'cancel-customer-card':
      cancelCustomerCard();
      break;
    case 'remove-customer':
      removeCustomer();
      break;
    case 'toggle-print-receipt':
      togglePrintReceipt();
      break;
    case 'confirm-receipt-customer':
      confirmReceiptCustomer();
      break;
    case 'confirm-receipt-email':
      confirmReceiptEmail();
      break;
    case 'cancel-receipt-email':
      cancelReceiptEmail();
      break;
    case 'email-key':
      appendReceiptEmailChar(btn.dataset.key || '');
      break;
    case 'email-backspace':
      backspaceReceiptEmail();
      break;
    case 'clear-cart':
      clearCart();
      break;
    case 'cancel-order':
      resetOrder();
      break;
    case 'open-kiosk-banner':
      openKioskBannerModal(btn.dataset.bannerId);
      break;
    case 'close-kiosk-banner':
      closeKioskBannerModal();
      break;
    case 'finish-order':
      resetOrder();
      break;
  }
  });
}
