"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Kanban, ListTodo, Settings, Plus, Repeat, Inbox, FileText, Milestone } from "lucide-react";
import { api } from "@/trpc/react";
import { StatusDot } from "@/lib/issue-meta";
import { useDebouncedValue } from "@/lib/use-debounced-value";

type Action = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  onCreateIssue,
}: {
  open: boolean;
  onClose: () => void;
  onCreateIssue: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const debouncedQuery = useDebouncedValue(query, 200);
  const searchResults = api.issue.list.useQuery(
    { query: debouncedQuery },
    { enabled: open && debouncedQuery.trim().length > 0 }
  );
  const { data: allDocs = [] } = api.doc.list.useQuery(undefined, { enabled: open && query.trim().length > 0 });

  const staticActions: Action[] = useMemo(
    () => [
      { id: "new", label: "Create new issue", icon: Plus, run: onCreateIssue },
      { id: "triage", label: "Go to Triage", icon: Inbox, run: () => router.push("/triage") },
      { id: "issues", label: "Go to Issues", icon: ListTodo, run: () => router.push("/") },
      { id: "board", label: "Go to Board", icon: Kanban, run: () => router.push("/board") },
      { id: "cycles", label: "Go to Cycles", icon: Repeat, run: () => router.push("/cycles") },
      { id: "roadmap", label: "Go to Roadmap", icon: Milestone, run: () => router.push("/roadmap") },
      { id: "docs", label: "Go to Docs", icon: FileText, run: () => router.push("/docs") },
      { id: "settings", label: "Go to AI Settings", icon: Settings, run: () => router.push("/settings/ai") },
      {
        id: "automation",
        label: "Go to Automation settings",
        icon: Settings,
        run: () => router.push("/settings/automation"),
      },
    ],
    [onCreateIssue, router]
  );

  if (!open) return null;

  const filteredActions = staticActions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );
  const issues = query.trim() ? (searchResults.data ?? []).slice(0, 8) : [];
  const docs = query.trim()
    ? allDocs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const runAndClose = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search issues or jump to..."
            className="w-full border-none text-sm outline-none placeholder:text-neutral-400"
          />
          <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {issues.length > 0 && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Issues
            </div>
          )}
          {issues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => runAndClose(() => router.push(`/issue/${issue.identifier}`))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <StatusDot color={issue.state.color} />
              <span className="text-neutral-400">{issue.identifier}</span>
              <span className="truncate text-neutral-800">{issue.title}</span>
            </button>
          ))}

          {docs.length > 0 && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Docs
            </div>
          )}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => runAndClose(() => router.push(`/docs?id=${d.id}`))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <FileText className="h-3.5 w-3.5 text-neutral-400" />
              <span className="truncate text-neutral-800">{d.title}</span>
            </button>
          ))}

          {filteredActions.length > 0 && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Actions
            </div>
          )}
          {filteredActions.map((action) => (
            <button
              key={action.id}
              onClick={() => runAndClose(action.run)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <action.icon className="h-4 w-4 text-neutral-500" />
              <span className="text-neutral-800">{action.label}</span>
            </button>
          ))}

          {issues.length === 0 && docs.length === 0 && filteredActions.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-neutral-400">No results</div>
          )}
        </div>
      </div>
    </div>
  );
}
