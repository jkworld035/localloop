import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/lib/supabase';

/**
 * Photos and documents for shops, products and verification.
 *
 * Images are resized to at most 1600 px and re-encoded as JPEG (~75%) on the
 * phone before upload — a 4 MB camera photo becomes ~250 KB, which matters on
 * mobile data. Paths start with the owning id so Storage policies can check
 * ownership (see migration …0012).
 */

export type Bucket = 'avatars' | 'store-media' | 'product-media' | 'vendor-documents' | 'partner-documents';

export class UploadError extends Error {
  constructor(public readonly reason: 'permission_denied' | 'too_large' | 'failed') {
    super(reason);
  }
}

const MAX_DOC_BYTES = 10 * 1024 * 1024; // matches the bucket limit

/** Returns a local URI, or null if the user cancelled. */
export async function pickImage(source: 'camera' | 'library', aspect?: [number, number]): Promise<string | null> {
  const perm =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new UploadError('permission_denied');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: !!aspect, aspect, quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  return res.assets[0].uri;
}

async function compress(uri: string, maxWidth: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const rendered = await context.renderAsync();
  if (rendered.width > maxWidth) context.resize({ width: maxWidth });
  const image = rendered.width > maxWidth ? await context.renderAsync() : rendered;
  const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return saved.uri;
}

async function put(bucket: Bucket, path: string, uri: string, contentType: string): Promise<string> {
  const body = await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

/** Compresses and uploads a photo under `<ownerFolder>/…`. Returns the storage path. */
export async function uploadPhoto(bucket: Bucket, ownerFolder: string, uri: string, maxWidth = 1600): Promise<string> {
  const jpeg = await compress(uri, maxWidth);
  return put(bucket, `${ownerFolder}/${randomUUID()}.jpg`, jpeg, 'image/jpeg');
}

/** Lets the user choose a PDF or image; null if cancelled. */
export async function pickDocument(): Promise<{ uri: string; name: string; mimeType: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  if (a.size != null && a.size > MAX_DOC_BYTES) throw new UploadError('too_large');
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' };
}

/** Uploads a verification document (images are compressed; PDFs go as-is). */
export async function uploadDocument(bucket: 'vendor-documents' | 'partner-documents', ownerId: string, doc: { uri: string; mimeType: string }) {
  if (doc.mimeType.startsWith('image/')) return uploadPhoto(bucket, ownerId, doc.uri, 2000);
  return put(bucket, `${ownerId}/${randomUUID()}.pdf`, doc.uri, 'application/pdf');
}

export async function removeFile(bucket: Bucket, path: string) {
  await supabase.storage.from(bucket).remove([path]);
}
