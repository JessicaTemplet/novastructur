"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api } from "@/trpc/react";
import { Avatar } from "@/lib/issue-meta";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { User } from "lucide-react";

type Member = { id: string; name: string; avatarColor: string };

export function AssigneePicker({
  issueId,
  current,
}: {
  issueId: string;
  current: Member | null;
}) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { data: members = [] } = api.user.listOrgMembers.useQuery();

  const update = api.issue.update.useMutation({
    onMutate: async ({ assigneeId }) => {
      const next = assigneeId ? members.find((m) => m.id === assigneeId) ?? null : null;
      const listKey = getQueryKey(api.issue.list);
      queryClient.setQueriesData({ queryKey: listKey }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((issue) =>
          (issue as { id: string }).id === issueId ? { ...(issue as object), assignee: next } : issue
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
        <span className="flex items-center rounded p-0.5 hover:bg-white/5">
          {current ? (
            <Avatar name={current.name} color={current.avatarColor} size={20} />
          ) : (
            <User className="h-4 w-4 text-ns-text-faint" />
          )}
        </span>
      }
    >
      {(close) => (
        <>
          <DropdownItem
            active={!current}
            onClick={() => {
              update.mutate({ id: issueId, assigneeId: null });
              close();
            }}
          >
            <User className="h-3.5 w-3.5 text-ns-text-faint" /> Unassigned
          </DropdownItem>
          {members.map((m) => (
            <DropdownItem
              key={m.id}
              active={current?.id === m.id}
              onClick={() => {
                update.mutate({ id: issueId, assigneeId: m.id });
                close();
              }}
            >
              <Avatar name={m.name} color={m.avatarColor} size={18} />
              {m.name}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
