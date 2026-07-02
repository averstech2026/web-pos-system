export type SalesChannelStatus = 'active' | 'hidden';

export type PosOperationMode = 'cashier' | 'sco';
export type PosScreenFormat = '1024x768' | '1920x1080';
export type PosCatalogDisplay = 'folders' | 'flat';

export interface SalesChannel {
  id: string;
  name: string;
  shortName: string;
  status: SalesChannelStatus;
  sendToKitchen: boolean;
  sendToDelivery: boolean;
  scheduleId: string | null;
  maintenanceMessage: string;
  /** Payment method ids from payment_methods catalog; sales channels only */
  allowedPaymentMethods: string[];
  /** POS channel only */
  operationMode?: PosOperationMode;
  screenFormat?: PosScreenFormat;
  catalogDisplay?: PosCatalogDisplay;
  showProductPhotos?: boolean;
  showQueueNumber?: boolean;
  posPaymentTypes?: string[];
  stationName?: string;
  pointName?: string;
}
