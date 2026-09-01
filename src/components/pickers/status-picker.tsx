"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/trpc/react";
import { StatusDot } from "@/lib/issue-meta";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

type WorkflowState = { id: string; name: string; color: string; type: string };

export function StatusPicker({
  issueId,
  current,
  options,
}: {
  issueId: string;
  current: WorkflowState;
  options: WorkflowState[];
}) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  const update = api.issue.update.useMutation({
    onMutate: async ({ stateId }) => {
      const next = options.find((s) => s.id === stateId);
      if (!next) return;
      const listKey = getQueryKey(api.issue.list);
      queryClient.setQueriesData({ queryKey: listKey }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((issue) =>
          (issue as { id: string }).id === issueId ? { ...(issue as object), state: next } : issue
        );
      });
    },
    onSettled: () => {
      void utils.issue.list.invalidate();
      void utils.issue.byIdentifier.invalidate();
    },
  });

  return (
    <Dropdown
      trigger={
        <span className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-neutral-100">
          <StatusDot color={current.color} />
        </span>
      }
    >
      {(close) => (
        <>
          {options.map((s) => (
            <DropdownItem
              key={s.id}
              active={s.id === current.id}
              onClick={() => {
                update.mutate({ id: issueId, stateId: s.id });
                close();
              }}
            >
              <StatusDot color={s.color} />
              {s.name}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
