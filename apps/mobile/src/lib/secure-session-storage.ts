import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted storage for the Supabase session.
 *
 * Sessions exceed SecureStore's ~2 KB value limit, so the session JSON is
 * AES-256-CTR encrypted with a per-key random secret that lives in the
 * Keychain/Keystore (SecureStore), and only the ciphertext goes to
 * AsyncStorage. A copied AsyncStorage dump is useless without the device
 * keystore. Pattern from Supabase's React Native auth guide.
 */
export class SecureSessionStorage {
  private keyName(key: string) {
    // SecureStore keys allow only [A-Za-z0-9._-]
    return `ll_${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  }

  private async encrypt(key: string, value: string): Promise<string> {
    const secret = getRandomBytes(32);
    const cipher = new aesjs.ModeOfOperation.ctr(secret, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(this.keyName(key), aesjs.utils.hex.fromBytes(secret));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const secretHex = await SecureStore.getItemAsync(this.keyName(key));
    if (!secretHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(secretHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      return null; // corrupted or key lost (e.g. restored backup) → sign in again
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await this.encrypt(key, value));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(this.keyName(key));
  }
}
