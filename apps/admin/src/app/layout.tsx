import type { Metadata } from 'next';
import { isConfigured } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'LocalLoop Admin', template: '%s · LocalLoop Admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;700&family=Noto+Sans+Telugu:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {isConfigured ? (
          children
        ) : (
          <main className="mx-auto max-w-xl p-10">
            <h1 className="text-2xl font-bold">LocalLoop Admin isn&apos;t configured</h1>
            <p className="mt-3 text-ink-2">
              Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local (see docs/setup.md).
            </p>
          </main>
        )}
      </body>
    </html>
  );
}
