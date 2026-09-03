"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { IssueRow } from "@/components/issue-row";
import { NewCycleForm } from "@/components/cycle/new-cycle-form";
import { CycleHeader } from "@/components/cycle/cycle-header";
import { cycleLabel, cycleStatus, CYCLE_STATUS_META } from "@/lib/cycle-meta";

export default function CyclesPage() {
  const { data: teams = [] } = api.team.list.useQuery();
  const [teamId, setTeamId] = useState<string>("");
  const [tab, setTab] = useState<string>("backlog");
  const [creating, setCreating] = useState(false);
  const activeTeamId = teamId || teams[0]?.id || "";

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const { data: cycles = [] } = api.cycle.list.useQuery({ teamId: activeTeamId }, { enabled: !!activeTeamId });

  // Fall back to whichever cycle is active, or the backlog, if the tab
  // currently selected no longer refers to a real cycle (e.g. cycles
  // reloaded after switching teams). A derived value, not state kept in
  // sync via an effect: `tab` itself only ever changes from a direct user
  // click (or onCreated below), so there's nothing to "reset", just a
  // display/query value to fall back to when the raw selection is stale.
  const activeTab =
    tab === "backlog" || cycles.some((c) => c.id === tab)
      ? tab
      : cycles.find((c) => cycleStatus(c) === "active")?.id ?? "backlog";

  const sortedCycles = useMemo(() => [...cycles].sort((a, b) => a.number - b.number), [cycles]);
  const selectedCycle = cycles.find((c) => c.id === activeTab) ?? null;

  const { data: issues = [] } = api.issue.list.useQuery(
    { teamId: activeTeamId, cycleId: activeTab === "backlog" ? "backlog" : activeTab },
    { enabled: !!activeTeamId }
  );

  const statesByTeam = useMemo(() => activeTeam?.workflowStates ?? [], [activeTeam?.workflowStates]);

  const groups = useMemo(() => {
    const map = new Map<string, { state: (typeof issues)[number]["state"]; items: typeof issues }>();
    for (const issue of issues) {
      const key = issue.state.id;
      if (!map.has(key)) map.set(key, { state: issue.state, items: [] });
      map.get(key)!.items.push(issue);
    }
    return Array.from(map.values()).sort((a, b) => {
      const posA = statesByTeam.find((s) => s.id === a.state.id)?.position ?? 0;
      const posB = statesByTeam.find((s) => s.id === b.state.id)?.position ?? 0;
      return posA - posB;
    });
  }, [issues, statesByTeam]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ns-border px-4 py-3">
        <h1 className="font-display text-sm font-bold tracking-wide text-ns-text">Cycles</h1>
        {teams.length > 1 && (
          <select
            value={activeTeamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-dim"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-ns-border px-4 py-2">
        <button
          onClick={() => setTab("backlog")}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
            activeTab === "backlog" ? "bg-ns-accent-bg text-ns-accent ring-1 ring-ns-accent/70" : "text-ns-text-dim hover:bg-white/5"
          }`}
        >
          Backlog
        </button>
        {sortedCycles.map((c) => {
          const status = cycleStatus(c);
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                activeTab === c.id ? "bg-ns-accent-bg text-ns-accent ring-1 ring-ns-accent/70" : "text-ns-text-dim hover:bg-white/5"
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: activeTab === c.id ? "var(--color-ns-accent)" : CYCLE_STATUS_META[status].color }}
              />
              {cycleLabel(c)}
            </button>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ns-text-faint hover:bg-white/5 hover:text-ns-text-dim"
        >
          <Plus className="h-3 w-3" /> New cycle
        </button>
      </div>

      {creating && activeTeam && (
        <NewCycleForm
          teamId={activeTeam.id}
          nextNumber={activeTeam ? (cycles[0] ? Math.max(...cycles.map((c) => c.number)) + 1 : 1) : 1}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setTab(id);
          }}
        />
      )}

      {selectedCycle && <CycleHeader cycle={selectedCycle} issues={issues} />}

      <div className="flex-1 overflow-y-auto">
        {issues.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-ns-text-dim">
              {activeTab === "backlog" ? "Backlog is empty" : "No issues in this cycle yet"}
            </p>
            <p className="text-xs text-ns-text-faint">
              {activeTab === "backlog"
                ? "Issues without a cycle show up here."
                : "Assign issues to this cycle from the Backlog tab."}
            </p>
          </div>
        )}
        {groups.map(({ state, items }) => (
          <div key={state.id}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ns-border bg-ns-bg px-4 py-1.5 text-xs font-medium text-ns-text-dim">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} />
              {state.name}
              <span className="text-ns-text-faint">{items.length}</span>
            </div>
            {items.map((issue) => (
              <IssueRow key={issue.id} issue={issue} statusOptions={statesByTeam} cycleOptions={cycles} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
