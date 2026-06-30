import type { AvailabilityRuleDoc } from './availability-rules.js';

/** Visual format drives placement and image fields */
export type MarketingBannerFormat = 'square' | 'wide';

/** Where the banner appears in the personal account UI */
export type MarketingBannerPlacement =
  | 'story'
  | 'hero'
  | 'card'
  | 'promo_horizontal'
  | 'both';

/** Device surfaces for banner delivery */
export type MarketingDeviceTarget = 'lk' | 'kiosk';

/** Location targeting mode — uses availability_rule IDs as dining locations */
export type MarketingLocationMode = 'all' | 'specific';

/** Audience targeting mode — uses user_groups collection IDs */
export type MarketingAudienceMode = 'all' | 'groups';

/** Tap / click behaviour on the client */
export type MarketingClickAction = 'fullscreen_image' | 'url';

/**
 * Marketing banner document (collection: marketing_banners).
 * `scheduleId` references an existing {@link AvailabilityRuleDoc} for time windows.
 */
export interface MarketingBanner {
  id: string;
  /** square = Stories carousel; wide = hero or horizontal promo */
  bannerFormat: MarketingBannerFormat;
  title: string;
  shortDescription: string;
  fullDescription: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  isActive: boolean;
  placement: MarketingBannerPlacement;
  /** @deprecated Derived from visibleInWeb / visibleInKiosk — kept for backward compatibility */
  targetDevices: MarketingDeviceTarget[];
  /** Show in web personal account (default true) */
  visibleInWeb: boolean;
  /** Show on self-service kiosk */
  visibleInKiosk: boolean;
  locationMode: MarketingLocationMode;
  locationIds: string[];
  audienceMode: MarketingAudienceMode;
  targetUserGroupIds: string[];
  scheduleId: string | null;
  campaignDateStart: string | null;
  campaignDateEnd: string | null;
  /** Carousel index for square stories (1, 2, 3…) */
  sortOrder: number;
  accentColor: string | null;
  backgroundColor: string | null;
  badgeText: string | null;
  clickAction: MarketingClickAction;
  clickUrl: string | null;
  /** Full-screen modal image when clickAction is fullscreen_image */
  fullscreenImageUrl: string | null;
}

export interface MarketingBannerFilterContext {
  userGroupId?: string | null;
  currentLocationId?: string;
  allRules?: Partial<AvailabilityRuleDoc>[];
  slot?: { date?: string; time?: string };
  device?: MarketingDeviceTarget;
}
