/**
 * Order lifecycle. This mirrors public.order_status and
 * public.order_transition_allowed() in the database — the database is the
 * source of truth and rejects any other transition. Keep both in sync
 * (packages/shared/src/constants/order.test.ts checks this list).
 */
export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'delivered',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  placed: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'ready_for_pickup', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up', 'cancelled'],
  picked_up: ['delivered'],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['delivered', 'rejected', 'cancelled'];

/** Statuses during which the customer may see the partner's live location. */
export const LIVE_TRACKING_STATUSES: readonly OrderStatus[] = ['picked_up'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isActiveOrder(status: OrderStatus): boolean {
  return !TERMINAL_ORDER_STATUSES.includes(status);
}

export const ASSIGNMENT_STATUSES = [
  'offered',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
  'picked_up',
  'delivered',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['cod', 'test'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
