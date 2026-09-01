"use client";

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { api } from "@/trpc/react";
import { IssueRow } from "@/components/issue-row";

export default function TriagePage() {
  const { data: teams = [] } = api.team.list.useQuery();
  const [teamId, setTeamId] = useState<string>("");

  useEffect(() => {
    if (!teamId && teams.length > 0) setTeamId(teams[0]!.id);
  }, [teams, teamId]);

  const activeTeam = teams.find((t) => t.id === teamId);
  const statusOptions = activeTeam?.workflowStates ?? [];
  const backlogState = statusOptions.find((s) => s.type === "BACKLOG");
  const canceledState = statusOptions.find((s) => s.type === "CANCELED");

  const utils = api.useUtils();
  const { data: issues = [], isLoading } = api.issue.list.useQuery(
    { teamId, stateType: "TRIAGE" },
    { enabled: !!teamId }
  );

  const update = api.issue.update.useMutation({
    onSettled: () => void utils.issue.list.invalidate(),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          <Inbox className="h-4 w-4" /> Triage
        </h1>
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

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-6 text-sm text-neutral-400">Loading…</div>}
        {!isLoading && issues.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-neutral-500">Triage inbox is empty</p>
            <p className="text-xs text-neutral-400">Nothing new needs a look.</p>
          </div>
        )}
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            statusOptions={statusOptions}
            onAccept={
              backlogState ? () => update.mutate({ id: issue.id, stateId: backlogState.id }) : undefined
            }
            onDecline={
              canceledState ? () => update.mutate({ id: issue.id, stateId: canceledState.id }) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
