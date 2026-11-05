import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppLanguage } from '@/lib/i18n';

interface PreferencesState {
  /** null until the user picks one on the welcome screen. */
  language: AppLanguage | null;
  onboarded: boolean;
  hydrated: boolean;
  setLanguage: (lang: AppLanguage) => void;
  completeOnboarding: () => void;
}

/** Device-local preferences (needed before sign-in, so not in the profile table). */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      language: null,
      onboarded: false,
      hydrated: false,
      setLanguage: (language) => set({ language }),
      completeOnboarding: () => set({ onboarded: true }),
    }),
    {
      name: 'localloop.preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, onboarded }) => ({ language, onboarded }),
      onRehydrateStorage: () => () => usePreferences.setState({ hydrated: true }),
    },
  ),
);
