import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@localloop/shared';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, active: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? active : name} size={26} color={color as string} />;
  };

export default function CustomerTabs() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.forest,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: { minHeight: 64, paddingTop: 6, backgroundColor: colors.surface.card },
        tabBarLabelStyle: {
          fontFamily: te ? typography.family.teluguMedium : typography.family.latinMedium,
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="categories" options={{ title: t('tabs.categories'), tabBarIcon: icon('grid-outline', 'grid') }} />
      <Tabs.Screen name="orders" options={{ title: t('tabs.orders'), tabBarIcon: icon('receipt-outline', 'receipt') }} />
      <Tabs.Screen name="wishlist" options={{ title: t('tabs.wishlist'), tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
