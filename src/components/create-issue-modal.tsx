"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

// The parent only mounts this when open (see app-shell.tsx), so every
// fresh open is a fresh mount: every field's useState starts at its blank
// default on its own, no effect needed to reset them. Only the imperative
// focus-the-input side effect stays as an effect.
export function CreateIssueModal({
  onClose,
  teams,
  defaultTeamId,
}: {
  onClose: () => void;
  teams: { id: string; name: string; key: string }[];
  defaultTeamId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const utils = api.useUtils();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, []);

  const create = api.issue.create.useMutation({
    onSuccess: async (issue) => {
      await utils.issue.list.invalidate();
      onClose();
      router.push(`/issue/${issue.identifier}`);
    },
  });

  const draft = api.ai.draftDescription.useMutation({
    onSuccess: (res) => setDescription(res.description),
  });

  const submit = () => {
    if (!title.trim() || !teamId || create.isPending) return;
    create.mutate({ teamId, title: title.trim(), description: description.trim() || undefined });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-ns-border-strong bg-ns-bg-elevated shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ns-border px-4 py-2.5">
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-ns-text-dim hover:border-ns-border-strong"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.key} · {t.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-ns-text-faint">New issue</span>
        </div>

        <div className="px-4 pt-3">
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Issue title"
            className="w-full border-none bg-transparent text-lg font-medium text-ns-text outline-none placeholder:text-ns-text-faint"
          />
        </div>

        {expanded ? (
          <div className="px-4 pt-1">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={4}
              className="w-full resize-none border-none bg-transparent text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint"
            />
          </div>
        ) : (
          <div className="px-4 pt-1 pb-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-ns-text-faint hover:text-ns-text-dim"
            >
              + Add description
            </button>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-ns-border px-4 py-2.5">
          <button
            type="button"
            disabled={!title.trim() || draft.isPending}
            onClick={() => draft.mutate({ title: title.trim() })}
            className="rounded-md px-2 py-1 text-xs font-medium text-ns-accent hover:bg-ns-accent-bg disabled:opacity-40"
            title="Draft a description with your configured AI provider (Settings → AI)"
          >
            {draft.isPending ? "Drafting…" : "✨ AI draft description"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-ns-text-dim hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || create.isPending}
              className="rounded-md bg-ns-accent-bg px-3 py-1.5 text-sm font-bold text-ns-accent ring-1 ring-ns-accent/70 hover:brightness-110 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create issue"}
            </button>
          </div>
        </div>
        {draft.isError && (
          <div className="border-t border-ns-border px-4 py-2 text-xs text-red-400">
            {draft.error.message}
          </div>
        )}
      </div>
    </div>
  );
}
