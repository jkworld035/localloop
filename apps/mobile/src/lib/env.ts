/**
 * Public runtime configuration. EXPO_PUBLIC_* values are inlined at build
 * time. A missing value is surfaced as a configuration screen (see
 * app/_layout.tsx) instead of a crash or a silent fake backend.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const missingEnv = (Object.entries(env) as [keyof typeof env, string][])
  .filter(([, v]) => !v)
  .map(([k]) => ({ supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL', supabaseAnonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY' })[k]);

export const isConfigured = missingEnv.length === 0;
