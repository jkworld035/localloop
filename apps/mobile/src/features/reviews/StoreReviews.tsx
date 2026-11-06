import { colors, spacing } from '@localloop/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { StarRating } from '@/components/StarRating';
import { AppText, Button, Card } from '@/components/ui';
import { useUserId } from '@/features/account/api';
import { useReportReview, useStoreReviews } from './api';

const REPORT_REASONS = ['not_about_shop', 'abusive', 'spam'] as const;

/** Recent published reviews at the foot of a shop page. */
export function StoreReviews({ storeId }: { storeId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te-IN' : 'en-IN';
  const reviews = useStoreReviews(storeId);
  const uid = useUserId();
  const report = useReportReview();
  const [reported, setReported] = useState<Set<string>>(new Set());

  if (!reviews.data?.length) return null;

  const askReport = (reviewId: string) =>
    Alert.alert(t('reviews.report_title'), t('reviews.report_body'), [
      ...REPORT_REASONS.map((r) => ({
        text: t(`reviews.report_reasons.${r}`),
        onPress: () =>
          report.mutate(
            { reviewId, reason: r, reporterId: uid! },
            { onSuccess: () => setReported((s) => new Set(s).add(reviewId)) },
          ),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);

  return (
    <View style={styles.root}>
      <AppText variant="title" weight="bold" accessibilityRole="header">
        {t('reviews.store_reviews')}
      </AppText>
      {reviews.data.map((r) => (
        <Card key={r.id}>
          <View style={styles.row}>
            <StarRating value={r.rating} label={r.author ?? t('reviews.customer')} size={18} />
            <AppText variant="caption" color={colors.text.secondary}>
              {new Date(r.created_at).toLocaleDateString(lang, { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}
            </AppText>
          </View>
          {!!r.body && <AppText>{r.body}</AppText>}
          <View style={styles.row}>
            <AppText variant="small" color={colors.text.secondary}>
              {r.author ?? t('reviews.customer')} · {t('reviews.verified')}
            </AppText>
            {uid &&
              (reported.has(r.id) ? (
                <AppText variant="small" color={colors.text.secondary}>
                  {t('reviews.reported')}
                </AppText>
              ) : (
                <Button label={t('reviews.report')} variant="ghost" compact onPress={() => askReport(r.id)} />
              ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
