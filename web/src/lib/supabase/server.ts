import { createServerClient } from "@supabase/ssr";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_AUTH_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll can be called from a Server Component, where cookies
            // are read-only. The proxy refreshes sessions on every request.
          }
        },
      },
    },
  );
}

export async function createDataClient(): Promise<SupabaseClient> {
  const auth = await createAuthClient();
  const {
    data: { session },
  } = await auth.auth.getSession();
  const token = session?.access_token;

  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_DATA_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_DATA_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
    },
  );
}

export async function createServiceDataClient(): Promise<SupabaseClient> {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_DATA_URL!,
    process.env.SUPABASE_DATA_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
