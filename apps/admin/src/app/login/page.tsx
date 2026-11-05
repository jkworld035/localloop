import { signIn, type SignInError } from './actions';

const MESSAGES: Record<SignInError, string> = {
  invalid: 'Email or password is incorrect.',
  unconfirmed: 'This account’s email isn’t confirmed yet. Confirm it in Supabase → Authentication → Users.',
  network:
    'The dashboard server can’t reach Supabase. Check your internet connection. Some Indian networks block supabase.co — try another network or Cloudflare WARP.',
  forbidden: 'This account is not an administrator.',
  unknown: 'Sign-in failed for an unexpected reason. Check the server log and try again.',
};

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={signIn} className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-medium text-green">LocalLoop</p>
          <h1 className="text-2xl font-bold">Admin sign in</h1>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
            {MESSAGES[(error in MESSAGES ? error : 'unknown') as SignInError]}
          </p>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="h-12 w-full rounded-lg border border-line px-3 text-base outline-none focus:border-forest"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="current-password"
            className="h-12 w-full rounded-lg border border-line px-3 text-base outline-none focus:border-forest"
          />
        </label>
        <button type="submit" className="h-12 w-full rounded-lg bg-forest font-medium text-white hover:bg-green">
          Sign in
        </button>
      </form>
    </main>
  );
}
