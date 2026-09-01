"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api } from "@/trpc/react";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import type { IssueListItem } from "@/components/issue-row";

type WorkflowState = { id: string; name: string; color: string; position: number; type: string };

function computeSortOrder(items: { sortOrder: number }[], index: number) {
  const prev = items[index - 1]?.sortOrder;
  const next = items[index + 1]?.sortOrder;
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return next! - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

export function KanbanBoard({ teamId, states }: { teamId: string; states: WorkflowState[] }) {
  const utils = api.useUtils();
  const { data: issues = [] } = api.issue.list.useQuery({ teamId, parentId: null });
  const [columns, setColumns] = useState<Record<string, IssueListItem[]>>({});
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (dragging) return;
    const next: Record<string, IssueListItem[]> = {};
    for (const s of states) next[s.id] = [];
    for (const issue of issues) {
      (next[issue.state.id] ??= []).push(issue);
    }
    for (const key of Object.keys(next)) {
      next[key]!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    setColumns(next);
  }, [issues, states, dragging]);

  const listInput = { teamId, parentId: null };
  const update = api.issue.update.useMutation({
    onMutate: async (input) => {
      // Patch the cache synchronously (no await first) so this lands in the
      // same tick as the drag-end state update — otherwise the "dragging"
      // reconciliation effect can rebuild columns from stale query data and
      // immediately revert the drop before the mutation resolves.
      const prevData = utils.issue.list.getData(listInput);
      utils.issue.list.setData(listInput, (old) => {
        if (!old) return old;
        // Reuse a full state object already present in the cache (from any
        // issue currently in the target column) rather than constructing one
        // from the component's partial `states` prop, which is missing
        // fields (e.g. teamId) the cached issue shape requires.
        const nextState = input.stateId ? old.find((i) => i.state.id === input.stateId)?.state : undefined;
        return old.map((item) =>
          item.id === input.id
            ? { ...item, state: nextState ?? item.state, sortOrder: input.sortOrder ?? item.sortOrder }
            : item
        );
      });
      void utils.issue.list.cancel(listInput);
      return { prevData };
    },
    onError: (_err, _input, context) => {
      if (context?.prevData) utils.issue.list.setData(listInput, context.prevData);
    },
    onSettled: () => void utils.issue.list.invalidate(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortedStates = useMemo(() => [...states].sort((a, b) => a.position - b.position), [states]);

  function findColumnOf(id: string) {
    for (const [colId, items] of Object.entries(columns)) {
      if (items.some((i) => i.id === id)) return colId;
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const fromColId = findColumnOf(activeId);
    if (!fromColId) return;
    const toColId = columns[overId] ? overId : findColumnOf(overId);
    if (!toColId) return;

    setColumns((prev) => {
      const fromItems = [...(prev[fromColId] ?? [])];
      const activeIndex = fromItems.findIndex((i) => i.id === activeId);
      if (activeIndex === -1) return prev;
      const [moved] = fromItems.splice(activeIndex, 1);
      if (!moved) return prev;

      const toItems = fromColId === toColId ? fromItems : [...(prev[toColId] ?? [])];
      let overIndex = toItems.findIndex((i) => i.id === overId);
      if (overIndex === -1) overIndex = toItems.length;
      const movedWithState = { ...moved, state: sortedStates.find((s) => s.id === toColId) ?? moved.state };
      toItems.splice(overIndex, 0, movedWithState);

      const sortOrder = computeSortOrder(toItems, overIndex);
      movedWithState.sortOrder = sortOrder;

      update.mutate({ id: activeId, stateId: toColId, sortOrder });

      return { ...prev, [fromColId]: fromItems, [toColId]: toItems };
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={() => setDragging(true)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(false)}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {sortedStates.map((s) => (
          <KanbanColumn key={s.id} state={s} issues={columns[s.id] ?? []} />
        ))}
      </div>
    </DndContext>
  );
}
