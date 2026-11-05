import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { pickImage, UploadError, uploadPhoto, type Bucket } from '@/services/upload';

/** "Take photo / Choose from gallery" → compress → upload. Resolves the storage path via onUploaded. */
export function usePhotoPicker() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async (source: 'camera' | 'library', bucket: Bucket, folder: string, aspect: [number, number] | undefined, onUploaded: (path: string) => void | Promise<void>) => {
    try {
      const uri = await pickImage(source, aspect);
      if (!uri) return;
      setBusy(true);
      await onUploaded(await uploadPhoto(bucket, folder, uri));
    } catch (e) {
      Alert.alert(e instanceof UploadError && e.reason === 'permission_denied' ? t('upload.permission_denied') : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (bucket: Bucket, folder: string, onUploaded: (path: string) => void | Promise<void>, aspect?: [number, number]) => {
    const options = [t('upload.take_photo'), t('upload.choose_photo'), t('common.cancel')];
    const handle = (i: number) => {
      if (i === 0) void run('camera', bucket, folder, aspect, onUploaded);
      if (i === 1) void run('library', bucket, folder, aspect, onUploaded);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, handle);
    else
      Alert.alert(t('upload.add_photo'), undefined, [
        { text: options[0]!, onPress: () => handle(0) },
        { text: options[1]!, onPress: () => handle(1) },
        { text: options[2]!, style: 'cancel' },
      ]);
  };

  return { choose, busy };
}
