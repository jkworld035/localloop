import { Ionicons } from '@expo/vector-icons';
import { colors, decodePolyline, interpolate, type LatLng } from '@localloop/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

export interface DeliveryMapProps {
  store: LatLng;
  drop: LatLng;
  /** The partner's last reported position (customer view). */
  partner?: LatLng | null;
  /** Bearing in degrees, if the device reported one. */
  heading?: number | null;
  /** Encoded polyline from the Routes API — the real road route, never a straight line. */
  polyline?: string | null;
  /** Dim the partner marker when the position is stale or lost. */
  partnerStale?: boolean;
  /** Partner's own device: show the blue dot instead of a marker. */
  showsUserLocation?: boolean;
  accessibilityLabel: string;
  storeLabel: string;
  dropLabel: string;
  partnerLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const EDGE = { top: 60, right: 50, bottom: 60, left: 50 };
const GLIDE_MS = 1000;

/**
 * Glides a marker from its previous position to the new one so it moves like
 * a vehicle rather than jumping every few seconds. Purely visual: the drawn
 * point always ends on the reported fix.
 */
function useGlide(target: LatLng | null | undefined) {
  const [shown, setShown] = useState<LatLng | null>(target ?? null);
  const fromRef = useRef<LatLng | null>(target ?? null);
  useEffect(() => {
    if (!target) return setShown(null);
    const from = fromRef.current;
    if (!from) {
      fromRef.current = target;
      return setShown(target);
    }
    let frame = 0;
    const start = Date.now();
    const step = () => {
      const k = (Date.now() - start) / GLIDE_MS;
      const p = interpolate(from, target, k);
      fromRef.current = p;
      setShown(p);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target?.latitude, target?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

export function DeliveryMap({
  store,
  drop,
  partner,
  heading,
  polyline,
  partnerStale,
  showsUserLocation,
  accessibilityLabel,
  storeLabel,
  dropLabel,
  partnerLabel,
  style,
}: DeliveryMapProps) {
  const map = useRef<MapView>(null);
  const route = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);
  const shownPartner = useGlide(partner);
  const fitted = useRef(false);

  // Frame store, drop and partner once when the map is ready, and again when the route changes.
  const fit = () => {
    const points = [store, drop, ...(partner ? [partner] : []), ...route];
    map.current?.fitToCoordinates(points, { edgePadding: EDGE, animated: fitted.current });
    fitted.current = true;
  };
  useEffect(() => {
    if (fitted.current) fit();
  }, [polyline]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: (store.latitude + drop.latitude) / 2,
          longitude: (store.longitude + drop.longitude) / 2,
          latitudeDelta: Math.max(0.01, Math.abs(store.latitude - drop.latitude) * 2),
          longitudeDelta: Math.max(0.01, Math.abs(store.longitude - drop.longitude) * 2),
        }}
        onMapReady={fit}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsUserLocation}
        toolbarEnabled={false}
        accessibilityLabel={accessibilityLabel}
      >
        {route.length > 1 && <Polyline coordinates={route} strokeColor={colors.brand.forest} strokeWidth={5} />}
        <Marker coordinate={store} title={storeLabel} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.pin, { backgroundColor: colors.brand.forest }]}>
            <Ionicons name="storefront" size={18} color="#FFFFFF" />
          </View>
        </Marker>
        <Marker coordinate={drop} title={dropLabel} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.pin, { backgroundColor: colors.status.danger }]}>
            <Ionicons name="home" size={18} color="#FFFFFF" />
          </View>
        </Marker>
        {shownPartner && (
          <Marker coordinate={shownPartner} title={partnerLabel} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading ?? 0} opacity={partnerStale ? 0.5 : 1}>
            <View style={[styles.pin, styles.partner]}>
              <Ionicons name={heading != null ? 'navigate' : 'bicycle'} size={20} color="#FFFFFF" />
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E8EDE9' },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  partner: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1F6FEB' },
});
