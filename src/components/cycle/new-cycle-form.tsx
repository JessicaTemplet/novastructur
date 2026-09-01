"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function NewCycleForm({
  teamId,
  nextNumber,
  onClose,
  onCreated,
}: {
  teamId: string;
  nextNumber: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const today = new Date();
  const twoWeeksOut = new Date(today.getTime() + 13 * 24 * 60 * 60 * 1000);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(toDateInput(today));
  const [endDate, setEndDate] = useState(toDateInput(twoWeeksOut));
  const utils = api.useUtils();

  const create = api.cycle.create.useMutation({
    onSuccess: async (cycle) => {
      await utils.cycle.list.invalidate();
      onCreated(cycle.id);
    },
  });

  const submit = () => {
    if (!startDate || !endDate || create.isPending) return;
    create.mutate({
      teamId,
      name: name.trim() || undefined,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    });
  };

  return (
    <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Cycle ${nextNumber}`}
        className="w-32 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
      />
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
      />
      <span className="text-xs text-neutral-400">to</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
      />
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={create.isPending}
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Start cycle"}
        </button>
      </div>
      {create.isError && <span className="text-xs text-red-600">{create.error.message}</span>}
    </div>
  );
}
