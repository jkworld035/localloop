'use client';

import 'leaflet/dist/leaflet.css';
import { TRACKING } from '@localloop/shared';
import type * as Leaflet from 'leaflet';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBadge } from '@/components/ui';
import { ago, inr, label } from '@/lib/format';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Pt = { latitude: number; longitude: number };
interface MapPartner extends Pt {
  id: string;
  name: string | null;
  phone: string | null;
  vehicle_type: string;
  location_at: string | null;
  busy: boolean;
}
interface MapOrder {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  total: number;
  store_name: string;
  store: Pt;
  drop: Pt;
  partner_id: string | null;
  partner_name: string | null;
  waiting_for_partner: boolean;
}
interface Snapshot {
  generated_at: string;
  partners: MapPartner[];
  orders: MapOrder[];
}

// Kamareddy town centre — the launch area.
const HOME: [number, number] = [18.3203, 78.337];
const COLORS = { free: '#1e7a4c', busy: '#1f6feb', stale: '#8a8f8b', store: '#174c38', drop: '#b42318', waiting: '#e9a83a' };

const dot = (L: typeof Leaflet, color: string, text: string, size = 26) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 12px/22px system-ui;text-align:center">${text}</div>`,
  });

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function LiveMap() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const fitted = useRef(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data, error: e } = await supabaseBrowser().rpc('admin_live_map');
    if (e) setError(e.message === 'forbidden' ? "Your role can't see deliveries." : e.message);
    else {
      setError(null);
      setSnap(data as unknown as Snapshot);
      setNow(Date.now());
    }
  }, []);

  // Map setup (Leaflet touches window, so it loads in the browser only).
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      lib.current = L;
      map.current = L.map(box.current, { zoomControl: true }).setView(HOME, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      void load();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [load]);

  // Poll positions; refetch at once when an order or assignment changes.
  useEffect(() => {
    const db = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, 1500);
    };
    const channel = db
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, soon)
      .subscribe();
    const poll = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [load]);

  // Draw.
  useEffect(() => {
    const L = lib.current;
    if (!L || !map.current || !layer.current || !snap) return;
    layer.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const o of snap.orders) {
      const s: [number, number] = [o.store.latitude, o.store.longitude];
      const d: [number, number] = [o.drop.latitude, o.drop.longitude];
      bounds.push(s, d);
      const popup = `<b>${esc(o.order_number)}</b><br>${esc(o.store_name)} · ${esc(label(o.status))}<br>${
        o.partner_name ? `Partner: ${esc(o.partner_name)}` : '<span style="color:#8a5a00">No partner yet</span>'
      }<br><a href="/orders/${esc(o.id)}">Open order →</a>`;
      L.marker(s, { icon: dot(L, COLORS.store, 'S', 22), title: `${o.store_name}` }).bindPopup(popup).addTo(layer.current);
      L.marker(d, { icon: dot(L, o.waiting_for_partner ? COLORS.waiting : COLORS.drop, 'C', 22), title: `Drop for ${o.order_number}` })
        .bindPopup(popup)
        .addTo(layer.current);
      // A dashed pairing line, not a route: it only shows which shop serves which customer.
      L.polyline([s, d], { color: COLORS.store, weight: 2, opacity: 0.5, dashArray: '4 6' }).addTo(layer.current);
    }
    for (const p of snap.partners) {
      const age = p.location_at ? Date.now() - new Date(p.location_at).getTime() : Infinity;
      const stale = age > TRACKING.staleAfterMs;
      const color = stale ? COLORS.stale : p.busy ? COLORS.busy : COLORS.free;
      bounds.push([p.latitude, p.longitude]);
      L.marker([p.latitude, p.longitude], { icon: dot(L, color, 'P'), title: p.name ?? 'Partner' })
        .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.phone)} · ${esc(label(p.vehicle_type))}<br>${p.busy ? 'On a delivery' : 'Free'} · updated ${esc(ago(p.location_at))}`)
        .addTo(layer.current);
    }
    if (!fitted.current && bounds.length) {
      map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      fitted.current = true;
    }
  }, [snap]);

  const waiting = snap?.orders.filter((o) => o.waiting_for_partner) ?? [];
  const free = snap?.partners.filter((p) => !p.busy && Date.now() - new Date(p.location_at ?? 0).getTime() <= TRACKING.lostAfterMs).length ?? 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div>
        <div ref={box} className="h-[60vh] min-h-96 overflow-hidden rounded-2xl border border-line bg-sunken" role="region" aria-label="Map of partners and open orders" />
        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legend">
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.free }} />Partner free</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.busy }} />Partner on a delivery</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.stale }} />No fresh GPS</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.store }} />Shop</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.drop }} />Customer</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: COLORS.waiting }} />Customer, no partner yet</li>
        </ul>
      </div>
      <aside className="space-y-4" aria-live="polite">
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-2xl font-bold text-forest">{snap?.orders.length ?? '—'}</p>
            <p className="text-xs text-ink-2">Open orders</p>
          </div>
          <div className={`rounded-xl border bg-white p-3 ${waiting.length ? 'border-amber' : 'border-line'}`}>
            <p className="text-2xl font-bold text-forest">{snap ? waiting.length : '—'}</p>
            <p className="text-xs text-ink-2">No partner</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-2xl font-bold text-forest">{snap ? free : '—'}</p>
            <p className="text-xs text-ink-2">Partners free</p>
          </div>
        </div>
        <ul className="max-h-[52vh] space-y-2 overflow-y-auto">
          {snap?.orders.map((o) => (
            <li key={o.id} className={`rounded-xl border bg-white p-3 text-sm ${o.waiting_for_partner ? 'border-amber' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/orders/${o.id}`} className="font-medium text-forest hover:underline">
                  {o.order_number}
                </Link>
                <StatusBadge status={o.status} />
              </div>
              <p className="text-ink-2">
                {o.store_name} · {inr(o.total)} · placed {ago(o.placed_at, now)}
              </p>
              <p>{o.partner_name ? `Partner: ${o.partner_name}` : o.waiting_for_partner ? 'Waiting for a partner' : 'Shop deciding'}</p>
            </li>
          ))}
          {snap && snap.orders.length === 0 && <li className="text-sm text-ink-2">No open orders right now.</li>}
        </ul>
        {snap && <p className="text-xs text-ink-2">Last refreshed {ago(snap.generated_at, now)}</p>}
      </aside>
    </div>
  );
}
