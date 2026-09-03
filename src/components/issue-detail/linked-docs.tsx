"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, X } from "lucide-react";
import { api } from "@/trpc/react";

type LinkedDoc = { id: string; doc: { id: string; title: string } };

export function LinkedDocs({ issueId, linkedDocs }: { issueId: string; linkedDocs: LinkedDoc[] }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const utils = api.useUtils();

  const { data: allDocs = [] } = api.doc.list.useQuery(undefined, { enabled: adding });

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const linkedIds = new Set(linkedDocs.map((l) => l.doc.id));
    const q = query.toLowerCase();
    return allDocs.filter((d) => !linkedIds.has(d.id) && d.title.toLowerCase().includes(q)).slice(0, 6);
  }, [allDocs, query, linkedDocs]);

  const link = api.doc.linkIssue.useMutation({
    onSuccess: () => {
      setQuery("");
      setAdding(false);
      void utils.issue.byIdentifier.invalidate();
    },
  });

  const unlink = api.doc.unlinkIssue.useMutation({
    onSuccess: () => void utils.issue.byIdentifier.invalidate(),
  });

  const createAndLink = api.doc.create.useMutation({
    onSuccess: (doc) => link.mutate({ docId: doc.id, issueId }),
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
          Docs {linkedDocs.length > 0 && `(${linkedDocs.length})`}
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs text-ns-text-faint hover:text-ns-text-dim"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="relative mb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="Search docs or type a new title..."
            className="w-full rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-body outline-none placeholder:text-ns-text-faint focus:border-ns-accent/70"
          />
          {query.trim() && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-ns-border-strong bg-ns-bg-elevated py-1 shadow-lg shadow-black/40">
              {matches.map((d) => (
                <button
                  key={d.id}
                  onClick={() => link.mutate({ docId: d.id, issueId })}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-ns-text-body hover:bg-white/5"
                >
                  <FileText className="h-3 w-3 text-ns-text-faint" /> {d.title}
                </button>
              ))}
              <button
                onClick={() => createAndLink.mutate({ title: query.trim() })}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-ns-accent hover:bg-ns-accent-bg"
              >
                <Plus className="h-3 w-3" /> Create &quot;{query.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}

      {linkedDocs.length === 0 && !adding && <div className="text-xs text-ns-text-faint">No linked docs yet.</div>}

      <div className="space-y-1">
        {linkedDocs.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <FileText className="h-3.5 w-3.5 shrink-0 text-ns-text-faint" />
            <Link href={`/docs?id=${l.doc.id}`} className="truncate text-ns-text-body hover:underline">
              {l.doc.title}
            </Link>
            <button onClick={() => unlink.mutate({ id: l.id })} className="ml-auto shrink-0 text-ns-text-faint hover:text-red-400">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
