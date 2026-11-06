import 'server-only';
import { redirect } from 'next/navigation';
import { adminError } from './errors';

/** Redirects back to `path` with a success or error message for <ActionResult>. */
export function back(path: string, result: { done?: string; error?: { message?: string } | string | null }): never {
  const url = new URL(path, 'http://x');
  if (result.error) url.searchParams.set('error', adminError(typeof result.error === 'string' ? { message: result.error } : result.error));
  else if (result.done) url.searchParams.set('done', result.done);
  redirect(url.pathname + url.search);
}

export const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
