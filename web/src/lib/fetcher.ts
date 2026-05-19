"use client";

import type { Filters } from "./types";

export async function postQuery<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const queryKey = (kind: string, extra?: Record<string, unknown>) =>
  ["query", kind, extra ?? {}] as const;

export function makeOverviewKey(filters: Filters) {
  return queryKey("overview", { filters });
}
