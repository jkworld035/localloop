import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { Badge, btnPrimary, Empty, PageHeader, Table } from '@/components/ui';
import { ist } from '@/lib/format';

export const metadata = { title: 'Delivery areas' };
export const dynamic = 'force-dynamic';

export type AdminArea = {
  id: string;
  name: string;
  city: string;
  state: string;
  is_active: boolean;
  latitude: number;
  longitude: number;
  radius_km: number;
  boundary: { type: 'MultiPolygon'; coordinates: number[][][][] } | null;
  area_km2: number;
  stores_total: number;
  stores_live: number;
  updated_at: string;
};

export default async function AreasPage() {
  const { supabase } = await requireAdmin('areas');
  const { data } = await supabase.rpc('admin_areas');
  const areas = (data ?? []) as unknown as AdminArea[];
  return (
    <>
      <PageHeader
        title="Delivery areas"
        description="Where LocalLoop works. Customers outside every active area see “not available here yet”; shops are listed only inside an active area."
      />
      <p className="mb-4">
        <Link href="/areas/new" className={`${btnPrimary} inline-flex items-center`}>
          New area
        </Link>
      </p>
      {!areas.length ? (
        <Empty>No areas yet.</Empty>
      ) : (
        <Table head={['Area', 'Shape', 'Size', 'Shops', 'State', 'Updated']}>
          {areas.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="px-4 py-3">
                <Link href={`/areas/${a.id}`} className="font-medium text-forest hover:underline">
                  {a.name}
                </Link>
                <p className="text-xs text-ink-2">
                  {a.city}, {a.state}
                </p>
              </td>
              <td className="px-4 py-3">{a.boundary ? 'Drawn boundary' : `${Number(a.radius_km)} km circle`}</td>
              <td className="px-4 py-3 tabular-nums">{a.area_km2} km²</td>
              <td className="px-4 py-3">
                {a.stores_live} live <span className="text-ink-2">/ {a.stores_total} total</span>
              </td>
              <td className="px-4 py-3">{a.is_active ? <Badge tone="ok">active</Badge> : <Badge>off</Badge>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{ist(a.updated_at, 'date')}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
