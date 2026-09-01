"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!teamId && teams.length > 0) setTeamId(teams[0]!.id);
  }, [teams, teamId]);

  const activeTeam = teams.find((t) => t.id === teamId);

  const { data: cycles = [] } = api.cycle.list.useQuery({ teamId }, { enabled: !!teamId });

  useEffect(() => {
    if (tab !== "backlog" && !cycles.some((c) => c.id === tab)) {
      const active = cycles.find((c) => cycleStatus(c) === "active");
      setTab(active?.id ?? "backlog");
    }
  }, [cycles, tab]);

  const sortedCycles = useMemo(() => [...cycles].sort((a, b) => a.number - b.number), [cycles]);
  const selectedCycle = cycles.find((c) => c.id === tab) ?? null;

  const { data: issues = [] } = api.issue.list.useQuery(
    { teamId, cycleId: tab === "backlog" ? "backlog" : tab },
    { enabled: !!teamId }
  );

  const statesByTeam = activeTeam?.workflowStates ?? [];

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
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-sm font-semibold text-neutral-900">Cycles</h1>
        {teams.length > 1 && (
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-4 py-2">
        <button
          onClick={() => setTab("backlog")}
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
            tab === "backlog" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
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
                tab === c.id ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: tab === c.id ? "#fff" : CYCLE_STATUS_META[status].color }}
              />
              {cycleLabel(c)}
            </button>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
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
            <p className="text-sm font-medium text-neutral-500">
              {tab === "backlog" ? "Backlog is empty" : "No issues in this cycle yet"}
            </p>
            <p className="text-xs text-neutral-400">
              {tab === "backlog"
                ? "Issues without a cycle show up here."
                : "Assign issues to this cycle from the Backlog tab."}
            </p>
          </div>
        )}
        {groups.map(({ state, items }) => (
          <div key={state.id}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-1.5 text-xs font-medium text-neutral-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} />
              {state.name}
              <span className="text-neutral-400">{items.length}</span>
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
