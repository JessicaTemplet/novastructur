"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";

type FlowState =
  | { phase: "idle" }
  | { phase: "connecting"; userCode: string; verificationUri: string }
  | { phase: "error"; message: string };

// Persists the in-flight device code so a page reload or an accidental
// navigation away and back can resume polling against the same GitHub
// device code instead of forcing a fresh "Connect" (which would mint a new
// code and orphan one the user may have already approved). Bounded by
// GitHub's own expiry (`expiresAt`), so a stale entry self-clears.
const STORAGE_KEY = "novastructur:github-device-auth";

interface PersistedDeviceAuth {
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
}

function loadPersistedFlow(): PersistedDeviceAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDeviceAuth;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedFlow(entry: PersistedDeviceAuth): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage can be unavailable (private mode, quota); resuming after a
    // reload just won't work this time, which is the pre-existing behavior.
  }
}

function clearPersistedFlow(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover here.
  }
}

export default function GitHubSettingsPage() {
  const utils = api.useUtils();
  const { data: connection } = api.github.getConnection.useQuery();

  // Resume against a still-pending device code left over from before a
  // reload/navigation, if one exists and hasn't expired yet — lazy-init so
  // this read happens during render, not as a setState inside an effect.
  const [flow, setFlow] = useState<FlowState>(() => {
    const persisted = loadPersistedFlow();
    if (!persisted) return { phase: "idle" };
    return { phase: "connecting", userCode: persisted.userCode, verificationUri: persisted.verificationUri };
  });
  const [copied, setCopied] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAuth = api.github.startDeviceAuth.useMutation();
  const pollAuth = api.github.pollDeviceAuth.useMutation();
  const disconnect = api.github.disconnect.useMutation({
    onSuccess: () => void utils.github.getConnection.invalidate(),
  });

  function stopPolling() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  // Actually resume polling (a genuine external-system interaction, unlike
  // the state restore above) if we came up already in "connecting" phase.
  useEffect(() => {
    const persisted = loadPersistedFlow();
    if (persisted) schedulePoll(persisted.interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schedulePoll(intervalSeconds: number) {
    stopPolling();
    pollTimer.current = setTimeout(async () => {
      try {
        const result = await pollAuth.mutateAsync();
        if (result.status === "pending") {
          schedulePoll(intervalSeconds);
        } else if (result.status === "slow_down") {
          schedulePoll(result.interval);
        } else if (result.status === "ok") {
          clearPersistedFlow();
          setFlow({ phase: "idle" });
          void utils.github.getConnection.invalidate();
        } else if (result.status === "expired") {
          clearPersistedFlow();
          setFlow({ phase: "error", message: "Code expired — try connecting again." });
        } else {
          clearPersistedFlow();
          setFlow({ phase: "error", message: "Authorization was denied." });
        }
      } catch (err) {
        setFlow({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      }
    }, intervalSeconds * 1000);
  }

  async function handleConnect() {
    setFlow({ phase: "idle" });
    try {
      const res = await startAuth.mutateAsync();
      setFlow({ phase: "connecting", userCode: res.userCode, verificationUri: res.verificationUri });
      savePersistedFlow({
        userCode: res.userCode,
        verificationUri: res.verificationUri,
        interval: res.interval,
        expiresAt: Date.now() + res.expiresIn * 1000,
      });
      schedulePoll(res.interval);
    } catch (err) {
      setFlow({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  function handleCancel() {
    stopPolling();
    clearPersistedFlow();
    setFlow({ phase: "idle" });
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; nothing to recover here.
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">GitHub</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Connect GitHub to link issues to pull requests. Status updates automatically as PRs open
        and merge — no manual ticket updates. Requests the <code>repo</code> scope, so it can read
        PR status on private repos too.
      </p>

      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        {connection?.connected ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-700">
              Connected as <span className="font-medium">{connection.githubLogin}</span>
            </span>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : flow.phase === "connecting" ? (
          <div className="space-y-3 text-center">
            <p className="text-xs text-neutral-500">Enter this code at {flow.verificationUri}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-md bg-neutral-100 px-4 py-2 font-mono text-lg tracking-widest text-neutral-900">
                {flow.userCode}
              </span>
              <button
                onClick={() => handleCopy(flow.userCode)}
                className="rounded-md border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a
              href={flow.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Open GitHub
            </a>
            <div>
              <button onClick={handleCancel} className="text-xs text-neutral-400 hover:underline">
                Cancel
              </button>
            </div>
            <p className="text-xs text-neutral-400">Waiting for authorization…</p>
          </div>
        ) : (
          <div>
            <button
              onClick={handleConnect}
              disabled={startAuth.isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {startAuth.isPending ? "Starting…" : "Connect GitHub"}
            </button>
            {flow.phase === "error" && (
              <p className="mt-2 text-xs text-red-600">{flow.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
