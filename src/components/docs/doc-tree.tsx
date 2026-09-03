"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Plus } from "lucide-react";

export type DocNode = { id: string; title: string; parentId: string | null; sortOrder: number };

function buildTree(docs: DocNode[]) {
  const children = new Map<string | null, DocNode[]>();
  for (const doc of docs) {
    const key = doc.parentId;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(doc);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return children;
}

function TreeNode({
  doc,
  childrenByParent,
  selectedId,
  onCreateChild,
  depth,
}: {
  doc: DocNode;
  childrenByParent: Map<string | null, DocNode[]>;
  selectedId: string | null;
  onCreateChild: (parentId: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const kids = childrenByParent.get(doc.id) ?? [];

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md py-1 pr-1.5 text-sm hover:bg-white/5 ${
          selectedId === doc.id ? "bg-white/5 font-semibold text-ns-text" : "text-ns-text-dim"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 text-ns-text-faint ${kids.length === 0 ? "invisible" : ""}`}
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <Link href={`/docs?id=${doc.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-ns-text-faint" />
          <span className="truncate">{doc.title}</span>
        </Link>
        <button
          onClick={() => onCreateChild(doc.id)}
          className="hidden shrink-0 text-ns-text-faint hover:text-ns-text-dim group-hover:block"
          title="New sub-page"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {expanded &&
        kids.map((child) => (
          <TreeNode
            key={child.id}
            doc={child}
            childrenByParent={childrenByParent}
            selectedId={selectedId}
            onCreateChild={onCreateChild}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function DocTree({
  docs,
  selectedId,
  onCreateChild,
}: {
  docs: DocNode[];
  selectedId: string | null;
  onCreateChild: (parentId: string) => void;
}) {
  const childrenByParent = buildTree(docs);
  const roots = childrenByParent.get(null) ?? [];

  if (roots.length === 0) {
    return <div className="px-2 py-3 text-xs text-ns-text-faint">No pages yet.</div>;
  }

  return (
    <div>
      {roots.map((doc) => (
        <TreeNode
          key={doc.id}
          doc={doc}
          childrenByParent={childrenByParent}
          selectedId={selectedId}
          onCreateChild={onCreateChild}
          depth={0}
        />
      ))}
    </div>
  );
}
