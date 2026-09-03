"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default function BoardPage() {
  const { data: teams = [] } = api.team.list.useQuery();
  const [teamId, setTeamId] = useState<string>("");
  const activeTeamId = teamId || teams[0]?.id || "";

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ns-border px-4 py-3">
        <h1 className="font-display text-sm font-bold tracking-wide text-ns-text">Board</h1>
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
      <div className="min-h-0 flex-1">
        {activeTeam && <KanbanBoard teamId={activeTeam.id} states={activeTeam.workflowStates} />}
      </div>
    </div>
  );
}
