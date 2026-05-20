"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";

type AuthClient = ReturnType<typeof createBrowserClient>;

let authSingleton: AuthClient | null = null;
let dataSingleton: SupabaseClient | null = null;

export function createAuthClient(): AuthClient {
  if (!authSingleton) {
    authSingleton = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_AUTH_ANON_KEY!,
    );
  }
  return authSingleton;
}

export function createDataClient(): SupabaseClient {
  if (!dataSingleton) {
    dataSingleton = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_DATA_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_DATA_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        accessToken: async () => {
          const auth = createAuthClient();
          const { data } = await auth.auth.getSession();
          return data.session?.access_token ?? null;
        },
      },
    );
  }
  return dataSingleton;
}
