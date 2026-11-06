import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { AccountSettings } from '@/features/account/AccountSettings';
import { useProfile } from '@/features/account/api';
import { usePartner, useSetAvatar } from '@/features/partner/api';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { pickImage, removeFile, UploadError, uploadPhoto } from '@/services/upload';

export default function PartnerSettings() {
  const { t } = useTranslation();
  const profile = useProfile();
  const partner = usePartner();
  const setAvatar = useSetAvatar();
  const [busy, setBusy] = useState(false);
  const avatarPath = profile.data?.avatar_path ?? null;
  const avatarUrl = avatarPath ? supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl : null;

  // Customers see this photo on the tracking screen, so it helps them recognise their partner.
  const changePhoto = async (source: 'camera' | 'library') => {
    if (!profile.data) return;
    try {
      const uri = await pickImage(source, [1, 1]);
      if (!uri) return;
      setBusy(true);
      const path = await uploadPhoto('avatars', profile.data.id, uri, 600);
      await setAvatar.mutateAsync(path);
      if (avatarPath) void removeFile('avatars', avatarPath);
    } catch (e) {
      Alert.alert(e instanceof UploadError ? t(e.reason === 'too_large' ? 'upload.too_large' : 'upload.permission_denied') : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('profile.title')}
      </AppText>
      <Card>
        <View style={styles.row}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} accessibilityLabel={t('partner.profile_photo')} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Ionicons name="person" size={36} color={colors.text.muted} />
            </View>
          )}
          <View style={styles.flex}>
            <AppText weight="bold">{profile.data?.full_name}</AppText>
            {partner.data && (
              <AppText color={colors.text.secondary}>
                {t(`vehicles.${partner.data.vehicle_type}`)}
                {partner.data.vehicle_registration ? ` · ${partner.data.vehicle_registration}` : ''}
              </AppText>
            )}
          </View>
        </View>
        <AppText variant="small" color={colors.text.secondary}>
          {t('partner.profile_photo_hint')}
        </AppText>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label={t('upload.take_photo')} icon="camera-outline" variant="secondary" compact loading={busy} onPress={() => void changePhoto('camera')} />
          </View>
          <View style={styles.flex}>
            <Button label={t('upload.choose_photo')} icon="image-outline" variant="secondary" compact disabled={busy} onPress={() => void changePhoto('library')} />
          </View>
        </View>
      </Card>
      <Button label={t('partner.documents')} variant="secondary" icon="document-text-outline" onPress={() => router.push('/partner/documents')} />
      <AccountSettings />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: { backgroundColor: colors.surface.background, alignItems: 'center', justifyContent: 'center' },
});
