'use client';

import 'leaflet/dist/leaflet.css';
import { haversineMeters } from '@localloop/shared';
import type * as Leaflet from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls } from '@/components/ui';
import type { AdminArea } from '../page';
import { saveArea } from '../actions';

export type StorePoint = { id: string; name: string; status: string; area_id: string | null; latitude: number; longitude: number };
type LatLng = [number, number];

const KAMAREDDY: LatLng = [18.3203, 78.337];
const C = { inside: '#1e7a4c', outside: '#8a8f8b', shape: '#174c38', other: '#e9a83a' };

/** Ray casting on a lat/lng ring — accurate enough at town scale. */
function insidePolygon([lat, lng]: LatLng, ring: LatLng[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!;
    const [yj, xj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const dot = (L: typeof Leaflet, color: string, size = 12) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
  });

export function AreaEditor({ area, others, stores }: { area: AdminArea | null; others: AdminArea[]; stores: StorePoint[] }) {
  const firstRing: LatLng[] = area?.boundary?.coordinates[0]?.[0]?.slice(0, -1).map(([lng, lat]) => [lat!, lng!] as LatLng) ?? [];
  const extraParts = Math.max(0, (area?.boundary?.coordinates.length ?? 1) - 1);
  const [mode, setMode] = useState<'circle' | 'boundary'>(area?.boundary ? 'boundary' : 'circle');
  const [center, setCenter] = useState<LatLng>(area ? [area.latitude, area.longitude] : KAMAREDDY);
  const [radius, setRadius] = useState<number>(area ? Number(area.radius_km) : 8);
  const [ring, setRing] = useState<LatLng[]>(firstRing);

  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const shapeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const storeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const isInside = useMemo(
    () => (p: LatLng) => (mode === 'boundary' ? ring.length >= 3 && insidePolygon(p, ring) : haversineMeters({ latitude: center[0], longitude: center[1] }, { latitude: p[0], longitude: p[1] }) <= radius * 1000),
    [mode, ring, center, radius],
  );
  const insideCount = stores.filter((s) => isInside([s.latitude, s.longitude])).length;

  // Map setup once.
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      lib.current = L;
      const m = L.map(box.current).setView(center, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      // Other areas, for context.
      for (const o of others) {
        const style = { color: C.other, weight: 2, dashArray: '6 6', fillOpacity: 0.05 };
        if (o.boundary) L.geoJSON(o.boundary as never, { style }).bindTooltip(o.name).addTo(m);
        else L.circle([o.latitude, o.longitude], { radius: Number(o.radius_km) * 1000, ...style }).bindTooltip(o.name).addTo(m);
      }
      shapeLayer.current = L.layerGroup().addTo(m);
      storeLayer.current = L.layerGroup().addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        const p: LatLng = [e.latlng.lat, e.latlng.lng];
        if (modeRef.current === 'boundary') setRing((r) => [...r, p]);
        else setCenter(p);
      });
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit to the shape the first time.
  const fitted = useRef(false);
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || !map.current || fitted.current) return;
    fitted.current = true;
    if (ring.length >= 3) map.current.fitBounds(L.latLngBounds(ring), { padding: [30, 30] });
    else map.current.fitBounds(L.latLng(center).toBounds(radius * 2000), { padding: [30, 30] });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the shape being edited.
  useEffect(() => {
    const L = lib.current;
    const layer = shapeLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (mode === 'circle') {
      L.circle(center, { radius: radius * 1000, color: C.shape, weight: 3, fillOpacity: 0.08 }).addTo(layer);
      L.marker(center, { draggable: true, icon: dot(L, C.shape, 18), title: 'Centre — drag to move' })
        .on('dragend', (e) => {
          const ll = (e.target as Leaflet.Marker).getLatLng();
          setCenter([ll.lat, ll.lng]);
        })
        .addTo(layer);
    } else {
      if (ring.length >= 2) L.polygon(ring, { color: C.shape, weight: 3, fillOpacity: 0.08 }).addTo(layer);
      ring.forEach((p, i) =>
        L.marker(p, { draggable: true, icon: dot(L, C.shape, 14), title: `Point ${i + 1} — drag to move` })
          .on('dragend', (e) => {
            const ll = (e.target as Leaflet.Marker).getLatLng();
            setRing((r) => r.map((q, k) => (k === i ? ([ll.lat, ll.lng] as LatLng) : q)));
          })
          .addTo(layer),
      );
    }
  }, [ready, mode, center, radius, ring]);

  // Shops coloured by whether the current shape covers them.
  useEffect(() => {
    const L = lib.current;
    const layer = storeLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const s of stores) {
      const inside = isInside([s.latitude, s.longitude]);
      L.marker([s.latitude, s.longitude], { icon: dot(L, inside ? C.inside : C.outside), interactive: true })
        .bindTooltip(`${s.name} (${s.status})${inside ? '' : ' — outside'}`)
        .addTo(layer);
    }
  }, [ready, stores, isInside]);

  const centroid: LatLng =
    mode === 'boundary' && ring.length >= 3 ? [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length] : center;
  const boundaryJson =
    mode === 'boundary' && ring.length >= 3
      ? JSON.stringify({ type: 'Polygon', coordinates: [[...ring, ring[0]!].map(([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))])] })
      : '';
  const canSave = mode === 'circle' || ring.length >= 3;

  return (
    <form action={saveArea} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Shape">
          <button type="button" onClick={() => setMode('circle')} aria-pressed={mode === 'circle'} className={mode === 'circle' ? btnPrimary : btnSecondary}>
            Circle
          </button>
          <button type="button" onClick={() => setMode('boundary')} aria-pressed={mode === 'boundary'} className={mode === 'boundary' ? btnPrimary : btnSecondary}>
            Draw boundary
          </button>
          {mode === 'boundary' && (
            <>
              <button type="button" onClick={() => setRing((r) => r.slice(0, -1))} disabled={!ring.length} className={btnSecondary}>
                Undo point
              </button>
              <button type="button" onClick={() => setRing([])} disabled={!ring.length} className={btnSecondary}>
                Clear
              </button>
            </>
          )}
        </div>
        <p className="mb-2 text-sm text-ink-2" aria-live="polite">
          {mode === 'circle'
            ? 'Click the map (or drag the dark dot) to set the centre, and set the radius on the right.'
            : ring.length < 3
              ? `Click the map to add corner points around the area (${ring.length} so far, at least 3).`
              : `${ring.length} points. Drag a point to adjust it; the shape closes by itself.`}
        </p>
        <div ref={box} className="h-[60vh] min-h-96 overflow-hidden rounded-2xl border border-line bg-sunken" role="region" aria-label="Area map editor" />
        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: C.inside }} />Shop inside</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full" style={{ background: C.outside }} />Shop outside</li>
          <li><span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: C.other }} />Other areas</li>
        </ul>
        {extraParts > 0 && mode === 'boundary' && (
          <p className="mt-2 text-sm text-warn">This boundary had {extraParts + 1} separate parts; the editor keeps the first. Saving will drop the others.</p>
        )}
      </div>

      <aside className="space-y-4 rounded-2xl border border-line bg-white p-5 text-sm">
        <input type="hidden" name="id" value={area?.id ?? 'new'} />
        <input type="hidden" name="lat" value={centroid[0].toFixed(6)} />
        <input type="hidden" name="lng" value={centroid[1].toFixed(6)} />
        <input type="hidden" name="boundary" value={boundaryJson} />
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Area name</span>
          <input name="name" required minLength={2} defaultValue={area?.name ?? ''} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">City / town</span>
          <input name="city" required minLength={2} defaultValue={area?.city ?? 'Kamareddy'} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">State</span>
          <input name="state" defaultValue={area?.state ?? 'Telangana'} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Radius (km){mode === 'boundary' ? ' — used only if the boundary is removed' : ''}</span>
          <input name="radius" type="number" min={0.5} max={100} step={0.5} value={radius} onChange={(e) => setRadius(Number(e.target.value) || 0)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={area?.is_active ?? false} className="h-4 w-4" />
          Active — customers here can order
        </label>
        <p className="rounded-lg bg-sunken p-3" aria-live="polite">
          <b>{insideCount}</b> of {stores.length} shops are inside this shape.
        </p>
        <p className="text-xs text-ink-2">Saving moves shops into whichever area now contains them; shops left outside every active area stop appearing to customers.</p>
        <button disabled={!canSave} className={`${btnPrimary} w-full disabled:opacity-50`}>
          Save area
        </button>
      </aside>
    </form>
  );
}
