import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SelectedLocation {
  latitude: number;
  longitude: number;
  /** Human label from reverse geocoding (locality, city) — may be null offline. */
  label: string | null;
  source: 'gps' | 'map' | 'address';
  /** GPS horizontal accuracy in metres at detection time; null for map/address picks. */
  accuracyM: number | null;
  addressId: string | null;
  detectedAt: string;
}

interface LocationState {
  selected: SelectedLocation | null;
  hydrated: boolean;
  select: (loc: SelectedLocation) => void;
  clear: () => void;
}

/**
 * The customer's current browsing/delivery location. Always comes from the
 * device GPS, a pin the user placed, or a saved address — never a default.
 */
export const useSelectedLocation = create<LocationState>()(
  persist(
    (set) => ({
      selected: null,
      hydrated: false,
      select: (selected) => set({ selected }),
      clear: () => set({ selected: null }),
    }),
    {
      name: 'localloop.location',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ selected }) => ({ selected }),
      onRehydrateStorage: () => () => useSelectedLocation.setState({ hydrated: true }),
    },
  ),
);
