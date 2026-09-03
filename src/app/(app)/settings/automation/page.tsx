"use client";

import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { api } from "@/trpc/react";
import { PRIORITY_META, type Priority } from "@/lib/issue-meta";

type Trigger = "ISSUE_CREATED" | "STATE_CHANGED" | "LABEL_ADDED" | "ASSIGNED";
type Action = "SET_STATE" | "SET_ASSIGNEE" | "SET_PRIORITY" | "ADD_LABEL";

const TRIGGER_LABEL: Record<Trigger, string> = {
  ISSUE_CREATED: "An issue is created",
  STATE_CHANGED: "Status changes to…",
  LABEL_ADDED: "Label is added…",
  ASSIGNED: "An issue is assigned",
};

const ACTION_LABEL: Record<Action, string> = {
  SET_STATE: "Set status to…",
  SET_ASSIGNEE: "Set assignee to…",
  SET_PRIORITY: "Set priority to…",
  ADD_LABEL: "Add label…",
};

export default function AutomationSettingsPage() {
  const [teamId, setTeamId] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("ISSUE_CREATED");
  const [triggerStateId, setTriggerStateId] = useState("");
  const [triggerLabelId, setTriggerLabelId] = useState("");
  const [action, setAction] = useState<Action>("SET_PRIORITY");
  const [actionStateId, setActionStateId] = useState("");
  const [actionAssigneeId, setActionAssigneeId] = useState("");
  const [actionPriority, setActionPriority] = useState("MEDIUM");
  const [actionLabelId, setActionLabelId] = useState("");

  const { data: teams = [] } = api.team.list.useQuery();
  const activeTeamId = teamId || teams[0]?.id || "";

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const states = activeTeam?.workflowStates ?? [];
  const { data: labels = [] } = api.label.list.useQuery();
  const { data: members = [] } = api.user.listOrgMembers.useQuery();
  const utils = api.useUtils();

  const { data: rules = [] } = api.automation.list.useQuery({ teamId: activeTeamId }, { enabled: !!activeTeamId });

  const create = api.automation.create.useMutation({
    onSuccess: () => {
      setAdding(false);
      setName("");
      void utils.automation.list.invalidate();
    },
  });
  const update = api.automation.update.useMutation({
    onSuccess: () => void utils.automation.list.invalidate(),
  });
  const del = api.automation.delete.useMutation({
    onSuccess: () => void utils.automation.list.invalidate(),
  });

  function stateName(id: string | null) {
    return states.find((s) => s.id === id)?.name ?? "—";
  }
  function labelName(id: string | null) {
    return labels.find((l) => l.id === id)?.name ?? "—";
  }
  function memberName(id: string | null) {
    return id ? members.find((m) => m.id === id)?.name ?? "—" : "Unassigned";
  }

  function describeTrigger(r: (typeof rules)[number]) {
    if (r.trigger === "STATE_CHANGED") return `Status changes to ${stateName(r.triggerStateId)}`;
    if (r.trigger === "LABEL_ADDED") return `Label ${labelName(r.triggerLabelId)} is added`;
    return TRIGGER_LABEL[r.trigger as Trigger];
  }

  function describeAction(r: (typeof rules)[number]) {
    if (r.action === "SET_STATE") return `set status to ${stateName(r.actionStateId)}`;
    if (r.action === "SET_ASSIGNEE") return `set assignee to ${memberName(r.actionAssigneeId)}`;
    if (r.action === "SET_PRIORITY") {
      return `set priority to ${r.actionPriority ? PRIORITY_META[r.actionPriority as Priority].label : "—"}`;
    }
    return `add label ${labelName(r.actionLabelId)}`;
  }

  function submit() {
    if (!activeTeamId || !name.trim()) return;
    create.mutate({
      teamId: activeTeamId,
      name: name.trim(),
      trigger,
      triggerStateId: trigger === "STATE_CHANGED" ? triggerStateId : undefined,
      triggerLabelId: trigger === "LABEL_ADDED" ? triggerLabelId : undefined,
      action,
      actionStateId: action === "SET_STATE" ? actionStateId : undefined,
      actionAssigneeId: action === "SET_ASSIGNEE" ? actionAssigneeId || undefined : undefined,
      actionPriority: action === "SET_PRIORITY" ? (actionPriority as never) : undefined,
      actionLabelId: action === "ADD_LABEL" ? actionLabelId : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Automation</h1>
        {teams.length > 1 && (
          <select
            value={activeTeamId}
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
      <p className="mb-6 text-sm text-neutral-500">
        Simple &quot;when X happens, do Y&quot; rules — no condition builder, no chained logic. Actions
        never re-trigger other rules, so there&apos;s no risk of a runaway chain.
      </p>

      <div className="rounded-xl border border-neutral-200 bg-white">
        {rules.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-neutral-400">No automation rules yet.</div>
        )}
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 text-sm last:border-b-0"
          >
            <Zap className={`h-4 w-4 shrink-0 ${r.enabled ? "text-indigo-500" : "text-neutral-300"}`} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-neutral-800">{r.name}</div>
              <div className="truncate text-xs text-neutral-500">
                When {describeTrigger(r)} → {describeAction(r)}
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => update.mutate({ id: r.id, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <button
              onClick={() => del.mutate({ id: r.id })}
              className="shrink-0 rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name"
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />

          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="shrink-0 text-neutral-400">When</span>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as Trigger)}
              className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
            >
              {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </select>
            {trigger === "STATE_CHANGED" && (
              <select
                value={triggerStateId}
                onChange={(e) => setTriggerStateId(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <option value="">Choose a state…</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {trigger === "LABEL_ADDED" && (
              <select
                value={triggerLabelId}
                onChange={(e) => setTriggerLabelId(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <option value="">Choose a label…</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="shrink-0 text-neutral-400">Then</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
              className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
            >
              {(Object.keys(ACTION_LABEL) as Action[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
            {action === "SET_STATE" && (
              <select
                value={actionStateId}
                onChange={(e) => setActionStateId(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <option value="">Choose a state…</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {action === "SET_ASSIGNEE" && (
              <select
                value={actionAssigneeId}
                onChange={(e) => setActionAssigneeId(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {action === "SET_PRIORITY" && (
              <select
                value={actionPriority}
                onChange={(e) => setActionPriority(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                {Object.entries(PRIORITY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            )}
            {action === "ADD_LABEL" && (
              <select
                value={actionLabelId}
                onChange={(e) => setActionLabelId(e.target.value)}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <option value="">Choose a label…</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={submit}
              disabled={create.isPending || !name.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending ? "Saving…" : "Save rule"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
          {create.isError && <p className="text-xs text-red-600">{create.error.message}</p>}
        </div>
      )}
    </div>
  );
}
