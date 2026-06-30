import { state } from './state.js';
import { stopVoiceRecognition } from './voiceSession.js';
import { renderCart } from '../ui/cartView.js';
import { renderPayment } from '../ui/payment.js';
import { renderMenu } from '../ui/menu.js';
import { renderSearch } from '../ui/search.js';
import { renderVoice } from '../ui/voice.js';
import { updateCustomerStatus } from '../ui/customer.js';

// ─── Навигация ─────────────────────────────────────────────────
const SCREENS = ['start', 'menu', 'search', 'voice', 'product', 'cart', 'payment', 'pay-success', 'rating'];

function isVoiceScreenActive() {
  return state.screen === 'voice';
}

function navigateTo(screen) {
  if (state.screen === 'voice' && screen !== 'voice') {
    stopVoiceRecognition();
    hideModal('modal-voice-choice');
    state.voiceChoice = null;
  }
  state.screen = screen;
  SCREENS.forEach(s => {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === screen);
  });
  if (screen === 'cart') renderCart();
  if (screen === 'payment') renderPayment();
  if (screen === 'menu') renderMenu();
  if (screen === 'search') renderSearch();
  if (screen === 'voice') renderVoice();
  updateCustomerStatus();
}

function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = 'flex';
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = 'none';
}

export {
  SCREENS,
  isVoiceScreenActive,
  navigateTo,
  showModal,
  hideModal,
};
