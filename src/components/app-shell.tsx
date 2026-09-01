"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
        className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
          active ? "bg-indigo-50 text-indigo-700" : "text-neutral-600 hover:bg-neutral-100"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{label}</span>
        {!!badge && (
          <span className="rounded-full bg-neutral-200 px-1.5 text-[10px] font-semibold text-neutral-600">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-3">
        <div className="mb-4 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600 text-xs font-semibold text-white">
              N
            </div>
            <span className="text-sm font-semibold text-neutral-900">NovaStructur</span>
          </div>
          <NotificationBell />
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-1 flex items-center justify-between rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-400 hover:border-neutral-300"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> Search
          </span>
          <kbd className="rounded bg-neutral-100 px-1 text-[10px]">⌘K</kbd>
        </button>

        <button
          onClick={() => setCreateOpen(true)}
          className="mb-4 flex items-center gap-2 rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" /> New issue
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
          <div className="mt-4">
            <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Views
            </div>
            <div className="flex flex-col gap-0.5">
              {savedViews.map((v) => (
                <div key={v.id} className="group flex items-center rounded-md hover:bg-neutral-100">
                  <Link
                    href={viewHref(v)}
                    className="flex-1 truncate px-2.5 py-1.5 text-sm text-neutral-600"
                  >
                    {v.name}
                  </Link>
                  <button
                    onClick={() => deleteView.mutate({ id: v.id })}
                    className="mr-1.5 hidden text-neutral-400 hover:text-red-600 group-hover:block"
                    title="Delete view"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Teams
          </div>
          <div className="flex flex-col gap-0.5">
            {teams.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-600"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded bg-neutral-100 text-[9px] font-semibold text-neutral-500">
                  {t.key.slice(0, 2)}
                </span>
                {t.name}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-0.5 border-t border-neutral-100 pt-2">
          {navItem("/settings/ai", "AI Settings", Settings)}
          {navItem("/settings/github", "GitHub", GitBranch)}
          {navItem("/settings/automation", "Automation", Zap)}
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="flex items-center gap-2 text-sm text-neutral-600">
              <Avatar name={user.name ?? user.email ?? "?"} color={user.avatarColor} size={20} />
              <span className="max-w-[100px] truncate">{user.name ?? user.email}</span>
            </span>
            <button
              onClick={() => signOut({ redirectTo: "/login" })}
              className="text-neutral-400 hover:text-neutral-700"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCreateIssue={() => setCreateOpen(true)}
      />
      <CreateIssueModal open={createOpen} onClose={() => setCreateOpen(false)} teams={teams} />
    </div>
  );
}
