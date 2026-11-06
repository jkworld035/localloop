import { requireAdmin } from '@/lib/auth';
import { ActionResult, Badge, btnDanger, btnSecondary, inputCls, PageHeader, Section, Table } from '@/components/ui';
import { ist, label } from '@/lib/format';
import { changeRole } from './actions';
import { InviteForm } from './InviteForm';

export const metadata = { title: 'Admin team' };
export const dynamic = 'force-dynamic';

type Member = { id: string; admin_role: string; name: string | null; email: string | null; is_active: boolean; must_change_password: boolean; granted_by: string | null; created_at: string; is_me: boolean };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('admins');
  const sp = await searchParams;
  const { data } = await supabase.rpc('admin_team');
  const team = (data ?? []) as unknown as Member[];

  return (
    <>
      <PageHeader title="Admin team" description="Who can use this admin panel and what each person can do. Every change is recorded in the audit log." />
      <ActionResult {...sp} />
      <Section title="Add someone">
        <InviteForm />
      </Section>
      <Section title="Team" count={team.length}>
        <Table head={['Person', 'Role', 'Added', 'Change']}>
          {team.map((m) => (
            <tr key={m.id} className="border-t border-line align-top">
              <td className="px-4 py-3">
                <p className="font-medium">
                  {m.name ?? '—'} {m.is_me && <span className="text-ink-2">(you)</span>}
                </p>
                <p className="text-xs text-ink-2">{m.email}</p>
                {m.must_change_password && (
                  <span className="mt-1 inline-block">
                    <Badge tone="warn">hasn’t signed in yet</Badge>
                  </span>
                )}
              </td>
              <td className="px-4 py-3 capitalize">{label(m.admin_role)}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">
                {ist(m.created_at, 'date')}
                {m.granted_by && <p className="text-ink-2">by {m.granted_by}</p>}
              </td>
              <td className="px-4 py-3">
                {m.is_me ? (
                  <span className="text-xs text-ink-2">Another super admin can change your role.</span>
                ) : (
                  <form action={changeRole} className="flex flex-wrap gap-2">
                    <input type="hidden" name="user_id" value={m.id} />
                    <label>
                      <span className="sr-only">New role for {m.name ?? m.email}</span>
                      <select name="role" defaultValue={m.admin_role} className={inputCls}>
                        <option value="support">Support</option>
                        <option value="operations">Operations</option>
                        <option value="finance">Finance</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <button className={btnSecondary}>Save</button>
                    <button name="remove" value="1" className={btnDanger}>
                      Remove
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
