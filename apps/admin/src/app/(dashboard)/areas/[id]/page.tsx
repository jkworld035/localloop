import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { ActionResult, PageHeader } from '@/components/ui';
import type { AdminArea } from '../page';
import { AreaEditor, type StorePoint } from './AreaEditor';

export const metadata = { title: 'Edit delivery area' };
export const dynamic = 'force-dynamic';

export default async function AreaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('areas');
  const { id } = await params;
  const sp = await searchParams;
  const [{ data: areas }, { data: stores }] = await Promise.all([supabase.rpc('admin_areas'), supabase.rpc('admin_store_points')]);
  const all = (areas ?? []) as unknown as AdminArea[];
  const area = id === 'new' ? null : all.find((a) => a.id === id);
  if (id !== 'new' && !area) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/areas" className="text-forest hover:underline">
          ← Delivery areas
        </Link>
      </p>
      <PageHeader title={area ? area.name : 'New delivery area'} description="Use a simple circle, or draw the exact boundary by clicking points on the map. Shops inside turn green as you edit." />
      <ActionResult {...sp} />
      <AreaEditor area={area ?? null} others={all.filter((a) => a.id !== id)} stores={(stores ?? []) as unknown as StorePoint[]} />
    </>
  );
}
