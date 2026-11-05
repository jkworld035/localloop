import { colors, radii, spacing, WEEKDAYS, type OpeningHours, type Weekday } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { AppText } from '@/components/ui';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Normalises "9" / "9:5" / "0930" into "09:00" / "09:05" / "09:30" where possible. */
function tidy(v: string): string {
  const digits = v.replace(/[^\d]/g, '');
  if (/^\d{1,2}$/.test(v.trim())) return `${digits.padStart(2, '0')}:00`;
  if (/^\d{3,4}$/.test(digits) && !v.includes(':')) return `${digits.slice(0, -2).padStart(2, '0')}:${digits.slice(-2)}`;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]!.padStart(2, '0')}` : v;
}

/** One opening range per day (the data model allows up to three; the common case is one). 24-hour times. */
export function HoursEditor({ value, onChange }: { value: OpeningHours; onChange: (h: OpeningHours) => void }) {
  const { t } = useTranslation();
  const set = (day: Weekday, range: { open: string; close: string } | null) =>
    onChange({ ...value, [day]: range ? [range] : [] });

  return (
    <View style={styles.root}>
      {WEEKDAYS.map((day) => {
        const range = value[day][0];
        const open = !!range;
        const bad = range && (!HHMM.test(range.open) || !HHMM.test(range.close) || range.open === range.close);
        return (
          <View key={day} style={styles.day}>
            <View style={styles.dayHead}>
              <AppText weight="medium" style={styles.dayName}>
                {t(`weekdays.${day}`)}
              </AppText>
              <Switch
                accessibilityLabel={`${t(`weekdays.${day}`)}: ${open ? t('common.open') : t('common.closed')}`}
                value={open}
                trackColor={{ true: colors.brand.green, false: colors.surface.borderStrong }}
                onValueChange={(on) => set(day, on ? { open: '09:00', close: '21:00' } : null)}
              />
              {!open && (
                <AppText variant="small" color={colors.text.secondary}>
                  {t('common.closed')}
                </AppText>
              )}
            </View>
            {range && (
              <View style={styles.times}>
                {(['open', 'close'] as const).map((k) => (
                  <TextInput
                    key={k}
                    accessibilityLabel={`${t(`weekdays.${day}`)} ${t(`vendor.hours_${k}`)}`}
                    value={range[k]}
                    onChangeText={(v) => set(day, { ...range, [k]: v })}
                    onBlur={() => set(day, { ...range, [k]: tidy(range[k]) })}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[styles.time, bad && styles.timeBad]}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(Object.fromEntries(WEEKDAYS.map((d) => [d, value.mon])) as OpeningHours)}
        hitSlop={8}
        style={styles.copy}
      >
        <AppText weight="bold" color={colors.brand.forest}>
          {t('vendor.copy_monday')}
        </AppText>
      </Pressable>
      <AppText variant="small" color={colors.text.secondary}>
        {t('vendor.hours_hint')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  day: { gap: spacing.xs, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surface.border },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  dayName: { width: 96 },
  times: { flexDirection: 'row', gap: spacing.md, paddingLeft: 96 + spacing.md },
  time: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.surface.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    color: colors.text.primary,
    backgroundColor: colors.surface.card,
    textAlign: 'center',
  },
  timeBad: { borderColor: colors.status.danger },
  copy: { minHeight: 44, justifyContent: 'center' },
});
