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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Docs {linkedDocs.length > 0 && `(${linkedDocs.length})`}
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700"
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
            className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
          />
          {query.trim() && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
              {matches.map((d) => (
                <button
                  key={d.id}
                  onClick={() => link.mutate({ docId: d.id, issueId })}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-50"
                >
                  <FileText className="h-3 w-3 text-neutral-400" /> {d.title}
                </button>
              ))}
              <button
                onClick={() => createAndLink.mutate({ title: query.trim() })}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-indigo-600 hover:bg-indigo-50"
              >
                <Plus className="h-3 w-3" /> Create &quot;{query.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}

      {linkedDocs.length === 0 && !adding && <div className="text-xs text-neutral-400">No linked docs yet.</div>}

      <div className="space-y-1">
        {linkedDocs.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <Link href={`/docs?id=${l.doc.id}`} className="truncate text-neutral-700 hover:underline">
              {l.doc.title}
            </Link>
            <button onClick={() => unlink.mutate({ id: l.id })} className="ml-auto shrink-0 text-neutral-300 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
