import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, VENDOR_DOCUMENT_TYPES, type VendorDocumentType } from '@localloop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Card, Chip, LoadingState, Screen } from '@/components/ui';
import { useUserId } from '@/features/account/api';
import { useAddVendorDocument, useDeleteVendorDocument, useVendorDocuments } from '@/features/vendor/api';
import { errorMessage } from '@/lib/errors';
import { pickDocument, pickImage, removeFile, UploadError, uploadDocument } from '@/services/upload';

/** Verification documents (private bucket; only the vendor and LocalLoop admins can open them). */
export default function VendorDocuments() {
  const { t } = useTranslation();
  const uid = useUserId();
  const docs = useVendorDocuments();
  const add = useAddVendorDocument();
  const remove = useDeleteVendorDocument();
  const [type, setType] = useState<VendorDocumentType>('trade_licence');
  const [busy, setBusy] = useState(false);

  const upload = async (from: 'camera' | 'file') => {
    if (!uid) return;
    try {
      const doc =
        from === 'camera'
          ? await pickImage('camera').then((uri) => (uri ? { uri, mimeType: 'image/jpeg' } : null))
          : await pickDocument();
      if (!doc) return;
      setBusy(true);
      const path = await uploadDocument('vendor-documents', uid, doc);
      await add.mutateAsync({ docType: type, path });
    } catch (e) {
      Alert.alert(
        e instanceof UploadError ? t(e.reason === 'too_large' ? 'upload.too_large' : 'upload.permission_denied') : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} refreshing={docs.isRefetching} onRefresh={() => void docs.refetch()}>
      <BackRow title={t('vendor.documents')} />
      <AppText color={colors.text.secondary}>{t('vendor.documents_hint')}</AppText>

      <Card>
        <AppText weight="medium">{t('vendor.document_type')}</AppText>
        <View style={styles.chips}>
          {VENDOR_DOCUMENT_TYPES.map((d) => (
            <Chip key={d} label={t(`vendor.doc_types.${d}`)} selected={type === d} onPress={() => setType(d)} />
          ))}
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label={t('upload.take_photo')} icon="camera-outline" variant="secondary" compact loading={busy} onPress={() => void upload('camera')} />
          </View>
          <View style={styles.flex}>
            <Button label={t('upload.choose_file')} icon="document-attach-outline" variant="secondary" compact disabled={busy} onPress={() => void upload('file')} />
          </View>
        </View>
      </Card>

      {docs.isPending ? (
        <LoadingState />
      ) : docs.isError ? (
        <Banner tone="danger" message={errorMessage(docs.error)} />
      ) : (
        docs.data.map((d) => (
          <Card key={d.id}>
            <View style={styles.row}>
              <Ionicons
                name={d.status === 'approved' ? 'checkmark-circle' : d.status === 'rejected' ? 'close-circle' : 'time-outline'}
                size={24}
                color={d.status === 'approved' ? colors.status.success : d.status === 'rejected' ? colors.status.danger : colors.text.secondary}
              />
              <View style={styles.flex}>
                <AppText weight="bold">{t(`vendor.doc_types.${d.doc_type}`)}</AppText>
                <AppText variant="small" color={colors.text.secondary}>
                  {t(`vendor.doc_status.${d.status}`)}
                </AppText>
                {d.review_note && (
                  <AppText variant="small" color={colors.status.danger}>
                    {d.review_note}
                  </AppText>
                )}
              </View>
              {d.status === 'pending' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('address.delete')} ${t(`vendor.doc_types.${d.doc_type}`)}`}
                  hitSlop={10}
                  onPress={() =>
                    remove.mutate(d.id, {
                      onSuccess: () => void removeFile('vendor-documents', d.storage_path),
                      onError: (e) => Alert.alert(errorMessage(e)),
                    })
                  }
                >
                  <Ionicons name="trash-outline" size={22} color={colors.status.danger} />
                </Pressable>
              )}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
