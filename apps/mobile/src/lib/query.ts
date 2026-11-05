import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { errorCode } from '@localloop/shared';

// Pause queries while offline and resume (refetching stale data) on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false)),
);

// Treat foregrounding the app like a browser tab regaining focus.
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});

export const queryClient = new QueryClient({
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
