import type { SelfSelectableRole, Tables } from '@localloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import i18n, { type AppLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/services/push';
import { stopPartnerTracking } from '@/services/partner-tracking';
import { usePreferences } from '@/stores/preferences';
import { useSession } from '@/stores/session';

export type Profile = Tables<'profiles'>;

export function useUserId() {
  return useSession((s) => s.session?.user.id ?? null);
}

export function useProfile() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', uid!).single()),
  });
}

export function useChooseRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: SelfSelectableRole) => unwrap(await supabase.rpc('choose_role', { p_role: role })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

/** Switches UI language now, remembers it on the device, and stores it on the profile so pushes match. */
export function useSetLanguage() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lang: AppLanguage) => {
      usePreferences.getState().setLanguage(lang);
      await i18n.changeLanguage(lang);
      if (uid) unwrap(await supabase.from('profiles').update({ preferred_language: lang }).eq('id', uid).select('id'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await stopPartnerTracking().catch(() => undefined);
      await unregisterPush();
      await supabase.auth.signOut();
      qc.clear();
    },
  });
}
