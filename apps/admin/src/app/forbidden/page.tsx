import { signOut } from '../login/actions';

export const metadata = { title: 'No access' };

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-10">
      <h1 className="text-2xl font-bold">You don&apos;t have access to this page</h1>
      <p className="text-ink-2">Your admin role doesn&apos;t include this module. Ask a super admin if you need it.</p>
      <div className="flex gap-3">
        <a href="/" className="rounded-lg border border-forest px-4 py-2 font-medium text-forest">
          Go to overview
        </a>
        <form action={signOut}>
          <button className="rounded-lg px-4 py-2 font-medium text-bad">Sign out</button>
        </form>
      </div>
    </main>
  );
}
