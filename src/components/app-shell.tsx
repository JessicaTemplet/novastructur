"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ListTodo, Kanban, Settings, Search, Plus, LogOut, GitBranch, Repeat, Inbox, X, FileText, Zap, Milestone } from "lucide-react";
import { Avatar } from "@/lib/issue-meta";
import { CommandPalette } from "@/components/command-palette";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { NotificationBell } from "@/components/notification-bell";
import { api } from "@/trpc/react";

type Team = { id: string; name: string; key: string };
type SessionUser = { id: string; name?: string | null; email?: string | null; avatarColor: string };

type SavedView = {
  id: string;
  name: string;
  teamId: string | null;
  assigneeId: string | null;
  priority: string | null;
  labelId: string | null;
  query: string | null;
};

function viewHref(view: SavedView) {
  const params = new URLSearchParams();
  if (view.teamId) params.set("teamId", view.teamId);
  if (view.assigneeId) params.set("assigneeId", view.assigneeId);
  if (view.priority) params.set("priority", view.priority);
  if (view.labelId) params.set("labelId", view.labelId);
  if (view.query) params.set("query", view.query);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function AppShell({
  children,
  teams,
  user,
}: {
  children: React.ReactNode;
  teams: Team[];
  user: SessionUser | null;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();
  const { data: triageIssues = [] } = api.issue.list.useQuery(
    { stateType: "TRIAGE" },
    { enabled: !!user, refetchInterval: 30_000 }
  );
  const { data: savedViews = [] } = api.savedView.list.useQuery(undefined, { enabled: !!user });
  const utils = api.useUtils();
  const deleteView = api.savedView.delete.useMutation({
    onSuccess: () => void utils.savedView.list.invalidate(),
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (isTyping) return;
      if (e.key === "c") {
        e.preventDefault();
        setCreateOpen(true);
      }
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!user) return <>{children}</>;

  const navItem = (href: string, label: string, Icon: typeof ListTodo, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold tracking-wide uppercase transition border-l-2 ${
          active
            ? "bg-ns-accent-bg border-ns-accent text-ns-accent shadow-[0_0_14px_-4px_var(--color-ns-accent)]"
            : "border-transparent text-ns-text-dim hover:bg-white/5"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 font-display">{label}</span>
        {!!badge && (
          <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold normal-case text-ns-text-dim">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ns-bg">
      <aside className="ns-grid-bg flex w-56 shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-ns-border-strong bg-ns-bg-sidebar px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Image
              src="/assets/novastructur-logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md drop-shadow-[0_0_8px_var(--color-ns-accent)]"
            />
            <span className="font-display text-[13px] font-bold tracking-wide text-ns-text">NOVASTRUCTUR</span>
          </div>
          <NotificationBell />
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center justify-between rounded-md border border-ns-border-strong px-2.5 py-1.5 text-xs text-ns-text-dim hover:border-ns-accent/50"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> Search
          </span>
          <kbd className="rounded bg-white/10 px-1 font-mono text-[10px] text-ns-text-faint">⌘K</kbd>
        </button>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center justify-center gap-2 rounded-md bg-ns-accent-bg px-2.5 py-1.5 font-display text-[11px] font-bold tracking-wide text-ns-accent shadow-[0_0_16px_-2px_var(--color-ns-accent)] ring-1 ring-ns-accent/70 hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> NEW ISSUE
        </button>

        <nav className="flex flex-col gap-0.5">
          {navItem("/triage", "Triage", Inbox, triageIssues.length)}
          {navItem("/", "Issues", ListTodo)}
          {navItem("/board", "Board", Kanban)}
          {navItem("/cycles", "Cycles", Repeat)}
          {navItem("/roadmap", "Roadmap", Milestone)}
          {navItem("/docs", "Docs", FileText)}
        </nav>

        {savedViews.length > 0 && (
          <div>
            <div className="px-2.5 pb-1 font-display text-[10px] font-bold uppercase tracking-wider text-ns-text-faint">
              Views
            </div>
            <div className="flex flex-col gap-0.5">
              {savedViews.map((v) => (
                <div key={v.id} className="group flex items-center rounded-md hover:bg-white/5">
                  <Link
                    href={viewHref(v)}
                    className="flex-1 truncate px-2.5 py-1.5 text-[12px] text-ns-text-dim"
                  >
                    {v.name}
                  </Link>
                  <button
                    onClick={() => deleteView.mutate({ id: v.id })}
                    className="mr-1.5 hidden text-ns-text-faint hover:text-red-400 group-hover:block"
                    title="Delete view"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="px-2.5 pb-1 font-display text-[10px] font-bold uppercase tracking-wider text-ns-text-faint">
            Teams
          </div>
          <div className="flex flex-col gap-0.5">
            {teams.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-ns-text-dim"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded bg-white/10 font-mono text-[9px] font-semibold text-ns-text-faint">
                  {t.key.slice(0, 2)}
                </span>
                {t.name}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-0.5 border-t border-ns-border pt-2.5">
          {navItem("/settings/ai", "AI Settings", Settings)}
          {navItem("/settings/github", "GitHub", GitBranch)}
          {navItem("/settings/automation", "Automation", Zap)}
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="flex items-center gap-2 text-[12px] text-ns-text-dim">
              <Avatar name={user.name ?? user.email ?? "?"} color={user.avatarColor} size={20} />
              <span className="max-w-[100px] truncate">{user.name ?? user.email}</span>
            </span>
            <button
              onClick={() => signOut({ redirectTo: "/login" })}
              className="text-ns-text-faint hover:text-ns-text"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} onCreateIssue={() => setCreateOpen(true)} />
      )}
      {createOpen && <CreateIssueModal onClose={() => setCreateOpen(false)} teams={teams} />}
    </div>
  );
}
