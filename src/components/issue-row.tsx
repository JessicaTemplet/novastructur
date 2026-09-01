"use client";

import Link from "next/link";
import { CornerDownRight, MessageSquare, Check, X } from "lucide-react";
import { StatusPicker } from "@/components/pickers/status-picker";
import { PriorityPicker } from "@/components/pickers/priority-picker";
import { AssigneePicker } from "@/components/pickers/assignee-picker";
import { CyclePicker, type CycleOption } from "@/components/pickers/cycle-picker";
import type { Priority } from "@/lib/issue-meta";

type WorkflowState = { id: string; name: string; color: string; type: string };
type Label = { id: string; name: string; color: string };

export type IssueListItem = {
  id: string;
  identifier: string;
  title: string;
  priority: Priority;
  sortOrder: number;
  state: WorkflowState;
  assignee: { id: string; name: string; avatarColor: string } | null;
  labels: { label: Label }[];
  parent: { id: string; identifier: string; title: string } | null;
  cycle: CycleOption | null;
  _count: { subIssues: number; comments: number };
};

export function IssueRow({
  issue,
  statusOptions,
  cycleOptions,
  onAccept,
  onDecline,
}: {
  issue: IssueListItem;
  statusOptions: WorkflowState[];
  /** Pass the team's cycles to show a cycle-assignment control (used by the Cycles page). Omit elsewhere. */
  cycleOptions?: CycleOption[];
  /** Pass both to show Accept/Decline quick actions (used by the Triage inbox). Omit elsewhere. */
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  return (
    <div className="group flex items-center gap-2.5 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50">
      <StatusPicker issueId={issue.id} current={issue.state} options={statusOptions} />
      <PriorityPicker issueId={issue.id} current={issue.priority} />

      <Link href={`/issue/${issue.identifier}`} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-xs text-neutral-400">{issue.identifier}</span>
        {issue.parent && <CornerDownRight className="h-3 w-3 shrink-0 text-neutral-300" />}
        <span className="truncate text-sm text-neutral-800">{issue.title}</span>
        {issue.labels.map(({ label }) => (
          <span
            key={label.id}
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${label.color}1a`, color: label.color }}
          >
            {label.name}
          </span>
        ))}
      </Link>

      {issue._count.subIssues > 0 && (
        <span className="shrink-0 text-xs text-neutral-400">{issue._count.subIssues} sub</span>
      )}
      {issue._count.comments > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-neutral-400">
          <MessageSquare className="h-3 w-3" /> {issue._count.comments}
        </span>
      )}
      {cycleOptions && (
        <CyclePicker issueId={issue.id} current={issue.cycle} cycles={cycleOptions} />
      )}
      <AssigneePicker issueId={issue.id} current={issue.assignee} />
      {onAccept && onDecline && (
        <span className="flex shrink-0 items-center gap-1">
          <button
            onClick={onDecline}
            title="Decline"
            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onAccept}
            title="Accept"
            className="rounded p-1 text-neutral-400 hover:bg-green-50 hover:text-green-600"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}
