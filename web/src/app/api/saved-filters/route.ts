import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type SavedFilterRow = {
  id: string;
  name: string;
  scope: "private" | "team";
  filters: unknown;
  user_id: string;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("saved_filters")
    .select("id, name, scope, filters, user_id, created_at")
    .order("scope", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], currentUserId: user.id });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    scope?: "private" | "team";
    filters?: unknown;
  } | null;

  const name = body?.name?.trim();
  const scope = body?.scope;
  const filters = body?.filters;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (scope !== "private" && scope !== "team") {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  if (!filters || typeof filters !== "object") {
    return NextResponse.json({ error: "Invalid filters payload" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("saved_filters")
    .insert({ user_id: user.id, name, scope, filters })
    .select("id, name, scope, filters, user_id, created_at")
    .single();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      {
        error: conflict
          ? `A ${scope} filter named "${name}" already exists.`
          : error.message,
      },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({ item: data });
}
