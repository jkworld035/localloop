import { requireAdmin } from '@/lib/auth';
import { Notice, PageHeader } from '@/components/ui';
import { updateSetting } from './actions';

export const metadata = { title: 'Platform settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('settings');
  const { saved, error } = await searchParams;
  const { data, error: loadError } = await supabase.from('app_settings').select('*').order('key');

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Commercial and operational parameters used by the database functions. Changes apply immediately and are recorded in the audit log."
      />
      {saved && <Notice tone="ok">Saved {saved}.</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {loadError && <Notice tone="bad">Couldn&apos;t load settings: {loadError.message}</Notice>}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sunken text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Setting</th>
              <th scope="col" className="px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.key} className="border-t border-line align-top">
                <td className="px-4 py-4">
                  <p className="font-mono text-xs font-medium">{s.key}</p>
                  <p className="mt-1 text-ink-2">{s.description}</p>
                  {s.is_public && <p className="mt-1 text-xs text-green">Visible to apps</p>}
                </td>
                <td className="px-4 py-4">
                  <form action={updateSetting} className="flex gap-2">
                    <input type="hidden" name="key" value={s.key} />
                    <label className="flex-1">
                      <span className="sr-only">Value for {s.key}</span>
                      <input
                        name="value"
                        defaultValue={JSON.stringify(s.value)}
                        className="h-10 w-full min-w-28 rounded-lg border border-line px-3 font-mono text-sm"
                      />
                    </label>
                    <button className="h-10 rounded-lg border border-forest px-3 font-medium text-forest hover:bg-sunken">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
