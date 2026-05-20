import { NextResponse } from "next/server";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";

type Row = {
  shortcuts: Record<string, unknown>;
  updated_at: string;
};

export async function GET() {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await createDataClient();
  const { data, error } = await db
    .from("user_approval_shortcuts")
    .select("shortcuts, updated_at")
    .eq("user_id", user.id)
    .maybeSingle<Row>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    shortcuts: data?.shortcuts ?? {},
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    shortcuts?: unknown;
  } | null;

  if (!body || typeof body.shortcuts !== "object" || body.shortcuts === null) {
    return NextResponse.json(
      { error: "shortcuts must be an object" },
      { status: 400 },
    );
  }

  const db = await createDataClient();
  const { data, error } = await db
    .from("user_approval_shortcuts")
    .upsert(
      {
        user_id: user.id,
        shortcuts: body.shortcuts as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("shortcuts, updated_at")
    .single<Row>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    shortcuts: data.shortcuts,
    updatedAt: data.updated_at,
  });
}
