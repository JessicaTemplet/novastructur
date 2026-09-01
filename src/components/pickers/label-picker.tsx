"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/trpc/react";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Tag, Check } from "lucide-react";

type Label = { id: string; name: string; color: string };

export function LabelPicker({ issueId, current }: { issueId: string; current: Label[] }) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { data: allLabels = [] } = api.label.list.useQuery();

  // Shared by both mutations below: optimistically patch the issue-list
  // cache's `labels` field for this one issue before the server
  // round-trip resolves.
  function patchLabelsCache(nextLabelIds: string[]) {
    const nextLabels = allLabels.filter((l) => nextLabelIds.includes(l.id));
    const listKey = getQueryKey(api.issue.list);
    queryClient.setQueriesData({ queryKey: listKey }, (old: unknown) => {
      if (!Array.isArray(old)) return old;
      return old.map((issue) =>
        (issue as { id: string }).id === issueId
          ? { ...(issue as object), labels: nextLabels.map((label) => ({ label })) }
          : issue
      );
    });
  }

  // Two mutations instead of one "send the whole desired array" update,
  // ORSet (src/server/crdt/issue-labels.ts) tracks add/remove as
  // discrete operations, so each click here should be one too, not a
  // full recomputed array that can silently clobber a concurrent
  // change to a different label.
  const addLabel = api.issue.addLabel.useMutation({
    onMutate: async ({ labelId }) => {
      patchLabelsCache([...current.map((l) => l.id), labelId]);
    },
    onSettled: () => {
      void utils.issue.byIdentifier.invalidate();
      void utils.issue.list.invalidate();
    },
  });

  const removeLabel = api.issue.removeLabel.useMutation({
    onMutate: async ({ labelId }) => {
      patchLabelsCache(current.filter((l) => l.id !== labelId).map((l) => l.id));
    },
    onSettled: () => {
      void utils.issue.byIdentifier.invalidate();
      void utils.issue.list.invalidate();
    },
  });

  const currentIds = new Set(current.map((l) => l.id));

  function toggle(labelId: string) {
    if (currentIds.has(labelId)) {
      removeLabel.mutate({ id: issueId, labelId });
    } else {
      addLabel.mutate({ id: issueId, labelId });
    }
  }

  return (
    <Dropdown
      trigger={
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100">
          <Tag className="h-3 w-3" /> Labels
        </span>
      }
    >
      {() => (
        <>
          {allLabels.map((label) => (
            <DropdownItem key={label.id} onClick={() => toggle(label.id)}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1">{label.name}</span>
              {currentIds.has(label.id) && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </DropdownItem>
          ))}
          {allLabels.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">No labels yet</div>
          )}
        </>
      )}
    </Dropdown>
  );
}
