import { type ApprovalStatus } from "./types";

export function isDefaultApprovalStatusFilters(
  include: ApprovalStatus[],
  exclude: ApprovalStatus[],
): boolean {
  return include.length === 0 && exclude.length === 1 && exclude[0] === "rejected";
}

export type ApprovalStatusFlags = Readonly<{
  approvedIds: number[];
  rejectedIds: number[];
  skippedIds: number[];
  downloadedIds: number[];
  sentToSheetsIds: number[];
}>;

export function getApprovalStatuses(id: number, flags: ApprovalStatusFlags): ApprovalStatus[] {
  const out: ApprovalStatus[] = [];
  if (flags.approvedIds.includes(id)) out.push("approved");
  else if (flags.rejectedIds.includes(id)) out.push("rejected");
  else if (flags.skippedIds.includes(id)) out.push("skipped");
  else out.push("pending");
  if (flags.downloadedIds.includes(id)) out.push("downloaded");
  if (flags.sentToSheetsIds.includes(id)) out.push("sentToSheets");
  return out;
}

export function rowMatchesApprovalStatuses(
  id: number,
  include: ApprovalStatus[],
  exclude: ApprovalStatus[],
  flags: ApprovalStatusFlags,
): boolean {
  const statuses = getApprovalStatuses(id, flags);
  if (include.length > 0 && !statuses.some((s) => include.includes(s))) return false;
  if (exclude.length > 0 && statuses.some((s) => exclude.includes(s))) return false;
  return true;
}

export function approvalStatusToneClass(status: ApprovalStatus): string {
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
