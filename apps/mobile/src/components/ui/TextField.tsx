import { colors, radii, spacing, touchTarget, typography } from '@localloop/shared';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { AppText, fontFor } from './AppText';

export interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  /** i18n key (from zod) or a ready message. */
  error?: string;
  optional?: boolean;
  prefix?: string;
}

/** Labelled input with hint and error, wired for screen readers. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, optional, prefix, value, style, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const message = error ? (error.includes('.') ? t(error) : error) : undefined;
  const borderColor = message ? colors.status.danger : focused ? colors.brand.forest : colors.surface.borderStrong;

  return (
    <View style={styles.root}>
      <AppText weight="medium">
        {label}
        {optional ? ` (${t('common.optional')})` : ''}
      </AppText>
      <View style={[styles.box, { borderColor }]}>
        {prefix && (
          <AppText variant="bodyLarge" color={colors.text.secondary}>
            {prefix}
          </AppText>
        )}
        <TextInput
          ref={ref}
          value={value}
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: rest.editable === false }}
          placeholderTextColor={colors.text.muted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          maxFontSizeMultiplier={1.6}
          style={[styles.input, { fontFamily: fontFor(value ?? '', 'regular') }, style]}
          {...rest}
        />
      </View>
      {message ? (
        <AppText variant="small" color={colors.status.danger} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {message}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color={colors.text.secondary}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget.comfortable,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface.card,
  },
  input: { flex: 1, fontSize: typography.size.bodyLarge, color: colors.text.primary, paddingVertical: spacing.md },
});
