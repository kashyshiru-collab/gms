function getProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
}

export function getSupabaseUrl() {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    getProcessEnv("SUPABASE_URL") ||
    getProcessEnv("VITE_SUPABASE_URL")
  );
}

export function getSupabasePublishableKey() {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    getProcessEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getProcessEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
  );
}
