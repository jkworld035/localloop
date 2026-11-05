import { colors, typography } from '@localloop/shared';
import { Text, type TextProps, type TextStyle } from 'react-native';

type Variant = keyof typeof typography.size;
type Weight = 'regular' | 'medium' | 'bold';

const TELUGU = /[ఀ-౿]/;

/** Picks the Telugu face when the string contains Telugu script, so mixed EN/TE content renders correctly. */
export function fontFor(text: string, weight: Weight): string {
  const te = TELUGU.test(text);
  const f = typography.family;
  if (weight === 'bold') return te ? f.teluguBold : f.latinBold;
  if (weight === 'medium') return te ? f.teluguMedium : f.latinMedium;
  return te ? f.telugu : f.latin;
}

function flatten(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flatten).join('');
  return '';
}

export interface AppTextProps extends TextProps {
  variant?: Variant;
  weight?: Weight;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', weight = 'regular', color = colors.text.primary, align, style, children, ...rest }: AppTextProps) {
  return (
    <Text
      // Respect the user's system font size (accessibility), but cap growth so layouts don't break.
      maxFontSizeMultiplier={1.6}
      style={[
        {
          fontFamily: fontFor(flatten(children), weight),
          fontSize: typography.size[variant],
          lineHeight: typography.lineHeight[variant],
          color,
          textAlign: align,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
