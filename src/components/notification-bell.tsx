"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Dropdown } from "@/components/ui/dropdown";

export function NotificationBell() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: unreadCount = 0 } = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: notifications = [] } = api.notification.list.useQuery();

  const invalidate = () => {
    void utils.notification.list.invalidate();
    void utils.notification.unreadCount.invalidate();
  };
  const markRead = api.notification.markRead.useMutation({ onSettled: invalidate });
  const markAllRead = api.notification.markAllRead.useMutation({ onSettled: invalidate });

  return (
    <Dropdown
      align="right"
      trigger={
        <span className="relative flex items-center rounded p-1.5 hover:bg-white/5">
          <Bell className="h-4 w-4 text-ns-text-dim" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      }
    >
      {(close) => (
        <div className="w-80">
          <div className="flex items-center justify-between border-b border-ns-border px-3 py-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-ns-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-ns-text-faint">No notifications yet.</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead.mutate({ id: n.id });
                  close();
                  if (n.issue) router.push(`/issue/${n.issue.identifier}`);
                }}
                className={`flex w-full items-start gap-2 border-b border-ns-border px-3 py-2 text-left text-xs hover:bg-white/5 ${
                  n.read ? "" : "bg-ns-accent-bg/40"
                }`}
              >
                {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ns-accent" />}
                <span className={`flex-1 ${n.read ? "text-ns-text-dim" : "text-ns-text"}`}>
                  {n.message}
                  <div className="mt-0.5 text-[10px] text-ns-text-faint">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </div>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
