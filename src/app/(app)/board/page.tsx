"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default function BoardPage() {
  const { data: teams = [] } = api.team.list.useQuery();
  const [teamId, setTeamId] = useState<string>("");

  useEffect(() => {
    if (!teamId && teams.length > 0) setTeamId(teams[0]!.id);
  }, [teams, teamId]);

  const activeTeam = teams.find((t) => t.id === teamId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-sm font-semibold text-neutral-900">Board</h1>
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
      <div className="min-h-0 flex-1">
        {activeTeam && <KanbanBoard teamId={activeTeam.id} states={activeTeam.workflowStates} />}
      </div>
    </div>
  );
}
