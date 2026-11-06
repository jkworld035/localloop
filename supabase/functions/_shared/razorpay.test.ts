import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, linkExpiry, paymentLinkBody, toPaise } from './razorpay';

describe('razorpay helpers', () => {
  it('converts rupees to paise exactly', () => {
    expect(toPaise('380.00')).toBe(38000);
    expect(toPaise('0.1')).toBe(10);
    expect(toPaise(1234.56)).toBe(123456);
    expect(toPaise('19.99')).toBe(1999);
  });
  it('keeps payment links alive for Razorpay’s 15-minute minimum', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    expect(linkExpiry(new Date('2026-11-07T10:05:00Z'), now)).toBe(Math.floor(new Date('2026-11-07T10:16:00Z').getTime() / 1000));
    expect(linkExpiry(new Date('2026-11-07T10:30:00Z'), now)).toBe(Math.floor(new Date('2026-11-07T10:30:00Z').getTime() / 1000));
  });
  it('builds a link that cannot be partly paid and carries the order id', () => {
    const b = paymentLinkBody({ orderId: 'o1', orderNumber: 'LL261107-000001', amountPaise: 38000, storeName: 'Kirana', customerName: null, customerPhone: '+919000000001', expireBy: 1, attempt: 'a1', callbackUrl: 'https://x/pay/return' });
    expect(b).toMatchObject({ amount: 38000, currency: 'INR', accept_partial: false, notes: { order_id: 'o1' }, callback_url: 'https://x/pay/return?order=o1' });
    expect(b.customer).toEqual({ contact: '+919000000001' });
    expect(b.reference_id.length).toBeLessThanOrEqual(40);
  });
  it('computes the webhook signature (HMAC-SHA256 hex)', async () => {
    // Reference value: echo -n 'body' | openssl dgst -sha256 -hmac 'secret'
    expect(await hmacSha256Hex('secret', 'body')).toBe('dc46983557fea127b43af721467eb9b3fde2338fe3e14f51952aa8478c13d355');
  });
});
