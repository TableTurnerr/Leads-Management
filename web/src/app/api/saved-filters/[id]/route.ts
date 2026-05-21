import { NextResponse } from "next/server";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    filters?: unknown;
    name?: string;
    scope?: "private" | "team";
  } | null;

  const filters = body?.filters;
  if (!filters || typeof filters !== "object") {
    return NextResponse.json({ error: "Invalid filters payload" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { filters, updated_at: new Date().toISOString() };
  if (body?.name?.trim()) patch.name = body.name.trim();
  if (body?.scope === "private" || body?.scope === "team") patch.scope = body.scope;

  const db = await createDataClient();
  const { data, error, count } = await db
    .from("saved_filters")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, scope, filters, user_id, created_at")
    .single();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? `A filter with that name already exists.` : error.message },
      { status: conflict ? 409 : 500 },
    );
  }
  if (!count && !data) {
    return NextResponse.json({ error: "Not found or not owned by you" }, { status: 404 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await createDataClient();
  const { error, count } = await db
    .from("saved_filters")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json(
      { error: "Not found or not owned by you" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
