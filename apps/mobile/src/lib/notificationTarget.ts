import type { Href } from 'expo-router';

type Role = 'customer' | 'vendor' | 'delivery_partner' | 'admin' | null | undefined;

/** Where tapping a notification (push or inbox) should take this user. */
export function notificationTarget(role: Role, type: string, data: Record<string, unknown>): Href | null {
  const orderId = typeof data.order_id === 'string' ? data.order_id : null;
  const ticketId = typeof data.ticket_id === 'string' ? data.ticket_id : null;
  if (ticketId) return { pathname: '/support/[id]', params: { id: ticketId } };
  if (role === 'customer') {
    if (!orderId) return null;
    const live = type === 'order_picked_up' || type === 'partner_approaching';
    return { pathname: live ? '/track/[id]' : '/order/[id]', params: { id: orderId } };
  }
  if (role === 'vendor') {
    if (orderId) return { pathname: '/vendor/order/[id]', params: { id: orderId } };
    return type === 'low_stock' ? '/vendor/products' : '/vendor';
  }
  if (role === 'delivery_partner') return '/partner';
  return null;
}
