import { colors } from '@localloop/shared';
import { Stack } from 'expo-router';

export default function PartnerLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface.background } }} />;
}
