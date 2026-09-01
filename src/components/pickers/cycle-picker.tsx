"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/trpc/react";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Repeat } from "lucide-react";
import { cycleLabel } from "@/lib/cycle-meta";

export type CycleOption = {
  id: string;
  number: number;
  name: string | null;
  startDate: string | Date;
  endDate: string | Date;
};

export function CyclePicker({
  issueId,
  current,
  cycles,
}: {
  issueId: string;
  current: CycleOption | null;
  cycles: CycleOption[];
}) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  const update = api.issue.update.useMutation({
    onMutate: async ({ cycleId }) => {
      const next = cycleId ? cycles.find((c) => c.id === cycleId) ?? null : null;
      const listKey = getQueryKey(api.issue.list);
      queryClient.setQueriesData({ queryKey: listKey }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((issue) =>
          (issue as { id: string }).id === issueId ? { ...(issue as object), cycle: next } : issue
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
      align="right"
      trigger={
        <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100">
          <Repeat className="h-3 w-3" />
          {current ? cycleLabel(current) : "Backlog"}
        </span>
      }
    >
      {(close) => (
        <>
          <DropdownItem
            active={!current}
            onClick={() => {
              update.mutate({ id: issueId, cycleId: null });
              close();
            }}
          >
            No cycle (Backlog)
          </DropdownItem>
          {cycles.map((c) => (
            <DropdownItem
              key={c.id}
              active={current?.id === c.id}
              onClick={() => {
                update.mutate({ id: issueId, cycleId: c.id });
                close();
              }}
            >
              {cycleLabel(c)}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
