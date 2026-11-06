import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

export function useNotifications() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['notifications', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase.from('notifications').select('id, type, data, read_at, created_at').order('created_at', { ascending: false }).limit(100),
      ),
  });
}

export function useUnreadCount() {
  const uid = useUserId();
  const qc = useQueryClient();
  // New notifications arrive live (the table is in the Realtime publication, rows are owner-only by RLS).
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, qc]);
  return useQuery({
    queryKey: ['notifications-unread', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkAllRead() {
  const uid = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid!).is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}
