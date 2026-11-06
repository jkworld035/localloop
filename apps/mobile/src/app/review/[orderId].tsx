import { colors, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { StarRating } from '@/components/StarRating';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { useReviewState, useSubmitReviews, type ReviewInput } from '@/features/reviews/api';
import { errorMessage } from '@/lib/errors';

/** Rate a delivered order: the shop (with an optional comment), the delivery partner and each product. */
export default function RateOrder() {
  const { t } = useTranslation();
  const { orderId, storeName } = useLocalSearchParams<{ orderId: string; storeName?: string }>();
  const state = useReviewState(orderId);
  const submit = useSubmitReviews(orderId);
  const [store, setStore] = useState(0);
  const [comment, setComment] = useState('');
  const [partner, setPartner] = useState(0);
  const [products, setProducts] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  // Show what was already rated.
  useEffect(() => {
    if (!state.data) return;
    if (state.data.store) setStore(state.data.store.rating);
    if (state.data.partner) setPartner(state.data.partner.rating);
    setProducts(Object.fromEntries(state.data.products.filter((p) => p.rating).map((p) => [p.product_id, p.rating!])));
  }, [state.data]);

  if (state.isPending) return <LoadingState />;
  if (state.isError)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <ErrorState error={state.error} onRetry={() => void state.refetch()} />
      </Screen>
    );
  const s = state.data;

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.thanks}>
          <AppText variant="heading" weight="bold" align="center" accessibilityRole="header">
            {t('reviews.thanks_title')}
          </AppText>
          <AppText align="center" color={colors.text.secondary}>
            {t('reviews.thanks_body')}
          </AppText>
          <Button label={t('common.done')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const pending: ReviewInput[] = [
    ...(!s.store && store ? [{ target: 'store' as const, rating: store, body: comment.trim() }] : []),
    ...(s.has_partner && !s.partner && partner ? [{ target: 'delivery_partner' as const, rating: partner }] : []),
    ...s.products
      .filter((p) => !p.rating && products[p.product_id])
      .map((p) => ({ target: 'product' as const, rating: products[p.product_id]!, productId: p.product_id })),
  ];

  return (
    <Screen edges={['top', 'bottom']}>
      <BackRow title={t('reviews.title')} />
      {!s.can_review && <Banner tone="info" message={t('reviews.window_closed')} />}

      <Card>
        <AppText variant="title" weight="bold">
          {t('reviews.store_question', { store: storeName ?? '' })}
        </AppText>
        <StarRating value={store} onChange={s.store || !s.can_review ? undefined : setStore} label={t('reviews.store')} />
        {s.store ? (
          !!s.store.body && <AppText color={colors.text.secondary}>“{s.store.body}”</AppText>
        ) : (
          s.can_review && (
            <TextField label={t('reviews.comment')} optional hint={t('reviews.comment_hint')} value={comment} onChangeText={setComment} maxLength={1000} multiline />
          )
        )}
      </Card>

      {s.has_partner && (
        <Card>
          <AppText variant="title" weight="bold">
            {t('reviews.partner_question', { name: s.partner_name ?? '' })}
          </AppText>
          <StarRating value={partner} onChange={s.partner || !s.can_review ? undefined : setPartner} label={t('reviews.partner')} />
        </Card>
      )}

      {s.products.length > 0 && (
        <Card>
          <AppText variant="title" weight="bold">
            {t('reviews.products')}
          </AppText>
          {s.products.map((p) => (
            <View key={p.product_id} style={styles.product}>
              <AppText weight="medium">{p.name}</AppText>
              <StarRating
                size={28}
                value={products[p.product_id] ?? 0}
                onChange={p.rating || !s.can_review ? undefined : (v) => setProducts((m) => ({ ...m, [p.product_id]: v }))}
                label={p.name}
              />
            </View>
          ))}
        </Card>
      )}

      {submit.isError && <Banner tone="danger" message={errorMessage(submit.error)} />}
      {s.can_review && (
        <Button
          label={t('reviews.submit')}
          icon="star"
          disabled={pending.length === 0}
          loading={submit.isPending}
          onPress={() => submit.mutate(pending, { onSuccess: () => setDone(true) })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  product: { gap: spacing.xs, paddingVertical: spacing.xs },
  thanks: { flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxxl },
});
