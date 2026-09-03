"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Eye, Pencil } from "lucide-react";
import { api } from "@/trpc/react";
import { StatusDot } from "@/lib/issue-meta";
import { Markdown } from "@/lib/markdown";

export function DocEditor({ id }: { id: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: doc, isLoading } = api.doc.byId.useQuery({ id });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  // Only resync from the server when we've navigated to a *different* doc,
  // not on every refetch of the same one — otherwise an unrelated
  // invalidation (e.g. linking an issue) overwrites in-progress typing.
  const lastSyncedId = useRef<string | null>(null);
  // What this save is based on, tracked separately from `doc.content`
  // (the query result) since that can move on its own via invalidation
  // without this component's local edit being affected. The server
  // needs this to diff correctly against a concurrent edit rather than
  // whatever it currently has stored — see doc.update's baselineContent.
  const baselineContentRef = useRef("");
  useEffect(() => {
    if (doc && doc.id !== lastSyncedId.current) {
      setTitle(doc.title);
      setContent(doc.content);
      setPreview(false);
      lastSyncedId.current = doc.id;
      baselineContentRef.current = doc.content;
    }
  }, [doc]);

  const update = api.doc.update.useMutation({
    onSuccess: (updated) => {
      // This save's own result becomes the baseline for the next one.
      baselineContentRef.current = updated.content;
    },
    onSettled: () => {
      void utils.doc.byId.invalidate({ id });
      void utils.doc.list.invalidate();
    },
  });

  const del = api.doc.delete.useMutation({
    onSuccess: () => {
      void utils.doc.list.invalidate();
      router.push("/docs");
    },
  });

  if (isLoading || !doc) {
    return <div className="p-6 text-sm text-ns-text-faint">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== doc.title && update.mutate({ id, title })}
          rows={1}
          className="w-full resize-none border-none bg-transparent font-display text-2xl font-bold text-ns-text outline-none"
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setPreview((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ns-text-dim hover:bg-white/5"
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={() => confirm("Delete this page?") && del.mutate({ id })}
            className="rounded p-1.5 text-ns-text-faint hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {preview ? (
        <div className="mt-2">
          {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-ns-text-faint">Nothing here yet.</p>}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => content !== doc.content && update.mutate({ id, content, baselineContent: baselineContentRef.current })}
          placeholder="Write in markdown — # headings, **bold**, - lists, ```code```..."
          rows={18}
          className="mt-2 w-full resize-none border-none bg-transparent font-mono text-sm text-ns-text-body outline-none placeholder:text-ns-text-faint"
        />
      )}

      {doc.linkedIssues.length > 0 && (
        <div className="mt-8 border-t border-ns-border pt-4">
          <h3 className="mb-2 font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
            Linked issues ({doc.linkedIssues.length})
          </h3>
          <div className="space-y-1">
            {doc.linkedIssues.map((link) => (
              <Link
                key={link.id}
                href={`/issue/${link.issue.identifier}`}
                className="flex items-center gap-2 text-sm text-ns-text-body hover:underline"
              >
                <StatusDot color={link.issue.state.color} />
                {link.issue.identifier} {link.issue.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-ns-border pt-3 text-xs text-ns-text-faint">
        Last edited {new Date(doc.updatedAt).toLocaleString()} · by {doc.author.name}
      </div>
    </div>
  );
}
