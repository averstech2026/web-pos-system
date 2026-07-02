import { normalizeSalesChannel, SALES_CHANNEL_IDS, SALES_CHANNEL_STATUS } from '../../shared/sales-channels.js';
import {
  POS_CATALOG_DISPLAY,
  DEFAULT_POS_POINT_NAME,
  DEFAULT_POS_STATION_NAME,
} from '../../shared/pos-channel.js';

const DEMO_MODE_KEY = 'ct-demo-mode';

/** @returns {boolean} */
export function isDemoModeActive() {
  if (!import.meta.env.DEV) return false;
  if (new URLSearchParams(window.location.search).get('demo') === '1') return true;
  return sessionStorage.getItem(DEMO_MODE_KEY) === '1';
}

export function enableDemoMode() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(DEMO_MODE_KEY, '1');
}

export function disableDemoMode() {
  sessionStorage.removeItem(DEMO_MODE_KEY);
}

/** @returns {import('../../shared/sales-channels.js').SalesChannel} */
export function getDemoChannel() {
  return normalizeSalesChannel({
    id: SALES_CHANNEL_IDS.POS,
    status: SALES_CHANNEL_STATUS.ACTIVE,
    operationMode: 'cashier',
    screenFormat: '1024x768',
    catalogDisplay: POS_CATALOG_DISPLAY.FOLDERS,
    showProductPhotos: false,
    showQueueNumber: false,
    posPaymentTypes: ['cash', 'card', 'internal', 'dotation'],
    allowedPaymentMethods: ['cash', 'card', 'internal', 'dotation'],
    stationName: DEFAULT_POS_STATION_NAME,
    pointName: DEFAULT_POS_POINT_NAME,
  }, SALES_CHANNEL_IDS.POS);
}

/** @returns {{ items: object[], categoryGroups: object[] }} */
export function getDemoCatalog() {
  const categoryGroups = [
    { name: 'Вторые блюда', color: '#6BA3C7', visibleInPos: true, posOrder: 1 },
    { name: 'Выпечка', color: '#E8D4B8', visibleInPos: true, posOrder: 2 },
    { name: 'Салаты', color: '#A8D5BA', visibleInPos: true, posOrder: 3 },
    { name: 'Напитки', color: '#C5D8E8', visibleInPos: true, posOrder: 4 },
  ];

  const items = [
    {
      id: 'demo-vareniki',
      name: 'Вареники с мясом и капустой, 5 шт, 250гр.',
      price: 150,
      category: 'Вторые блюда',
      tileColor: '#6BA3C7',
      visibleInPos: true,
    },
    {
      id: 'demo-bun',
      name: 'Булочка ванильная',
      price: 150,
      category: 'Выпечка',
      tileColor: '#E8D4B8',
      visibleInPos: true,
    },
    {
      id: 'demo-water-hz',
      name: 'Вода Aqua Minerale 1л',
      price: 89,
      category: 'Напитки',
      tileColor: '#C5D8E8',
      honestSignMarked: true,
      honestSignCategory: 'water',
      visibleInPos: true,
    },
    {
      id: 'demo-salad',
      name: 'Салат овощной',
      price: 120,
      category: 'Салаты',
      tileColor: '#A8D5BA',
      visibleInPos: true,
    },
  ];

  return { items, categoryGroups };
}
