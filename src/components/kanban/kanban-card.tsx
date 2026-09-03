"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PriorityIcon } from "@/lib/issue-meta";
import { AssigneePicker } from "@/components/pickers/assignee-picker";
import type { IssueListItem } from "@/components/issue-row";

export function KanbanCard({ issue }: { issue: IssueListItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`mb-2 rounded-lg border border-ns-border-strong bg-ns-bg-elevated p-2.5 shadow-sm shadow-black/20 ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[11px] text-ns-text-faint">{issue.identifier}</span>
        <PriorityIcon priority={issue.priority} className="h-3.5 w-3.5" />
      </div>
      <Link href={`/issue/${issue.identifier}`} className="block text-sm text-ns-text-body hover:underline">
        {issue.title}
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1">
          {issue.labels.slice(0, 2).map(({ label }) => (
            <span
              key={label.id}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: `${label.color}1a`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
        <span onPointerDown={(e) => e.stopPropagation()}>
          <AssigneePicker issueId={issue.id} current={issue.assignee} />
        </span>
      </div>
    </div>
  );
}
