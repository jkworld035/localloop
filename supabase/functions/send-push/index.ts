// send-push — delivers in-app notifications as Expo push notifications.
//
// Invoked by the notifications_dispatch_push trigger (pg_net) with
// { notification_id }, or with an empty body as a sweep that retries anything
// unsent from the last 24 h. Service-role only.
//
// Secrets: EXPO_ACCESS_TOKEN (optional; required if "enhanced push security"
// is on in the Expo project).
import { renderNotification } from '../_shared/notification-templates.ts';
import { adminClient, isServiceRequest, json } from '../_shared/supabase.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface Row {
  id: string;
  user_id: string;
  type: string;
  data: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (!isServiceRequest(req)) return json({ error: 'forbidden' }, 403);
  const db = adminClient();

  let notificationId: string | undefined;
  try {
    notificationId = (await req.json())?.notification_id;
  } catch {
    /* sweep mode */
  }

  let query = db.from('notifications').select('id, user_id, type, data').is('pushed_at', null);
  query = notificationId
    ? query.eq('id', notificationId)
    : query.gte('created_at', new Date(Date.now() - 86_400_000).toISOString()).order('created_at').limit(200);
  const { data: rows, error } = await query;
  if (error) return json({ error: 'lookup_failed' }, 500);
  if (!rows?.length) return json({ sent: 0 });

  const userIds = [...new Set((rows as Row[]).map((r) => r.user_id))];
  const [{ data: tokens }, { data: profiles }] = await Promise.all([
    db.from('push_tokens').select('token, user_id').in('user_id', userIds),
    db.from('profiles').select('id, preferred_language').in('id', userIds),
  ]);
  const langOf = new Map((profiles ?? []).map((p) => [p.id, p.preferred_language as 'en' | 'te']));

  const messages: Array<Record<string, unknown>> = [];
  const pushedIds: string[] = [];
  for (const row of rows as Row[]) {
    pushedIds.push(row.id); // mark even when the user has no device, so the sweep doesn't loop
    const rendered = renderNotification(row.type, row.data, langOf.get(row.user_id) ?? 'en');
    if (!rendered) continue;
    for (const t of (tokens ?? []).filter((t) => t.user_id === row.user_id)) {
      messages.push({
        to: t.token,
        title: rendered.title,
        body: rendered.body,
        channelId: rendered.channel,
        sound: 'default',
        priority: row.type === 'delivery_request' || row.type === 'new_order' ? 'high' : 'default',
        data: { notification_id: row.id, type: row.type, ...row.data },
      });
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) });
      const out = await res.json();
      (out?.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, idx: number) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(String(batch[idx]!.to));
        }
      });
    } catch (e) {
      console.error('expo_push_failed', String(e));
      return json({ error: 'push_failed' }, 502); // leave pushed_at null → retried by sweep
    }
  }

  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  await db.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', pushedIds);
  return json({ sent: messages.length, removed_tokens: deadTokens.length });
});
