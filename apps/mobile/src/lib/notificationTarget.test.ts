import { describe, expect, it } from 'vitest';
import { notificationTarget } from './notificationTarget';

describe('notification taps', () => {
  it('opens the live map for out-for-delivery updates and the order page otherwise', () => {
    expect(notificationTarget('customer', 'order_picked_up', { order_id: 'o1' })).toEqual({ pathname: '/track/[id]', params: { id: 'o1' } });
    expect(notificationTarget('customer', 'order_accepted', { order_id: 'o1' })).toEqual({ pathname: '/order/[id]', params: { id: 'o1' } });
  });
  it('opens support conversations for any role', () => {
    expect(notificationTarget('vendor', 'support_reply', { ticket_id: 't1' })).toEqual({ pathname: '/support/[id]', params: { id: 't1' } });
  });
  it('sends vendors and partners to their own screens', () => {
    expect(notificationTarget('vendor', 'new_order', { order_id: 'o1' })).toEqual({ pathname: '/vendor/order/[id]', params: { id: 'o1' } });
    expect(notificationTarget('vendor', 'payout_sent', {})).toBe('/vendor');
    expect(notificationTarget('delivery_partner', 'delivery_request', { order_id: 'o1' })).toBe('/partner');
  });
});
