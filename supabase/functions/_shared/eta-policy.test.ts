import { describe, expect, it } from 'vitest';
import { buildRoutesRequest, decideEtaRecompute, parseRoutesResponse, travelModeFor } from './eta-policy';

const now = new Date('2026-11-05T10:00:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
const base = {
  assignmentStatus: 'picked_up',
  partner: { latitude: 18.33, longitude: 78.34, at: ago(3) },
  etaOrigin: { latitude: 18.33, longitude: 78.34 },
  etaComputedAt: ago(20),
  pickedUpAt: ago(300),
  policy: { intervalSeconds: 60, distanceMeters: 250 },
  now,
};

describe('decideEtaRecompute', () => {
  it('computes the first route', () => {
    expect(decideEtaRecompute({ ...base, etaComputedAt: null, etaOrigin: null })).toMatchObject({
      recompute: true, leg: 'to_customer', reason: 'initial',
    });
  });
  it('recomputes when the leg changes at pickup, even inside the throttle', () => {
    expect(decideEtaRecompute({ ...base, etaComputedAt: ago(5), pickedUpAt: ago(2) })).toMatchObject({
      recompute: true, reason: 'status_change',
    });
  });
  it('keeps a fresh route while the partner has barely moved', () => {
    expect(decideEtaRecompute(base)).toEqual({ recompute: false, reason: 'fresh' });
  });
  it('recomputes after moving past the distance threshold', () => {
    const moved = { ...base, partner: { latitude: 18.333, longitude: 78.34, at: ago(2) } }; // ≈333 m north
    expect(decideEtaRecompute(moved)).toMatchObject({ recompute: true, reason: 'moved' });
  });
  it('recomputes after the interval for traffic drift', () => {
    expect(decideEtaRecompute({ ...base, etaComputedAt: ago(61) })).toMatchObject({ recompute: true, reason: 'interval' });
  });
  it('throttles a client hammering the function', () => {
    expect(decideEtaRecompute({ ...base, etaComputedAt: ago(5), force: true })).toEqual({ recompute: false, reason: 'throttled' });
  });
  it('never routes from a stale fix', () => {
    expect(decideEtaRecompute({ ...base, partner: { ...base.partner, at: ago(300) } })).toEqual({
      recompute: false, reason: 'stale_location',
    });
  });
  it('ignores finished assignments', () => {
    expect(decideEtaRecompute({ ...base, assignmentStatus: 'delivered' })).toEqual({ recompute: false, reason: 'inactive' });
  });
  it('routes to the store before pickup', () => {
    expect(decideEtaRecompute({ ...base, assignmentStatus: 'accepted', etaComputedAt: null })).toMatchObject({ leg: 'to_store' });
  });
});

describe('Routes API helpers', () => {
  it('picks travel modes per vehicle', () => {
    expect(travelModeFor('motorcycle')).toBe('TWO_WHEELER');
    expect(travelModeFor('car')).toBe('DRIVE');
    expect(travelModeFor('bicycle')).toBe('BICYCLE');
  });
  it('asks for traffic-aware routing only for motor vehicles', () => {
    expect(buildRoutesRequest({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, 'scooter')).toMatchObject({
      travelMode: 'TWO_WHEELER', routingPreference: 'TRAFFIC_AWARE', regionCode: 'IN',
    });
    expect(buildRoutesRequest({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, 'bicycle')).not.toHaveProperty(
      'routingPreference',
    );
  });
  it('parses distance, duration and polyline', () => {
    expect(parseRoutesResponse({ routes: [{ distanceMeters: 2412, duration: '538s', polyline: { encodedPolyline: 'abc' } }] }))
      .toEqual({ distanceMeters: 2412, durationSeconds: 538, polyline: 'abc' });
  });
  it('treats a missing distance as zero (already at destination)', () => {
    expect(parseRoutesResponse({ routes: [{ duration: '0s' }] }).distanceMeters).toBe(0);
  });
  it('rejects empty responses instead of inventing an ETA', () => {
    expect(() => parseRoutesResponse({})).toThrow('no_route');
    expect(() => parseRoutesResponse({ routes: [{ distanceMeters: 5 }] })).toThrow('bad_duration');
  });
});
