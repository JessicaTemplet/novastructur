"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Avatar } from "@/lib/issue-meta";

type Comment = {
  id: string;
  body: string;
  createdAt: string | Date;
  author: { id: string; name: string; avatarColor: string };
};

export function Comments({ issueId, comments }: { issueId: string; comments: Comment[] }) {
  const [body, setBody] = useState("");
  const utils = api.useUtils();

  const addComment = api.issue.addComment.useMutation({
    onSuccess: () => {
      setBody("");
      void utils.issue.byIdentifier.invalidate();
    },
  });

  return (
    <div>
      <h3 className="mb-2 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.author.name} color={c.author.avatarColor} size={24} />
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-ns-text">{c.author.name}</span>
                <span className="text-xs text-ns-text-faint">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ns-text-body">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2.5">
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
                addComment.mutate({ issueId, body: body.trim() });
              }
            }}
            placeholder="Leave a comment... (⌘+Enter to send)"
            rows={2}
            className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-2.5 py-1.5 text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70"
          />
          <button
            onClick={() => body.trim() && addComment.mutate({ issueId, body: body.trim() })}
            disabled={!body.trim() || addComment.isPending}
            className="mt-1.5 rounded-md bg-ns-accent-bg px-3 py-1 text-xs font-bold text-ns-accent ring-1 ring-ns-accent/70 disabled:opacity-40"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
