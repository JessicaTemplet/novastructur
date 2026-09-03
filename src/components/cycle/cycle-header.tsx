"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { cycleLabel, cycleDateRange, cycleStatus, CYCLE_STATUS_META } from "@/lib/cycle-meta";
import type { CycleOption } from "@/components/pickers/cycle-picker";

type Cycle = CycleOption & { _count: { issues: number } };
type IssueForProgress = { state: { type: string }; estimate: number | null };

export function CycleHeader({ cycle, issues }: { cycle: Cycle; issues: IssueForProgress[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cycle.name ?? "");
  const utils = api.useUtils();

  const update = api.cycle.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      void utils.cycle.list.invalidate();
    },
  });

  const status = cycleStatus(cycle);
  const total = issues.length;
  const done = issues.filter((i) => i.state.type === "COMPLETED").length;
  const totalPts = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
  const donePts = issues
    .filter((i) => i.state.type === "COMPLETED")
    .reduce((sum, i) => sum + (i.estimate ?? 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="border-b border-ns-border px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") update.mutate({ id: cycle.id, name: name.trim() || null });
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={() => update.mutate({ id: cycle.id, name: name.trim() || null })}
              placeholder={`Cycle ${cycle.number}`}
              className="rounded border border-ns-border-strong bg-white/[.03] px-1.5 py-0.5 text-sm font-semibold text-ns-text-body outline-none focus:border-ns-accent/70"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-semibold text-ns-text hover:underline"
            >
              {cycleLabel(cycle)}
            </button>
          )}
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              color: CYCLE_STATUS_META[status].color,
              backgroundColor: `${CYCLE_STATUS_META[status].color}1a`,
            }}
          >
            {CYCLE_STATUS_META[status].label}
          </span>
          <span className="text-xs text-ns-text-faint">{cycleDateRange(cycle)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-ns-text-dim">
          <span>
            {done}/{total} issues
          </span>
          {totalPts > 0 && (
            <span className="text-ns-text-faint">
              · {donePts}/{totalPts} pts
            </span>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[.06]">
          <div
            className="h-full rounded-full bg-ns-accent shadow-[0_0_8px_var(--color-ns-accent)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
