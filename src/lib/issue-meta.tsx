import {
  AlertTriangle,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Minus,
  GitPullRequest,
  GitPullRequestDraft,
  GitMerge,
  GitPullRequestClosed,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";

export type Priority = "NO_PRIORITY" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type GitHubPrState = "OPEN" | "MERGED" | "CLOSED";

type IconComponent = ComponentType<{ className?: string; style?: CSSProperties }>;

export const PRIORITY_META: Record<Priority, { label: string; icon: IconComponent; color: string }> = {
  URGENT: { label: "Urgent", icon: AlertTriangle, color: "#ef4444" },
  HIGH: { label: "High", icon: SignalHigh, color: "#f59e0b" },
  MEDIUM: { label: "Medium", icon: SignalMedium, color: "#eab308" },
  LOW: { label: "Low", icon: SignalLow, color: "#64748b" },
  NO_PRIORITY: { label: "No priority", icon: Minus, color: "#a3a3a3" },
};

export const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"];

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  return <Icon className={className} style={{ color: meta.color }} />;
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className ?? ""}`}
      style={{ backgroundColor: color }}
    />
  );
}

export const PR_STATE_META: Record<GitHubPrState, { label: string; icon: IconComponent; color: string }> = {
  OPEN: { label: "Open", icon: GitPullRequest, color: "#22c55e" },
  MERGED: { label: "Merged", icon: GitMerge, color: "#8b5cf6" },
  CLOSED: { label: "Closed", icon: GitPullRequestClosed, color: "#ef4444" },
};

export function PrStateBadge({
  state,
  isDraft,
  className,
}: {
  state: GitHubPrState;
  isDraft?: boolean;
  className?: string;
}) {
  const draft = isDraft && state === "OPEN";
  const meta = draft ? { label: "Draft", icon: GitPullRequestDraft, color: "#a3a3a3" } : PR_STATE_META[state];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ""}`}
      style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function Avatar({
  name,
  color,
  size = 22,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials}
    </span>
  );
}
