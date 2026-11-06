import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@localloop/shared';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { ErrorState, LoadingState } from '@/components/ui';
import { reconcileTracking, useOffers, usePartner, usePartnerDashboard, usePartnerRealtime } from '@/features/partner/api';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, active: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? active : name} size={26} color={color as string} />;
  };

/** Delivery partner home. Registration comes first; documents and profile are available while verification is pending. */
export default function PartnerTabs() {
  const { t, i18n } = useTranslation();
  const partner = usePartner();
  const approved = partner.data?.status === 'approved';
  const online = !!partner.data?.is_online;
  // Offers and job changes stay live on every partner tab.
  usePartnerRealtime();
  const dash = usePartnerDashboard(approved);
  const offers = useOffers(approved && online);
  const activeId = dash.data?.active_assignment_id ?? null;

  // Keep the OS tracking task matched to the server: active during a job, idle while online, off otherwise.
  useEffect(() => {
    if (!approved || dash.isPending) return;
    void reconcileTracking(online, !!activeId);
  }, [approved, online, activeId, dash.isPending]);

  if (partner.isPending) return <LoadingState />;
  if (partner.isError) return <ErrorState error={partner.error} onRetry={() => void partner.refetch()} />;
  if (!partner.data) return <Redirect href="/partner/register" />;

  const te = i18n.language === 'te';
  const offerCount = offers.data?.length ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.forest,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: { minHeight: 64, paddingTop: 6, backgroundColor: colors.surface.card },
        tabBarLabelStyle: { fontFamily: te ? typography.family.teluguMedium : typography.family.latinMedium, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('partner.tabs.home'),
          tabBarIcon: icon('bicycle-outline', 'bicycle'),
          tabBarBadge: offerCount > 0 ? offerCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.status.danger },
        }}
      />
      <Tabs.Screen name="history" options={{ title: t('partner.tabs.history'), tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
