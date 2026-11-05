/** Public configuration. The admin app needs no server secrets: all access goes through RLS as the signed-in admin. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
