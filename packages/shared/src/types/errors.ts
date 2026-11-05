/**
 * Business error codes raised by database functions (SQLSTATE P0001, message
 * = code). Apps translate `errors.<code>`; unknown codes fall back to
 * `errors.generic`. Keep in sync with the RAISE statements in the migrations.
 */
export const ERROR_CODES = [
  'not_authenticated', 'account_inactive', 'wrong_role', 'forbidden', 'invalid_coordinates',
  'role_not_allowed', 'role_already_set', 'invalid_category', 'vendor_locked', 'partner_locked',
  'query_too_short', 'cart_empty', 'address_not_found', 'store_unavailable', 'store_paused', 'store_closed',
  'item_unavailable', 'insufficient_stock', 'below_min_order', 'address_outside_delivery_radius',
  'coupon_invalid', 'coupon_min_order', 'coupon_exhausted', 'coupon_already_used',
  'idempotency_key_required', 'too_many_orders', 'payment_method_unavailable',
  'order_not_found', 'cancel_not_allowed', 'invalid_prep_time', 'reason_required', 'dispatch_not_allowed',
  'already_assigned', 'invalid_transition',
  'partner_not_registered', 'partner_not_approved', 'location_required', 'active_delivery_in_progress',
  'invalid_timestamp', 'assignment_not_found', 'offer_not_open', 'offer_expired', 'partner_offline',
  'order_unavailable', 'too_many_active_deliveries', 'assignment_not_active', 'order_not_ready', 'not_at_store',
  'otp_locked', 'otp_incorrect', 'not_at_destination',
  'review_requires_delivery', 'review_window_closed', 'invalid_rating', 'product_not_in_order',
  'no_partner_to_review', 'already_reviewed', 'cannot_change_own_role',
  'routing_not_configured', 'routing_failed',
  'product_not_found', 'variant_required', 'duplicate_size_label', 'invalid_product_values',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Extracts our error code from a Supabase/PostgREST error (or any thrown value). */
export function errorCode(err: unknown): ErrorCode | 'network' | 'generic' {
  const e = err as { message?: string; code?: string; name?: string } | null;
  if (!e) return 'generic';
  if (e.name === 'TypeError' && /fetch|network/i.test(e.message ?? '')) return 'network';
  const msg = (e.message ?? '').trim();
  return (ERROR_CODES as readonly string[]).includes(msg) ? (msg as ErrorCode) : 'generic';
}
