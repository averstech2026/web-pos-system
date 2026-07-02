import { state, nextLineId } from './state.js';

export const DEMO_GUEST = {
  id: 'demo-vld-petrov',
  card: '048292',
  name: 'Петров',
  fullName: 'Петров Алексей Иванович',
  balance: 3200,
  limit: 150,
  group: 'Офис Ромашка',
  phone: '+7 (916) 123-45-67',
  email: 'petrov@example.ru',
  wallets: [
    { id: 'personal', name: 'Личные средства', balance: 3050 },
    { id: 'dotation', name: 'Субсидия', balance: 150 },
  ],
};

/** Reference totals from 4_2.png */
export const DEMO_TOTALS = {
  received: 11,
  discount: 55,
  subtotal: 2765,
  total: 2710,
};

const DEMO_ITEM_NAME = 'Вареники с мясом и капустой, 5 шт, 250гр.';

/** @type {Array<{ id: string, name: string, price: number, color: string }>} */
export const PREVIEW_CATALOG_TILES = Array.from({ length: 24 }, (_, i) => {
  let color = '#c5ced6';
  if (i >= 8 && i < 16) color = '#8fa3b3';
  if (i >= 16) color = '#a8c5b8';
  return {
    id: `preview-bun-${i}`,
    name: 'Булочка ванильная',
    price: 150,
    color,
  };
});

/** @returns {boolean} Dev-only UI mock from reference screens (?preview=1). */
export function isDesignPreviewActive() {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
}

/** Seed receipt, guest and catalog preview for design verification (?preview=1). */
export function ensureDesignPreview() {
  if (!isDesignPreviewActive()) return;
  if (state.receiptLines.length > 0) return;

  const lineIds = Array.from({ length: 8 }, () => nextLineId());
  state.receiptLines = lineIds.map((id, i) => ({
    id,
    productId: 'demo-vareniki',
    name: i === lineIds.length - 1 ? 'Каша гречневая' : DEMO_ITEM_NAME,
    price: i === lineIds.length - 1 ? 85 : 150,
    quantity: 2,
    priceCategory: 'main',
    discountPct: 0,
    kitchenStatus: 'Кухня',
  }));

  state.selectedLineId = lineIds[lineIds.length - 1];
  state.guest = { ...DEMO_GUEST };
  state.currentOrder = {
    id: 'demo-preview-order',
    orderNumber: '396017',
    createdAt: new Date(),
  };
  state.receivedAmount = DEMO_TOTALS.received;
  state.catalogView = 'preview';
  state.designPreview = true;
}

/** @returns {typeof DEMO_TOTALS} */
export function resolveDisplayTotals() {
  if (state.designPreview && state.receiptLines.length) {
    return { ...DEMO_TOTALS };
  }
  return null;
}
