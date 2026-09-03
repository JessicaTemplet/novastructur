"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

type Provider = "NONE" | "OPENAI" | "ANTHROPIC" | "OPENAI_COMPATIBLE";

const PROVIDER_LABEL: Record<Provider, string> = {
  NONE: "None",
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  OPENAI_COMPATIBLE: "Custom (OpenAI-compatible)",
};

export default function AiSettingsPage() {
  const { data: settings, isLoading } = api.ai.getSettings.useQuery();

  if (isLoading || !settings) {
    return <div className="mx-auto max-w-lg px-6 py-8 text-sm text-neutral-500">Loading…</div>;
  }

  // Keyed remount on first load instead of an effect re-syncing form state
  // from `settings`: nothing after this needs to re-seed from a fresh
  // fetch, `update`/`clear` below already set local state directly from
  // what was just saved, so a live re-sync would only risk clobbering an
  // in-progress edit if `settings` happens to refetch in the background.
  return <AiSettingsForm initialSettings={settings} />;
}

function AiSettingsForm({ initialSettings }: { initialSettings: { provider: Provider; model: string | null; baseUrl: string | null; hasKey: boolean } }) {
  const utils = api.useUtils();

  const [provider, setProvider] = useState<Provider>(initialSettings.provider as Provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialSettings.model ?? "");
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl ?? "");
  const [hasKey, setHasKey] = useState(initialSettings.hasKey);
  const [testResult, setTestResult] = useState<{ success: boolean; reply: string } | null>(null);

  const update = api.ai.updateSettings.useMutation({
    onSuccess: () => {
      setApiKey((prevKey) => {
        if (prevKey) setHasKey(true);
        return "";
      });
      void utils.ai.getSettings.invalidate();
    },
  });
  const clear = api.ai.clearSettings.useMutation({
    onSuccess: () => {
      setProvider("NONE");
      setApiKey("");
      setModel("");
      setBaseUrl("");
      setHasKey(false);
      setTestResult(null);
      void utils.ai.getSettings.invalidate();
    },
  });
  const test = api.ai.testConnection.useMutation({
    onSuccess: (res) => setTestResult(res),
  });

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">AI Settings</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Bring your own API key. Used for description drafting and other AI assist features.
        Your key is encrypted at rest and never shown again after saving.
      </p>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm"
          >
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        {provider !== "NONE" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">
                API key {hasKey && <span className="text-emerald-600">(configured — leave blank to keep)</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "••••••••••••" : "sk-..."}
                className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === "OPENAI" ? "gpt-4o-mini" : provider === "ANTHROPIC" ? "claude-sonnet-5" : "model name"}
                className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            {provider === "OPENAI_COMPATIBLE" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Base URL</label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                  className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() =>
              update.mutate({
                provider,
                apiKey: apiKey || undefined,
                model: model || undefined,
                baseUrl: provider === "OPENAI_COMPATIBLE" ? baseUrl : undefined,
              })
            }
            disabled={update.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          {hasKey && (
            <button
              onClick={() => test.mutate()}
              disabled={test.isPending}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {test.isPending ? "Testing…" : "Test connection"}
            </button>
          )}
          {provider !== "NONE" && (
            <button
              onClick={() => clear.mutate()}
              className="ml-auto text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>

        {testResult && (
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              testResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {testResult.success ? `Success: ${testResult.reply}` : `Failed: ${testResult.reply}`}
          </div>
        )}
      </div>
    </div>
  );
}
