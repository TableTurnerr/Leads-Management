// Client helper for the lead-action audit log. Always fire-and-forget — a
// logging hiccup must never block the action the user just performed.

export type LogActionInput = {
  action: "csv_download" | "send_to_sheets" | "selection_snapshot";
  source?: string;
  rowCount?: number;
  restaurantIds?: number[];
  filters?: unknown;
  metadata?: Record<string, unknown>;
};

export async function logLeadAction(input: LogActionInput): Promise<void> {
  try {
    await fetch("/api/leads/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    // intentionally swallowed
  }
}
