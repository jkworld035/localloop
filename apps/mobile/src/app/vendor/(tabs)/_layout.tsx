import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@localloop/shared';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { ErrorState, LoadingState } from '@/components/ui';
import { useMyStore, useVendor, useVendorDashboard, useVendorOrdersRealtime } from '@/features/vendor/api';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, active: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? active : name} size={26} color={color as string} />;
  };

/** Vendor home. Registration comes first; shop setup and documents are available while verification is pending. */
export default function VendorTabs() {
  const { t, i18n } = useTranslation();
  const vendor = useVendor();
  const store = useMyStore();
  const approved = vendor.data?.status === 'approved' && store.data?.status === 'approved';
  // Keep the order queue live on every vendor tab, not only the Orders screen.
  useVendorOrdersRealtime(approved ? store.data?.id : undefined);
  const dash = useVendorDashboard(approved ? store.data?.id : undefined);

  if (vendor.isPending || store.isPending) return <LoadingState />;
  if (vendor.isError) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (!vendor.data) return <Redirect href="/vendor/register" />;

  const te = i18n.language === 'te';
  const newOrders = dash.data?.new_orders ?? 0;
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
      <Tabs.Screen name="index" options={{ title: t('vendor.tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('vendor.tabs.orders'),
          tabBarIcon: icon('receipt-outline', 'receipt'),
          tabBarBadge: newOrders > 0 ? newOrders : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.status.danger },
        }}
      />
      <Tabs.Screen name="products" options={{ title: t('vendor.tabs.products'), tabBarIcon: icon('cube-outline', 'cube') }} />
      <Tabs.Screen name="shop" options={{ title: t('vendor.tabs.shop'), tabBarIcon: icon('storefront-outline', 'storefront') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
