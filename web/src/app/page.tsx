import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function Home() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <AppShell userEmail={user.email ?? ""} />;
}
