// ─── Состояние приложения ──────────────────────────────────────
const state = {
  screen: 'start',
  activeCategory: null,
  menuView: 'scroll',
  cart: {},          // { productId: quantity }
  currentProduct: null,
  upsellAdded: false,
  upsellShown: false,
  customer: null,    // { name, balance, email } или null
  pendingSubsidyPay: false,
  printReceipt: true,
  emailReceipt: false,
  receiptEmail: null,
  searchQuery: '',
  voiceTranscript: '',
  voiceList: {},
  voiceListOrder: [],
  voiceChoice: null,
  voiceListening: false,
  voiceStatus: 'idle', // idle | listening | processing | error
};

export { state };
