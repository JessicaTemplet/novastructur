"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { StatusDot, Avatar } from "@/lib/issue-meta";

type SubIssue = {
  id: string;
  identifier: string;
  title: string;
  state: { id: string; name: string; color: string };
  assignee: { id: string; name: string; avatarColor: string } | null;
};

export function SubIssues({
  parentId,
  teamId,
  subIssues,
}: {
  parentId: string;
  teamId: string;
  subIssues: SubIssue[];
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const utils = api.useUtils();

  const create = api.issue.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setAdding(false);
      void utils.issue.byIdentifier.invalidate();
      void utils.issue.list.invalidate();
    },
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
          Sub-issues {subIssues.length > 0 && `(${subIssues.length})`}
        </h3>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-ns-text-faint hover:text-ns-text-dim"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      <div className="rounded-md border border-ns-border">
        {subIssues.map((sub) => (
          <Link
            key={sub.id}
            href={`/issue/${sub.identifier}`}
            className="flex items-center gap-2 border-b border-ns-border px-2.5 py-1.5 text-sm last:border-b-0 hover:bg-white/5"
          >
            <StatusDot color={sub.state.color} />
            <span className="font-mono text-xs text-ns-text-faint">{sub.identifier}</span>
            <span className="flex-1 truncate text-ns-text-body">{sub.title}</span>
            {sub.assignee && <Avatar name={sub.assignee.name} color={sub.assignee.avatarColor} size={18} />}
          </Link>
        ))}

        {adding && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) {
                  create.mutate({ teamId, parentId, title: title.trim() });
                }
                if (e.key === "Escape") setAdding(false);
              }}
              onBlur={() => !title.trim() && setAdding(false)}
              placeholder="Sub-issue title, press Enter"
              className="w-full border-none bg-transparent text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint"
            />
          </div>
        )}

        {subIssues.length === 0 && !adding && (
          <div className="px-2.5 py-3 text-xs text-ns-text-faint">No sub-issues yet.</div>
        )}
      </div>
    </div>
  );
}
