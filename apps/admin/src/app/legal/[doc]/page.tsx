import { LEGAL_DOCS, type LegalDocId } from '@localloop/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/** Public policy pages for the app stores and the website. Same text as the in-app Legal screens. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = LEGAL_DOCS[(await params).doc as LegalDocId];
  return { title: { absolute: d ? `${d.title} · LocalLoop` : 'LocalLoop' }, description: d?.summary, robots: { index: true, follow: true } };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = LEGAL_DOCS[(await params).doc as LegalDocId];
  if (!d) notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 leading-relaxed">
      <p className="mb-6 text-xl font-bold text-forest">LocalLoop</p>
      <h1 className="text-3xl font-bold">{d.title}</h1>
      <p className="mt-2 text-ink-2">{d.summary}</p>
      {d.sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-bold">{s.heading}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-3">
              {p}
            </p>
          ))}
        </section>
      ))}
      <nav aria-label="Policies" className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-sm">
        {(Object.keys(LEGAL_DOCS) as LegalDocId[]).map((k) => (
          <a key={k} href={`/legal/${k}`} className="font-medium text-forest hover:underline">
            {LEGAL_DOCS[k].title}
          </a>
        ))}
      </nav>
    </main>
  );
}
