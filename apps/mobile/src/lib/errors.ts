import { errorCode } from '@localloop/shared';
import i18n from './i18n';

/** User-facing, translated message for any error from Supabase or the network. */
export function errorMessage(err: unknown): string {
  return i18n.t(`errors.${errorCode(err)}`);
}

/** Throws the PostgREST error so React Query sees a failure (supabase-js returns errors instead of throwing). */
export function unwrap<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}
