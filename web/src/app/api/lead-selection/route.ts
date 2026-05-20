import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SelectionRow = {
  restaurant_ids: number[];
  updated_at: string;
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
    .from("user_selections")
    .select("restaurant_ids, updated_at")
    .eq("user_id", user.id)
    .maybeSingle<SelectionRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restaurantIds: data?.restaurant_ids ?? [],
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    restaurantIds?: unknown;
  } | null;

  if (!Array.isArray(body?.restaurantIds)) {
    return NextResponse.json(
      { error: "restaurantIds must be an array" },
      { status: 400 },
    );
  }

  const ids: number[] = [];
  for (const v of body.restaurantIds) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) ids.push(v);
  }

  const { data, error } = await supabase
    .from("user_selections")
    .upsert(
      {
        user_id: user.id,
        restaurant_ids: ids,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("restaurant_ids, updated_at")
    .single<SelectionRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restaurantIds: data.restaurant_ids,
    updatedAt: data.updated_at,
  });
}
