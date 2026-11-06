'use client';

import { useActionState } from 'react';
import { setPassword } from './actions';

/** Change password — required at first sign-in for staff added with a one-time password; available to every admin. */
export default function PasswordPage() {
  const [error, action, pending] = useActionState<string | null, FormData>(setPassword, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-xl font-bold text-forest">LocalLoop admin</p>
        <h1 className="mt-4 text-2xl font-bold">Choose your password</h1>
        <p className="mt-1 text-ink-2">At least 12 characters, with letters and a number. Don’t reuse a password from another site.</p>
      </div>
      <form action={action} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">New password</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={12} className="h-12 w-full rounded-lg border border-line bg-white px-3" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Repeat it</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={12} className="h-12 w-full rounded-lg border border-line bg-white px-3" />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
        <button disabled={pending} className="h-12 w-full rounded-lg bg-forest font-medium text-white hover:bg-green disabled:opacity-60">
          {pending ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </main>
  );
}
