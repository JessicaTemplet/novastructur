import { format, isAfter, isBefore } from "date-fns";

export type CycleStatus = "upcoming" | "active" | "completed";

export type CycleLike = {
  number: number;
  name: string | null;
  startDate: string | Date;
  endDate: string | Date;
};

export function cycleLabel(cycle: CycleLike) {
  return cycle.name?.trim() || `Cycle ${cycle.number}`;
}

export function cycleDateRange(cycle: CycleLike) {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${format(start, "MMM d")} – ${format(end, "d")}`
    : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

export function cycleStatus(cycle: CycleLike, now = new Date()): CycleStatus {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.endDate);
  if (isBefore(now, start)) return "upcoming";
  if (isAfter(now, end)) return "completed";
  return "active";
}

export const CYCLE_STATUS_META: Record<CycleStatus, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "#64748b" },
  active: { label: "Active", color: "#22c55e" },
  completed: { label: "Completed", color: "#a3a3a3" },
};
