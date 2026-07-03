import { DEMO_SERVICE_MESSAGES } from '../services/service-messages.js';

/** @typedef {{ id: string, productId: string, name: string, price: number, quantity: number, priceCategory: string, discountPct: number, honestSignCode?: string, honestSignMarked?: boolean, kitchenStatus: string, lunchSelections?: import('../../shared/composite-order-display.js').LunchSelection[] }} ReceiptLine */

/** @type {{
 *   screen: string,
 *   authMode: 'pin'|'card',
 *   pinInput: string,
 *   cashier: object|null,
 *   channel: object|null,
 *   items: object[],
 *   categoryGroups: object[],
 *   catalogById: Map<string, object>,
 *   receiptLines: ReceiptLine[],
 *   selectedLineIds: Set<string>,
 *   selectedLineId: string|null,
 *   multiSelectMode: boolean,
 *   guest: object|null,
 *   priceCategory: string,
 *   receiptDiscountPct: number,
 *   receivedAmount: number,
 *   catalogPath: string[],
 *   catalogView: 'categories'|'products'|'favorites'|'search'|'preview',
 *   searchQuery: string,
 *   catalogKeyboardOpen: boolean,
 *   catalogKeyboardLayout: 'jcuken'|'qwerty'|'numbers',
 *   favorites: string[],
 *   gridScrollPage: number,
 *   pendingProduct: object|null,
 *   modal: string|null,
 *   modalData: object,
 *   serviceMessages: { id: string, type: 'critical'|'warning'|'info', text: string, unread: boolean }[],
 *   paymentsLog: object[],
 *   currentOrder: { id: string, orderNumber: string, createdAt: Date }|null,
 *   savedCart: object|null,
 * }} */
export const state = {
  screen: 'auth',
  authMode: 'pin',
  pinInput: '',
  cashier: null,
  channel: null,
  items: [],
  categoryGroups: [],
  catalogById: new Map(),
  receiptLines: [],
  selectedLineIds: new Set(),
  selectedLineId: null,
  multiSelectMode: false,
  guest: null,
  priceCategory: 'main',
  receiptDiscountPct: 0,
  receivedAmount: 0,
  catalogPath: [],
  catalogView: 'categories',
  searchQuery: '',
  catalogKeyboardOpen: true,
  catalogKeyboardLayout: 'jcuken',
  favorites: ['demo-bun'],
  gridScrollPage: 0,
  pendingProduct: null,
  modal: null,
  modalData: {},
  serviceMessages: DEMO_SERVICE_MESSAGES.map(m => ({ ...m })),
  paymentsLog: [],
  currentOrder: null,
  savedCart: null,
  designPreview: false,
  crmClients: [],
  crmGroupsById: {},
  paymentMethods: [],
  discountSettings: null,
};

export function resetReceipt() {
  state.receiptLines = [];
  state.selectedLineIds = new Set();
  state.selectedLineId = null;
  state.multiSelectMode = false;
  state.receiptDiscountPct = 0;
  state.receivedAmount = 0;
  state.designPreview = false;
}

export function getSubtotal() {
  return state.receiptLines.reduce((sum, line) => {
    const lineTotal = line.price * line.quantity * (1 - (line.discountPct || 0) / 100);
    return sum + lineTotal;
  }, 0);
}

export function getDiscountAmount() {
  const subtotal = getSubtotal();
  return subtotal * (state.receiptDiscountPct / 100);
}

export function getTotal() {
  return Math.max(0, getSubtotal() - getDiscountAmount());
}

export function getReceivedTotal() {
  return state.paymentsLog.reduce((s, p) => s + p.amount, 0);
}

/** Sum still due on the current receipt after recorded payments. */
export function getPaymentRemaining() {
  const remaining = getTotal() - getReceivedTotal();
  return Math.max(0, Math.round(remaining * 100) / 100);
}

export function nextLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
