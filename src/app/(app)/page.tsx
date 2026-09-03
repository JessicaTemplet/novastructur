"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark } from "lucide-react";
import { api } from "@/trpc/react";
import { IssueRow } from "@/components/issue-row";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/issue-meta";
import { useDebouncedValue } from "@/lib/use-debounced-value";

function paramsFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.size > 0 ? params : null;
}

// Clicking a different saved view updates the URL's query params without
// changing route (still "/"), so Next won't remount this page on its own.
// Keying on the params string forces exactly that remount when they change,
// which lets every filter's useState pick its initial value straight from
// the new URL, no effect needed to re-sync them after the fact.
export default function IssuesPage() {
  const searchParams = useSearchParams();
  return <IssuesPageContent key={searchParams.toString()} />;
}

function IssuesPageContent() {
  const initial = paramsFromUrl();
  const [teamId, setTeamId] = useState<string>(initial?.get("teamId") ?? "all");
  const [assigneeId, setAssigneeId] = useState<string>(initial?.get("assigneeId") ?? "all");
  const [priority, setPriority] = useState<string>(initial?.get("priority") ?? "all");
  const [labelId, setLabelId] = useState<string>(initial?.get("labelId") ?? "all");
  const [query, setQuery] = useState(initial?.get("query") ?? "");
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const { data: teams = [] } = api.team.list.useQuery();
  const { data: members = [] } = api.user.listOrgMembers.useQuery();
  const { data: labels = [] } = api.label.list.useQuery();
  const utils = api.useUtils();

  const filters = {
    teamId: teamId === "all" ? undefined : teamId,
    assigneeId: assigneeId === "all" ? undefined : assigneeId,
    priority: priority === "all" ? undefined : (priority as never),
    labelId: labelId === "all" ? undefined : labelId,
    query: query.trim() || undefined,
  };
  const queryFilters = { ...filters, query: debouncedQuery.trim() || undefined };

  const { data: issues = [], isLoading } = api.issue.list.useQuery({ ...queryFilters, parentId: null });

  const saveView = api.savedView.create.useMutation({
    onSuccess: () => {
      setSavingView(false);
      setViewName("");
      void utils.savedView.list.invalidate();
    },
  });

  const statesByTeam = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t.workflowStates])),
    [teams]
  );

  const groups = useMemo(() => {
    const map = new Map<string, { state: (typeof issues)[number]["state"]; items: typeof issues }>();
    for (const issue of issues) {
      const key = issue.state.id;
      if (!map.has(key)) map.set(key, { state: issue.state, items: [] });
      map.get(key)!.items.push(issue);
    }
    return Array.from(map.values()).sort((a, b) => {
      const posA = teams.flatMap((t) => t.workflowStates).find((s) => s.id === a.state.id)?.position ?? 0;
      const posB = teams.flatMap((t) => t.workflowStates).find((s) => s.id === b.state.id)?.position ?? 0;
      return posA - posB;
    });
  }, [issues, teams]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ns-border px-4 py-3">
        <h1 className="font-display text-sm font-bold tracking-wide text-ns-text">Issues</h1>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, ID..."
            className="w-52 rounded-md border border-ns-border-strong bg-white/[.03] px-2.5 py-1 text-xs text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70"
          />
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-dim"
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.key}
              </option>
            ))}
          </select>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-dim"
          >
            <option value="all">Everyone</option>
            <option value="unassigned">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-dim"
          >
            <option value="all">Any priority</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
          <select
            value={labelId}
            onChange={(e) => setLabelId(e.target.value)}
            className="rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-dim"
          >
            <option value="all">Any label</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSavingView(true)}
            title="Save current filters as a view"
            className="rounded-md p-1.5 text-ns-text-faint hover:bg-white/5 hover:text-ns-text-dim"
          >
            <Bookmark className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {savingView && (
        <div className="flex items-center gap-2 border-b border-ns-border bg-white/[.02] px-4 py-2">
          <input
            autoFocus
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && viewName.trim()) saveView.mutate({ name: viewName.trim(), ...filters });
              if (e.key === "Escape") setSavingView(false);
            }}
            placeholder="View name, press Enter to save"
            className="w-64 rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70"
          />
          <button
            onClick={() => setSavingView(false)}
            className="rounded-md px-2 py-1 text-xs text-ns-text-dim hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-6 text-sm text-ns-text-faint">Loading…</div>}
        {!isLoading && issues.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-ns-text-dim">No issues match these filters</p>
            <p className="text-xs text-ns-text-faint">Press &quot;C&quot; to create one.</p>
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
              <IssueRow key={issue.id} issue={issue} statusOptions={statesByTeam[issue.team.id] ?? []} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
