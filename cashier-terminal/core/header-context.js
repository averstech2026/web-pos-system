import {
  DEFAULT_POS_POINT_NAME,
  DEFAULT_POS_STATION_NAME,
} from '../../shared/pos-channel.js';
import { formatOrderCreated } from './format.js';
import { state } from './state.js';

/** @returns {{ stationName: string, pointName: string, orderNumber: string, createdAtLabel: string, cashierLogin: string }} */
export function getPosHeaderContext() {
  const channel = state.channel || {};
  const stationName = channel.stationName || DEFAULT_POS_STATION_NAME;
  const pointName = channel.pointName || DEFAULT_POS_POINT_NAME;
  const orderNumber = state.currentOrder?.orderNumber || '—';
  const createdAtLabel = formatOrderCreated(state.currentOrder?.createdAt);
  const cashierLogin = state.cashier?.login || state.cashier?.name || '—';

  return {
    stationName,
    pointName,
    orderNumber,
    createdAtLabel,
    cashierLogin,
  };
}
