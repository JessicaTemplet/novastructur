"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Sparkles } from "lucide-react";
import { api } from "@/trpc/react";
import { StatusPicker } from "@/components/pickers/status-picker";
import { PriorityPicker } from "@/components/pickers/priority-picker";
import { AssigneePicker } from "@/components/pickers/assignee-picker";
import { LabelPicker } from "@/components/pickers/label-picker";
import { CyclePicker } from "@/components/pickers/cycle-picker";
import { SubIssues } from "@/components/issue-detail/sub-issues";
import { Relations } from "@/components/issue-detail/relations";
import { GithubLinks } from "@/components/issue-detail/github-links";
import { LinkedDocs } from "@/components/issue-detail/linked-docs";
import { Comments } from "@/components/issue-detail/comments";
import { PRIORITY_META } from "@/lib/issue-meta";

export function IssueDetailView({ identifier }: { identifier: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: issue, isLoading } = api.issue.byIdentifier.useQuery({ identifier });
  const { data: teams = [] } = api.team.list.useQuery();
  const { data: cycles = [] } = api.cycle.list.useQuery(
    { teamId: issue?.team.id ?? "" },
    { enabled: !!issue }
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Only resync local field state when we land on a *different* issue, not
  // on every refetch of the same one — otherwise an unrelated invalidation
  // (e.g. changing the label while mid-edit) overwrites in-progress typing
  // with the last-saved server value.
  const lastSyncedId = useRef<string | null>(null);
  useEffect(() => {
    if (issue && issue.id !== lastSyncedId.current) {
      setTitle(issue.title);
      setDescription(issue.description ?? "");
      setEstimate(issue.estimate?.toString() ?? "");
      setDueDate(issue.dueDate ? new Date(issue.dueDate).toISOString().slice(0, 10) : "");
      lastSyncedId.current = issue.id;
    }
  }, [issue]);

  const update = api.issue.update.useMutation({
    onSettled: () => {
      void utils.issue.byIdentifier.invalidate({ identifier });
      void utils.issue.list.invalidate();
    },
  });

  const draft = api.ai.draftDescription.useMutation({
    onSuccess: (res) => {
      setDescription(res.description);
      update.mutate({ id: issue!.id, description: res.description });
    },
  });

  const del = api.issue.delete.useMutation({
    onSuccess: () => {
      void utils.issue.list.invalidate();
      router.push("/");
    },
  });

  if (isLoading || !issue) {
    return <div className="p-6 text-sm text-ns-text-faint">Loading…</div>;
  }

  const team = teams.find((t) => t.id === issue.team.id);
  const statusOptions = team?.workflowStates ?? [];

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-ns-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-ns-text-dim">
            <Link href="/" className="flex items-center gap-1 hover:text-ns-text">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <span className="font-mono text-xs">{issue.identifier}</span>
            {issue.parent && (
              <>
                <span className="text-ns-text-faint">/</span>
                <Link href={`/issue/${issue.parent.identifier}`} className="truncate text-xs hover:underline">
                  {issue.parent.identifier} {issue.parent.title}
                </Link>
              </>
            )}
          </div>
          <button
            onClick={() => confirm("Delete this issue?") && del.mutate({ id: issue.id })}
            className="rounded p-1.5 text-ns-text-faint hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto max-w-2xl px-6 py-6">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== issue.title && update.mutate({ id: issue.id, title })}
            rows={1}
            className="w-full resize-none border-none bg-transparent font-display text-2xl font-bold text-ns-text outline-none"
          />

          <div className="relative mt-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() =>
                description !== (issue.description ?? "") &&
                update.mutate({ id: issue.id, description: description || null })
              }
              placeholder="Add a description..."
              rows={5}
              className="w-full resize-none border-none bg-transparent text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint"
            />
            <button
              onClick={() => draft.mutate({ title: title || issue.title })}
              disabled={draft.isPending}
              className="absolute right-0 top-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ns-accent hover:bg-ns-accent-bg disabled:opacity-40"
              title="Draft with your configured AI provider (Settings → AI)"
            >
              <Sparkles className="h-3 w-3" /> {draft.isPending ? "Drafting…" : "AI draft"}
            </button>
          </div>
          {draft.isError && <p className="text-xs text-red-400">{draft.error.message}</p>}

          <div className="mt-8 border-t border-ns-border pt-6">
            <SubIssues parentId={issue.id} teamId={issue.team.id} subIssues={issue.subIssues} />
          </div>

          <div className="mt-8 border-t border-ns-border pt-6">
            <Relations issue={issue} />
          </div>

          <div className="mt-8 border-t border-ns-border pt-6">
            <GithubLinks issue={issue} />
          </div>

          <div className="mt-8 border-t border-ns-border pt-6">
            <LinkedDocs issueId={issue.id} linkedDocs={issue.linkedDocs} />
          </div>

          <div className="mt-8 border-t border-ns-border pt-6">
            <Comments issueId={issue.id} comments={issue.comments} />
          </div>
        </div>
      </div>

      <aside className="w-64 shrink-0 border-l border-ns-border p-4">
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Status</div>
            <StatusPicker issueId={issue.id} current={issue.state} options={statusOptions} />
            <span className="ml-1.5 text-sm text-ns-text-body">{issue.state.name}</span>
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Priority</div>
            <PriorityPicker issueId={issue.id} current={issue.priority} />
            <span className="ml-1.5 text-sm text-ns-text-body">{PRIORITY_META[issue.priority].label}</span>
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Assignee</div>
            <div className="flex items-center gap-1.5">
              <AssigneePicker issueId={issue.id} current={issue.assignee} />
              <span className="text-sm text-ns-text-body">{issue.assignee?.name ?? "Unassigned"}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Cycle</div>
            <CyclePicker issueId={issue.id} current={issue.cycle} cycles={cycles} />
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Labels</div>
            <div className="flex flex-wrap items-center gap-1">
              {issue.labels.map(({ label }) => (
                <span
                  key={label.id}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: `${label.color}1a`, color: label.color }}
                >
                  {label.name}
                </span>
              ))}
              <LabelPicker issueId={issue.id} current={issue.labels.map((l) => l.label)} />
            </div>
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Estimate</div>
            <input
              type="number"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={(e) =>
                update.mutate({ id: issue.id, estimate: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="—"
              className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70"
            />
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Due date</div>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                update.mutate({
                  id: issue.id,
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                });
              }}
              className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-sm text-ns-text-body outline-none focus:border-ns-accent/70"
            />
          </div>
          <div className="border-t border-ns-border pt-3 text-xs text-ns-text-faint">
            <div>Created by {issue.creator.name}</div>
            <div>{new Date(issue.createdAt).toLocaleString()}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
