import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition } from './constants/order';
import { decodePolyline, haversineMeters, parseEwkbPoint, toEwktPoint } from './utils/geo';
import { formatDistance, formatINR } from './utils/format';
import { arrivalEstimate, locationFreshness } from './utils/freshness';
import { gstin, indianMobile, pincode } from './validation/common';
import { partnerRegistrationSchema } from './validation/partner';
import { variantSchema } from './validation/product';
import { parseSizeLine, parseSizeLines } from './utils/catalog';

describe('order state machine', () => {
  it('matches public.order_transition_allowed() in the migration', () => {
    // The latest migration that (re)defines the function is the one in force.
    const dir = resolve(__dirname, '../../../supabase/migrations');
    const marker = 'function public.order_transition_allowed';
    const file = readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && readFileSync(resolve(dir, f), 'utf8').includes(marker))
      .sort()
      .at(-1)!;
    const sql = readFileSync(resolve(dir, file), 'utf8');
    const block = sql.slice(sql.indexOf(marker), sql.indexOf('$$;', sql.indexOf(marker)));
    for (const from of ORDER_STATUSES) {
      const m = new RegExp(`when '${from}' then p_to (?:in \\(([^)]*)\\)|= '([a-z_]+)')`).exec(block);
      const dbTargets = m ? (m[1] ?? `'${m[2]}'`).split(',').map((s) => s.trim().replace(/'/g, '')) : [];
      expect([...ORDER_TRANSITIONS[from]].sort(), `transitions from ${from}`).toEqual(dbTargets.sort());
    }
  });
  it('blocks skipping steps', () => {
    expect(canTransition('placed', 'picked_up')).toBe(false);
    expect(canTransition('picked_up', 'delivered')).toBe(true);
  });
});

describe('validation', () => {
  it('normalises Indian mobile numbers', () => {
    expect(indianMobile.parse('98765 43210')).toBe('+919876543210');
    expect(indianMobile.parse('+91-9876543210')).toBe('+919876543210');
    expect(indianMobile.safeParse('5876543210').success).toBe(false);
  });
  it('validates pincode and GSTIN', () => {
    expect(pincode.safeParse('503111').success).toBe(true);
    expect(pincode.safeParse('003111').success).toBe(false);
    expect(gstin.safeParse('36AABCU9603R1ZM').success).toBe(true);
    expect(gstin.safeParse('36AABCU9603R1XM').success).toBe(false);
  });
  it('requires licence and RC only for motorised vehicles', () => {
    expect(partnerRegistrationSchema.safeParse({ fullName: 'Anil', vehicleType: 'bicycle' }).success).toBe(true);
    expect(partnerRegistrationSchema.safeParse({ fullName: 'Anil', vehicleType: 'scooter' }).success).toBe(false);
    const ok = partnerRegistrationSchema.parse({
      fullName: 'Suresh', vehicleType: 'motorcycle', vehicleRegistration: 'ts 16 ab 1234', drivingLicence: 'TS16 20190012345',
    });
    expect(ok.vehicleRegistration).toBe('TS16AB1234');
  });
  it('rejects a sale price at or above MRP', () => {
    const base = { label: '1 kg', unit: 'kg', unitQuantity: 1, price: 100, stock: 5 };
    expect(variantSchema.safeParse({ ...base, salePrice: 90 }).success).toBe(true);
    expect(variantSchema.safeParse({ ...base, salePrice: 100 }).success).toBe(false);
  });
});

describe('geo & format utils', () => {
  it('decodes Google encoded polylines', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });
  it('decodes PostGIS points returned by PostgREST', () => {
    // select st_setsrid(st_makepoint(78.337, 18.3203), 4326)::geography  →  hex EWKB
    expect(parseEwkbPoint('0101000020E610000021B0726891955340A7E8482EFF513240')).toEqual({ longitude: 78.337, latitude: 18.3203 });
    expect(parseEwkbPoint('nope')).toBeNull();
    expect(toEwktPoint({ latitude: 18.3203, longitude: 78.337 })).toBe('SRID=4326;POINT(78.337 18.3203)');
  });
  it('computes great-circle distance', () => {
    const d = haversineMeters({ latitude: 18.3203, longitude: 78.337 }, { latitude: 18.33, longitude: 78.342 });
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1250);
  });
  it('formats rupees with Indian grouping and distances', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatDistance(2412)).toEqual({ value: '2.4', unit: 'km' });
    expect(formatDistance(846)).toEqual({ value: '850', unit: 'm' });
  });
  it('never presents an old fix as live', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    expect(locationFreshness('2026-11-05T09:59:50Z', now)).toBe('live');
    expect(locationFreshness('2026-11-05T09:59:00Z', now)).toBe('stale');
    expect(locationFreshness('2026-11-05T09:50:00Z', now)).toBe('lost');
    expect(locationFreshness(null, now)).toBe('lost');
  });

  it('shows an arrival estimate only while the position behind it is live', () => {
    const now = new Date('2026-11-05T10:00:00Z');
    const base = { eta_seconds: 600, eta_computed_at: '2026-11-05T09:58:00Z', location_at: '2026-11-05T09:59:55Z' };
    expect(arrivalEstimate(base, now)?.minutes).toBe(8);
    expect(arrivalEstimate({ ...base, location_at: '2026-11-05T09:58:00Z' }, now)).toBeNull();
    expect(arrivalEstimate({ ...base, eta_seconds: null }, now)).toBeNull();
    // Overdue estimates never show zero or negative minutes.
    expect(arrivalEstimate({ ...base, eta_computed_at: '2026-11-05T09:40:00Z' }, now)?.minutes).toBe(1);
  });
});

describe('catalogue size lines', () => {
  it('reads label, unit, quantity and MRP', () => {
    expect(parseSizeLine('1 kg | 72')).toEqual({ label: '1 kg', unit: 'kg', unit_quantity: 1, mrp: 72 });
    expect(parseSizeLine('500g, ₹38.5')).toEqual({ label: '500g', unit: 'g', unit_quantity: 500, mrp: 38.5 });
    expect(parseSizeLine('1 Ltr pouch | 68')).toEqual({ label: '1 Ltr pouch', unit: 'l', unit_quantity: 1, mrp: 68 });
    expect(parseSizeLine('Pack of 6 | 120')).toEqual({ label: 'Pack of 6', unit: 'piece', unit_quantity: 6, mrp: 120 });
  });
  it('falls back to one piece without an MRP', () => {
    expect(parseSizeLine('Regular')).toEqual({ label: 'Regular', unit: 'piece', unit_quantity: 1, mrp: null });
  });
  it('skips blank lines and caps at 10', () => {
    expect(parseSizeLines('1 kg | 72\n\n  \n5 kg | 310')).toHaveLength(2);
    expect(parseSizeLines(Array.from({ length: 15 }, (_, i) => `${i + 1} kg`).join('\n'))).toHaveLength(10);
  });
});
