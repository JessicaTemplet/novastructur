"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/trpc/react";
import { DocTree } from "@/components/docs/doc-tree";
import { DocEditor } from "@/components/docs/doc-editor";

export default function DocsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get("id");

  const utils = api.useUtils();
  const { data: docs = [] } = api.doc.list.useQuery();

  const create = api.doc.create.useMutation({
    onSuccess: (doc) => {
      void utils.doc.list.invalidate();
      router.push(`/docs?id=${doc.id}`);
    },
  });

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-ns-border p-2">
        <div className="mb-1 flex items-center justify-between px-2 pt-1">
          <h2 className="font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">Docs</h2>
          <button
            onClick={() => create.mutate({ title: "Untitled" })}
            className="text-ns-text-faint hover:text-ns-text-dim"
            title="New page"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <DocTree
          docs={docs}
          selectedId={selectedId}
          onCreateChild={(parentId) => create.mutate({ title: "Untitled", parentId })}
        />
      </aside>

      <div className="flex-1 overflow-y-auto">
        {selectedId ? (
          <DocEditor id={selectedId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-ns-text-dim">
              {docs.length === 0 ? "No pages yet" : "Select a page"}
            </p>
            <button
              onClick={() => create.mutate({ title: "Untitled" })}
              className="flex items-center gap-1 rounded-md bg-ns-accent-bg px-3 py-1.5 text-sm font-bold text-ns-accent ring-1 ring-ns-accent/70 hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" /> New page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
