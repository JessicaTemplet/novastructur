"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { api } from "@/trpc/react";
import { StatusDot } from "@/lib/issue-meta";

type RelationType = "BLOCKS" | "RELATES_TO" | "DUPLICATES";

type IssueWithRelations = {
  id: string;
  outgoingRelations: {
    id: string;
    type: RelationType;
    target: { id: string; identifier: string; title: string; state: { color: string } };
  }[];
  incomingRelations: {
    id: string;
    type: RelationType;
    source: { id: string; identifier: string; title: string; state: { color: string } };
  }[];
};

const TYPE_LABEL: Record<RelationType, string> = {
  BLOCKS: "blocks",
  RELATES_TO: "relates to",
  DUPLICATES: "duplicates",
};

export function Relations({ issue }: { issue: IssueWithRelations }) {
  const [adding, setAdding] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [type, setType] = useState<RelationType>("BLOCKS");
  const [error, setError] = useState("");
  const utils = api.useUtils();

  const addRelation = api.issue.addRelation.useMutation({
    onSuccess: () => {
      setIdentifier("");
      setAdding(false);
      setError("");
      void utils.issue.byIdentifier.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const removeRelation = api.issue.removeRelation.useMutation({
    onSuccess: () => void utils.issue.byIdentifier.invalidate(),
  });

  async function submit() {
    setError("");
    try {
      const target = await utils.issue.byIdentifier.fetch({ identifier: identifier.trim().toUpperCase() });
      addRelation.mutate({ sourceId: issue.id, targetId: target.id, type });
    } catch {
      setError("Issue not found");
    }
  }

  const total = issue.outgoingRelations.length + issue.incomingRelations.length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Relations {total > 0 && `(${total})`}
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="mb-2 flex items-center gap-1.5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RelationType)}
            className="rounded-md border border-neutral-200 px-1.5 py-1 text-xs"
          >
            <option value="BLOCKS">Blocks</option>
            <option value="RELATES_TO">Relates to</option>
            <option value="DUPLICATES">Duplicates</option>
          </select>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && identifier.trim() && submit()}
            placeholder="ENG-12"
            className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none"
          />
          <button
            onClick={submit}
            disabled={!identifier.trim()}
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-white disabled:opacity-40"
          >
            Link
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}

      {total === 0 && !adding && <div className="text-xs text-neutral-400">No relations yet.</div>}

      <div className="space-y-1">
        {issue.outgoingRelations.map((rel) => (
          <div key={rel.id} className="flex items-center gap-2 text-sm">
            <span className="text-xs text-neutral-400">{TYPE_LABEL[rel.type]}</span>
            <StatusDot color={rel.target.state.color} />
            <Link href={`/issue/${rel.target.identifier}`} className="truncate text-neutral-700 hover:underline">
              {rel.target.identifier} {rel.target.title}
            </Link>
            <button onClick={() => removeRelation.mutate({ id: rel.id })} className="text-neutral-300 hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {issue.incomingRelations.map((rel) => (
          <div key={rel.id} className="flex items-center gap-2 text-sm">
            <span className="text-xs text-neutral-400">
              {rel.type === "BLOCKS" ? "blocked by" : TYPE_LABEL[rel.type]}
            </span>
            <StatusDot color={rel.source.state.color} />
            <Link href={`/issue/${rel.source.identifier}`} className="truncate text-neutral-700 hover:underline">
              {rel.source.identifier} {rel.source.title}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
