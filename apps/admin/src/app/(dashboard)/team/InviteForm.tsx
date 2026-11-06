'use client';

import { useActionState } from 'react';
import { btnPrimary, inputCls } from '@/components/ui';
import { inviteAdmin, type InviteState } from './actions';

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAdmin, null);
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 rounded-2xl border border-line bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Name</span>
          <input name="name" required minLength={2} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Work email</span>
          <input name="email" type="email" required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Role</span>
          <select name="role" defaultValue="support" className={inputCls}>
            <option value="support">Support — orders, tickets, reviews</option>
            <option value="operations">Operations — shops, partners, areas, catalogue</option>
            <option value="finance">Finance — payments, payouts, coupons</option>
            <option value="super_admin">Super admin — everything incl. team & settings</option>
          </select>
        </label>
        <div className="flex items-end">
          <button disabled={pending} className={btnPrimary}>
            {pending ? 'Adding…' : 'Add to team'}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {state?.error && <p className="rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">{state.error}</p>}
        {state?.email && state.tempPassword && (
          <div className="rounded-2xl border-2 border-amber bg-white p-5 text-sm">
            <p className="font-bold">{state.email} can now sign in at this admin site.</p>
            <p className="mt-2">One-time password (shown only now — tell them by phone or in person, not by email or chat):</p>
            <p className="my-3 select-all rounded-lg bg-sunken px-4 py-3 font-mono text-lg tracking-wider">{state.tempPassword}</p>
            <p className="text-ink-2">They’ll be asked to choose their own password the first time they sign in.</p>
          </div>
        )}
        {state?.email && !state.tempPassword && (
          <p className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok">{state.email} already had an account and now has admin access with their existing password.</p>
        )}
      </div>
    </div>
  );
}
