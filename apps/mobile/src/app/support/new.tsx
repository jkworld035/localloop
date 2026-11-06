import { colors, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Chip, Screen, TextField } from '@/components/ui';
import { TICKET_CATEGORIES, useCreateTicket, type TicketCategory } from '@/features/support/api';
import { errorMessage } from '@/lib/errors';

/** New help request. Opened from an order it carries the order along. */
export default function NewTicket() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string }>();
  const [category, setCategory] = useState<TicketCategory>(params.orderId ? 'order' : 'other');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const create = useCreateTicket();
  const valid = subject.trim().length >= 3 && body.trim().length >= 10;

  const submit = () =>
    create.mutate(
      { category, subject: subject.trim(), body: body.trim(), orderId: params.orderId },
      { onSuccess: (id) => router.replace({ pathname: '/support/[id]', params: { id } }) },
    );

  return (
    <Screen edges={['top', 'bottom']}>
      <BackRow title={t('support.new')} />
      {params.orderNumber && <Banner tone="info" message={t('support.about_order', { order: params.orderNumber })} />}
      <AppText weight="medium">{t('support.topic')}</AppText>
      <View style={styles.chips}>
        {TICKET_CATEGORIES.map((c) => (
          <Chip key={c} label={t(`support.categories.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <TextField label={t('support.subject')} value={subject} onChangeText={setSubject} maxLength={140} />
      <TextField label={t('support.message')} hint={t('support.message_hint')} value={body} onChangeText={setBody} maxLength={4000} multiline numberOfLines={5} />
      {create.isError && <Banner tone="danger" message={errorMessage(create.error)} />}
      <Button label={t('support.send')} icon="send" disabled={!valid} loading={create.isPending} onPress={submit} />
      <AppText variant="small" color={colors.text.secondary}>
        {t('support.reply_time')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
