"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  format,
  isBefore,
} from "date-fns";
import { api } from "@/trpc/react";
import { StatusDot } from "@/lib/issue-meta";

const PX_PER_DAY = 6;
const MIN_BAR_WIDTH = 90;
const PAD_DAYS = 7;

export default function RoadmapPage() {
  const { data: epics = [], isLoading } = api.issue.list.useQuery({ type: "EPIC" });

  const dated = useMemo(
    () => epics.filter((e): e is typeof epics[number] & { dueDate: Date | string } => !!e.dueDate),
    [epics]
  );
  const undated = epics.filter((e) => !e.dueDate);

  const { windowStart, months, totalWidth, todayLeft } = useMemo(() => {
    const today = new Date();
    const starts = dated.map((e) => new Date(e.createdAt).getTime());
    const ends = dated.map((e) => new Date(e.dueDate).getTime());
    const rawStart = Math.min(today.getTime(), ...(starts.length ? starts : [today.getTime()]));
    const rawEnd = Math.max(today.getTime(), ...(ends.length ? ends : [today.getTime()]));

    const windowStart = startOfMonth(addDays(new Date(rawStart), -PAD_DAYS));
    const windowEnd = endOfMonth(addDays(new Date(rawEnd), PAD_DAYS));
    const totalDays = Math.max(differenceInCalendarDays(windowEnd, windowStart), 1);

    const months = eachMonthOfInterval({ start: windowStart, end: windowEnd }).map((m) => ({
      label: format(m, "MMM yyyy"),
      left: differenceInCalendarDays(m, windowStart) * PX_PER_DAY,
    }));

    return {
      windowStart,
      months,
      totalWidth: totalDays * PX_PER_DAY,
      todayLeft: differenceInCalendarDays(today, windowStart) * PX_PER_DAY,
    };
  }, [dated]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ns-border px-4 py-3">
        <h1 className="font-display text-sm font-bold tracking-wide text-ns-text">Roadmap</h1>
        <p className="text-xs text-ns-text-faint">Epics plotted from creation to due date — no dependency graph, just a timeline.</p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-6 text-sm text-ns-text-faint">Loading…</div>}

        {!isLoading && dated.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-ns-text-dim">No epics with a due date yet</p>
            <p className="text-xs text-ns-text-faint">Give an epic a due date to place it on the roadmap.</p>
          </div>
        )}

        {dated.length > 0 && (
          <div className="p-4">
            <div style={{ width: totalWidth + 40 }}>
              <div className="relative h-7 border-b border-ns-border">
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="absolute top-0 border-l border-ns-border pl-1.5 text-[11px] text-ns-text-faint"
                    style={{ left: m.left }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              <div className="relative mt-2">
                <div
                  className="absolute top-0 bottom-0 w-px bg-ns-accent/60"
                  style={{ left: todayLeft }}
                  title="Today"
                />
                {dated.map((epic) => {
                  const start = isBefore(new Date(epic.createdAt), windowStart) ? windowStart : new Date(epic.createdAt);
                  const left = differenceInCalendarDays(start, windowStart) * PX_PER_DAY;
                  const rawWidth = differenceInCalendarDays(new Date(epic.dueDate), start) * PX_PER_DAY;
                  const width = Math.max(rawWidth, MIN_BAR_WIDTH);

                  return (
                    <Link
                      key={epic.id}
                      href={`/issue/${epic.identifier}`}
                      className="mb-2 flex h-9 items-center gap-1.5 rounded-md border px-2 text-xs shadow-sm hover:brightness-95"
                      style={{
                        marginLeft: left,
                        width,
                        backgroundColor: `${epic.state.color}14`,
                        borderColor: `${epic.state.color}40`,
                      }}
                    >
                      <StatusDot color={epic.state.color} />
                      <span className="truncate font-medium text-ns-text-body">
                        {epic.identifier} {epic.title}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {undated.length > 0 && (
          <div className="border-t border-ns-border px-4 py-3">
            <h3 className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-wide text-ns-text-faint">
              No due date ({undated.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {undated.map((epic) => (
                <Link
                  key={epic.id}
                  href={`/issue/${epic.identifier}`}
                  className="flex items-center gap-1.5 rounded-md border border-ns-border-strong px-2 py-1 text-xs text-ns-text-dim hover:bg-white/5"
                >
                  <StatusDot color={epic.state.color} />
                  {epic.identifier} {epic.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
