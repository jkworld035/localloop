import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { LiveMap } from './LiveMap';

export const metadata = { title: 'Live map' };
export const dynamic = 'force-dynamic';

export default async function LivePage() {
  await requireAdmin('deliveries');
  return (
    <>
      <PageHeader
        title="Live map"
        description="Online delivery partners and every open order. Updates as orders change and refreshes positions every 10 seconds."
      />
      <LiveMap />
    </>
  );
}
