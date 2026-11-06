import { colors, radii, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { useReplyTicket, useTicket } from '@/features/support/api';
import { errorMessage } from '@/lib/errors';

export default function TicketThread() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te-IN' : 'en-IN';
  const { id } = useLocalSearchParams<{ id: string }>();
  const thread = useTicket(id);
  const reply = useReplyTicket(id);
  const [body, setBody] = useState('');

  if (thread.isPending) return <LoadingState />;
  if (thread.isError)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
      </Screen>
    );

  const { ticket, messages } = thread.data;
  const closed = ticket.status === 'closed';
  const send = () => reply.mutate(body.trim(), { onSuccess: () => setBody('') });

  return (
    <Screen edges={['top', 'bottom']} refreshing={thread.isRefetching} onRefresh={() => void thread.refetch()}>
      <BackRow title={ticket.subject} />
      <AppText variant="small" color={colors.text.secondary}>
        {t(`support.categories.${ticket.category}`)} · {t(`support.status.${ticket.status}`)}
      </AppText>
      {ticket.order && (
        <Button
          label={t('support.view_order', { order: ticket.order.order_number })}
          variant="ghost"
          compact
          icon="receipt-outline"
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: ticket.order!.id } })}
        />
      )}
      <View style={styles.thread} accessibilityRole="list">
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.is_staff ? styles.staff : styles.mine]}>
            <AppText variant="caption" weight="bold" color={m.is_staff ? colors.text.onBrand : colors.text.secondary}>
              {m.is_staff ? t('support.team') : t('support.you')}
            </AppText>
            <AppText color={m.is_staff ? colors.text.onBrand : colors.text.primary}>{m.body}</AppText>
            <AppText variant="caption" color={m.is_staff ? colors.text.onBrand : colors.text.secondary}>
              {new Date(m.created_at).toLocaleString(lang, { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
            </AppText>
          </View>
        ))}
      </View>
      {messages.every((m) => !m.is_staff) && <Banner tone="info" message={t('support.reply_time')} />}
      {closed ? (
        <Banner tone="info" message={t('support.closed_hint')} actionLabel={t('support.new')} onAction={() => router.replace('/support/new')} />
      ) : (
        <>
          <TextField label={t('support.reply')} value={body} onChangeText={setBody} maxLength={4000} multiline />
          {reply.isError && <Banner tone="danger" message={errorMessage(reply.error)} />}
          <Button label={t('support.send')} icon="send" disabled={!body.trim()} loading={reply.isPending} onPress={send} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thread: { gap: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radii.lg, gap: spacing.xs, maxWidth: '88%' },
  staff: { backgroundColor: colors.brand.forest, alignSelf: 'flex-start' },
  mine: { backgroundColor: colors.surface.card, alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.surface.border },
});
