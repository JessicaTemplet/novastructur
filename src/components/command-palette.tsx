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

// The parent only mounts this when open (see app-shell.tsx), so every fresh
// open is a fresh mount: `query` starts blank on its own via useState, no
// effect needed to reset it. Only the imperative focus-the-input side
// effect stays as an effect, since that's genuinely a DOM action, not a
// state sync.
export function CommandPalette({
  onClose,
  onCreateIssue,
}: {
  onClose: () => void;
  onCreateIssue: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, []);

  const debouncedQuery = useDebouncedValue(query, 200);
  const searchResults = api.issue.list.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.trim().length > 0 }
  );
  const { data: allDocs = [] } = api.doc.list.useQuery(undefined, { enabled: query.trim().length > 0 });

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-ns-border-strong bg-ns-bg-sidebar shadow-[0_0_40px_rgba(0,0,0,.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ns-border px-3 py-3">
          <Search className="h-4 w-4 text-ns-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Type a command or search…"
            className="w-full border-none bg-transparent text-[13px] text-ns-text-body outline-none placeholder:text-ns-text-faint"
          />
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-ns-text-faint">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {issues.length > 0 && (
            <div className="px-2.5 pb-1 pt-2 font-display text-[10px] font-bold uppercase tracking-wider text-ns-text-faint">
              Issues
            </div>
          )}
          {issues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => runAndClose(() => router.push(`/issue/${issue.identifier}`))}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] text-ns-text-body hover:bg-white/5"
            >
              <StatusDot color={issue.state.color} />
              <span className="font-mono text-ns-text-faint">{issue.identifier}</span>
              <span className="truncate">{issue.title}</span>
            </button>
          ))}

          {docs.length > 0 && (
            <div className="px-2.5 pb-1 pt-2 font-display text-[10px] font-bold uppercase tracking-wider text-ns-text-faint">
              Docs
            </div>
          )}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => runAndClose(() => router.push(`/docs?id=${d.id}`))}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] text-ns-text-body hover:bg-white/5"
            >
              <FileText className="h-3.5 w-3.5 text-ns-text-faint" />
              <span className="truncate">{d.title}</span>
            </button>
          ))}

          {filteredActions.length > 0 && (
            <div className="px-2.5 pb-1 pt-2 font-display text-[10px] font-bold uppercase tracking-wider text-ns-text-faint">
              Actions
            </div>
          )}
          {filteredActions.map((action) => (
            <button
              key={action.id}
              onClick={() => runAndClose(action.run)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] text-ns-text-body hover:bg-white/5"
            >
              <span className="text-ns-accent">›</span>
              {action.label}
            </button>
          ))}

          {issues.length === 0 && docs.length === 0 && filteredActions.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-ns-text-faint">No results</div>
          )}
        </div>

        <div className="border-t border-ns-border px-4 py-2.5 font-mono text-[10px] text-ns-text-faint">
          ↑↓ navigate · ↵ select · esc close
        </div>
      </div>
    </div>
  );
}
