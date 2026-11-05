import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface SessionState {
  session: Session | null;
  /** false until the stored session has been read on launch. */
  ready: boolean;
}

export const useSession = create<SessionState>(() => ({ session: null, ready: false }));

let started = false;
/** Wire Supabase auth events into the store. Called once from the root layout. */
export function startSessionListener() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => useSession.setState({ session: data.session, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => useSession.setState({ session, ready: true }));
}
