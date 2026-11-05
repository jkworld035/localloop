import NetInfo from '@react-native-community/netinfo';
import { colors, spacing } from '@localloop/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Banner } from './Banner';

function useIsOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(
    () => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)),
    [],
  );
  return offline;
}

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  footer?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}

/** Page container: safe areas, ivory background, offline banner, optional scroll/refresh and sticky footer. */
export function Screen({ children, scroll = true, edges = ['top'], padded = true, footer, refreshing, onRefresh, contentStyle }: ScreenProps) {
  const { t } = useTranslation();
  const offline = useIsOffline();
  const body = [styles.content, padded && styles.padded, contentStyle];
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {offline && (
        <View style={styles.offline}>
          <Banner tone="warning" message={t('common.offline_banner')} />
        </View>
      )}
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={body}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand.forest} /> : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.root, ...body]}>{children}</View>
        )}
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  content: { gap: spacing.lg, flexGrow: 1 },
  padded: { padding: spacing.lg },
  offline: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.border,
    backgroundColor: colors.surface.card,
  },
});
