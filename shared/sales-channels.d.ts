export type SalesChannelStatus = 'active' | 'hidden';

export interface SalesChannel {
  id: string;
  name: string;
  shortName: string;
  status: SalesChannelStatus;
  sendToKitchen: boolean;
  sendToDelivery: boolean;
  scheduleId: string | null;
  maintenanceMessage: string;
}
