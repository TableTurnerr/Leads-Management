import type { LeadStatus } from "./types";

export type LeadStatusFlags = Readonly<{
  approvedIds: number[];
  rejectedIds: number[];
  skippedIds: number[];
  downloadedIds: number[];
  sentToSheetsIds: number[];
}>;

export function getLeadStatuses(id: number, flags: LeadStatusFlags): LeadStatus[] {
  const out: LeadStatus[] = [];
  if (flags.approvedIds.includes(id)) out.push("approved");
  else if (flags.rejectedIds.includes(id)) out.push("rejected");
  else if (flags.skippedIds.includes(id)) out.push("skipped");
  else out.push("pending");
  if (flags.downloadedIds.includes(id)) out.push("downloaded");
  if (flags.sentToSheetsIds.includes(id)) out.push("sentToSheets");
  return out;
}

export function rowMatchesStatuses(
  id: number,
  selected: LeadStatus[],
  flags: LeadStatusFlags,
): boolean {
  if (!selected.length) return true;
  const statuses = getLeadStatuses(id, flags);
  return statuses.some((s) => selected.includes(s));
}

export function leadStatusToneClass(status: LeadStatus): string {
  switch (status) {
    case "approved":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "rejected":
      return "bg-red-600 text-white hover:bg-red-600";
    case "skipped":
      return "bg-muted text-muted-foreground hover:bg-muted";
    case "pending":
      return "bg-card text-muted-foreground border border-border hover:bg-card";
    case "downloaded":
      return "bg-sky-600 text-white hover:bg-sky-600";
    case "sentToSheets":
      return "bg-violet-600 text-white hover:bg-violet-600";
  }
}
