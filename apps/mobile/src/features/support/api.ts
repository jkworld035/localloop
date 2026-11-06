import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUserId } from '@/features/account/api';

export const TICKET_CATEGORIES = ['order', 'delivery', 'payment', 'refund', 'store', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export function useMyTickets() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['tickets', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('support_tickets')
          .select('id, subject, category, status, updated_at, order:orders(order_number)')
          .eq('user_id', uid!)
          .order('updated_at', { ascending: false })
          .limit(50),
      ),
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    // No Realtime on support messages; a light poll keeps an open conversation current.
    refetchInterval: 20_000,
    queryFn: async () => {
      const ticket = unwrap(
        await supabase.from('support_tickets').select('id, subject, category, status, created_at, order:orders(id, order_number)').eq('id', id).single(),
      );
      const messages = unwrap(
        await supabase.from('support_messages').select('id, body, is_staff, created_at').eq('ticket_id', id).order('created_at'),
      );
      return { ticket, messages };
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { category: TicketCategory; subject: string; body: string; orderId?: string }) =>
      unwrap(
        await supabase.rpc('create_support_ticket', {
          p_category: v.category,
          p_subject: v.subject,
          p_body: v.body,
          p_order_id: v.orderId,
        }),
      ) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => unwrap(await supabase.rpc('reply_support_ticket', { p_ticket_id: id, p_body: body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ticket', id] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
