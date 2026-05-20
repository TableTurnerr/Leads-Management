import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
