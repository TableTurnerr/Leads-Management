import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS already restricts delete to the owner; the explicit user_id match is a
  // belt-and-braces guard that also lets us distinguish "not yours" from
  // "didn't exist" via the row count.
  const { error, count } = await supabase
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
