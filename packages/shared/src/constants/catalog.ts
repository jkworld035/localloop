/** Mirrors public.product_unit. */
export const PRODUCT_UNITS = ['piece', 'kg', 'g', 'l', 'ml', 'packet', 'box', 'dozen'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** i18n keys live under `units.<unit>` in each locale file. */
export const UNIT_SHORT_LABEL: Record<ProductUnit, string> = {
  piece: 'pc',
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  packet: 'pkt',
  box: 'box',
  dozen: 'dz',
};

export const VEHICLE_TYPES = ['bicycle', 'scooter', 'motorcycle', 'car'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Vehicles that legally need a driving licence and registration number in India. */
export const MOTORISED_VEHICLES: readonly VehicleType[] = ['scooter', 'motorcycle', 'car'];

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const APP_ROLES = ['customer', 'vendor', 'delivery_partner', 'admin'] as const;
export type AppRole = (typeof APP_ROLES)[number];
/** Roles a user may choose for themselves. Admin is granted only by an existing super admin. */
export const SELF_SELECTABLE_ROLES = ['customer', 'vendor', 'delivery_partner'] as const;
export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

export const VENDOR_DOCUMENT_TYPES = [
  'gst_certificate',
  'trade_licence',
  'fssai_licence',
  'shop_establishment',
  'pan_card',
  'udyam_certificate',
  'other',
] as const;
export type VendorDocumentType = (typeof VENDOR_DOCUMENT_TYPES)[number];

export const PARTNER_DOCUMENT_TYPES = ['driving_licence', 'vehicle_rc', 'id_proof', 'profile_photo'] as const;
export type PartnerDocumentType = (typeof PARTNER_DOCUMENT_TYPES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
