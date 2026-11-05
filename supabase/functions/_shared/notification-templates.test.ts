import { describe, expect, it } from 'vitest';
import { __templates, renderNotification } from './notification-templates';

describe('notification templates', () => {
  it('has a Telugu template for every English one', () => {
    expect(Object.keys(__templates.te).sort()).toEqual(Object.keys(__templates.en).sort());
  });
  it('renders in the user language', () => {
    expect(renderNotification('order_delivered', { order_number: 'LL261105-000001' }, 'te')?.body).toContain('LL261105-000001');
    expect(renderNotification('partner_approaching', { minutes: 3 }, 'en')?.body).toContain('3 min');
  });
  it('returns null for unknown types instead of sending blank pushes', () => {
    expect(renderNotification('nope', {}, 'en')).toBeNull();
  });
});
