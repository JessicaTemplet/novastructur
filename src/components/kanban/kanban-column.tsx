"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "@/components/kanban/kanban-card";
import type { IssueListItem } from "@/components/issue-row";

type WorkflowState = { id: string; name: string; color: string };

export function KanbanColumn({
  state,
  issues,
}: {
  state: WorkflowState;
  issues: IssueListItem[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state.id });

  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }} />
        <span className="text-sm font-medium text-neutral-700">{state.name}</span>
        <span className="text-xs text-neutral-400">{issues.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto rounded-lg p-1.5 ${isOver ? "bg-indigo-50" : "bg-neutral-100/60"}`}
      >
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <KanbanCard key={issue.id} issue={issue} />
          ))}
          {issues.length === 0 && (
            <div className="flex h-16 items-center justify-center text-xs text-neutral-400">Drop here</div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
