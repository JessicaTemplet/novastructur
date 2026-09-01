"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/trpc/react";
import { PRIORITY_ORDER, PRIORITY_META, PriorityIcon, type Priority } from "@/lib/issue-meta";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

export function PriorityPicker({ issueId, current }: { issueId: string; current: Priority }) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  const update = api.issue.update.useMutation({
    onMutate: async ({ priority }) => {
      if (!priority) return;
      const listKey = getQueryKey(api.issue.list);
      queryClient.setQueriesData({ queryKey: listKey }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((issue) =>
          (issue as { id: string }).id === issueId ? { ...(issue as object), priority } : issue
        );
      });
    },
    onSettled: () => {
      void utils.issue.list.invalidate();
      void utils.issue.byIdentifier.invalidate();
    },
  });

  return (
    <Dropdown trigger={<span className="flex items-center rounded p-1 hover:bg-neutral-100"><PriorityIcon priority={current} className="h-3.5 w-3.5" /></span>}>
      {(close) => (
        <>
          {PRIORITY_ORDER.map((p) => (
            <DropdownItem
              key={p}
              active={p === current}
              onClick={() => {
                update.mutate({ id: issueId, priority: p });
                close();
              }}
            >
              <PriorityIcon priority={p} className="h-3.5 w-3.5" />
              {PRIORITY_META[p].label}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
