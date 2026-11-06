import NetInfo from '@react-native-community/netinfo';
import { focusManager, MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { errorCode } from '@localloop/shared';
import { reportError } from '@/services/crashReporting';

// Unexpected failures (not network trouble, not a known business rule such as
// "store closed") are bugs worth seeing in admin → App health.
const reportUnexpected = (error: unknown) => {
  if (errorCode(error) === 'generic') reportError(error);
};

// Pause queries while offline and resume (refetching stale data) on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false)),
);

// Treat foregrounding the app like a browser tab regaining focus.
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportUnexpected }),
  mutationCache: new MutationCache({ onError: reportUnexpected }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Business errors (RLS, validation) won't fix themselves; only retry transport failures.
      retry: (failureCount, error) => failureCount < 3 && ['network', 'generic'].includes(errorCode(error)),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      networkMode: 'offlineFirst',
    },
    mutations: { retry: false, networkMode: 'online' },
  },
});
