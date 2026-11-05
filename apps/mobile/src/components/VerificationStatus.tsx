import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type VerificationStatus as Status } from '@localloop/shared';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Card } from './ui';

/** Pending / rejected / suspended explanation for vendors and partners. */
export function VerificationStatus({
  status,
  reason,
  titles,
  pendingBody,
}: {
  status: Exclude<Status, 'approved'>;
  reason: string | null;
  titles: Record<Exclude<Status, 'approved'>, string>;
  pendingBody: string;
}) {
  const icon = status === 'pending' ? 'hourglass-outline' : status === 'rejected' ? 'create-outline' : 'ban-outline';
  return (
    <Card>
      <View style={styles.row}>
        <Ionicons name={icon} size={32} color={status === 'pending' ? colors.brand.forest : colors.status.danger} />
        <AppText variant="title" weight="bold" style={styles.flex}>
          {titles[status]}
        </AppText>
      </View>
      {status === 'pending' ? (
        <AppText color={colors.text.secondary}>{pendingBody}</AppText>
      ) : (
        reason && <Banner tone="danger" message={reason} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
