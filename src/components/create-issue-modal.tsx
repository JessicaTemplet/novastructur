"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";

export function CreateIssueModal({
  open,
  onClose,
  teams,
  defaultTeamId,
}: {
  open: boolean;
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
    if (open) {
      setTitle("");
      setDescription("");
      setExpanded(false);
      setTeamId(defaultTeamId ?? teams[0]?.id ?? "");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open, defaultTeamId, teams]);

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

  if (!open) return null;

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
        className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-200"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.key} · {t.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-400">New issue</span>
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
            className="w-full border-none text-lg font-medium text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>

        {expanded ? (
          <div className="px-4 pt-1">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={4}
              className="w-full resize-none border-none text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
            />
          </div>
        ) : (
          <div className="px-4 pt-1 pb-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              + Add description
            </button>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2.5">
          <button
            type="button"
            disabled={!title.trim() || draft.isPending}
            onClick={() => draft.mutate({ title: title.trim() })}
            className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
            title="Draft a description with your configured AI provider (Settings → AI)"
          >
            {draft.isPending ? "Drafting…" : "✨ AI draft description"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || create.isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create issue"}
            </button>
          </div>
        </div>
        {draft.isError && (
          <div className="border-t border-neutral-100 px-4 py-2 text-xs text-red-600">
            {draft.error.message}
          </div>
        )}
      </div>
    </div>
  );
}
