import React, { useState, useEffect } from "react";

interface Issue {
  id: string;
  title: string;
  status: string;
  priority: string;
  label: string;
  assignee: string | null;
  priorityColor: string;
  statusColor: string;
  avatarColor: string | null;
}

interface RoadmapItem {
  title: string;
  status: string;
  color: string;
}

interface RoadmapQuarter {
  name: string;
  items: RoadmapItem[];
}

interface DocTreeItem {
  title: string;
  paddingLeft: string;
  color: string;
  bg: string;
  weight: number;
}

// ---- helpers ----
const priorityColor = (p: string): string => ({
  Urgent: "oklch(70% 0.19 25)",
  High: "oklch(80% 0.17 80)",
  Medium: "oklch(82% 0.15 200)",
  Low: "oklch(80% 0.006 260)",
}[p]);

const avatarColor = (initials: string): string => ({
  AR: "oklch(75% 0.13 340)",
  JS: "oklch(75% 0.12 20)",
  TK: "oklch(75% 0.13 250)",
  MV: "oklch(75% 0.13 150)",
}[initials] || "oklch(75% 0.02 260)");

const statusColor = (s: string): string => ({
  Backlog: "oklch(80% 0.006 260)",
  Todo: "oklch(82% 0.15 200)",
  "In Progress": "oklch(82% 0.17 80)",
  "In Review": "oklch(78% 0.17 330)",
  Done: "oklch(79% 0.16 150)",
}[s]);

const makeIssue = (id: string, title: string, status: string, priority: string, assignee: string | null, label: string): Issue => ({
  id,
  title,
  status,
  priority,
  label,
  assignee,
  priorityColor: priorityColor(priority),
  statusColor: statusColor(status),
  avatarColor: assignee ? avatarColor(assignee) : null,
});

const ALL_ISSUES = [
  makeIssue("ENG-142", 'Rename "Uncategorized" to something a human would say', "Backlog", "Low", null, "polish"),
  makeIssue("ENG-118", "Docs sync is lying to us again", "Backlog", "Medium", null, "docs"),
  makeIssue("ENG-151", "Onboarding flow forgets you exist", "Todo", "High", "AR", "frontend"),
  makeIssue("ENG-160", "CI is now faster than my patience", "In Progress", "Urgent", "JS", "infra"),
  makeIssue("ENG-163", "Add confetti on ship", "In Progress", "Low", "TK", "delight"),
  makeIssue("ENG-155", "Dark mode: everything's dark except the bugs", "In Review", "Medium", "MV", "frontend"),
  makeIssue("ENG-140", "Cycle burndown chart burns morale", "Done", "Low", "AR", "reports"),
];

const STATUSES = ["Backlog", "Todo", "In Progress", "In Review", "Done"];
const BOARD_COLUMNS: { name: string; color: string; items: Issue[] }[] = STATUSES.map((s) => ({
  name: s,
  color: statusColor(s),
  items: ALL_ISSUES.filter((i) => i.status === s),
}));
const ISSUES_GROUPS = BOARD_COLUMNS.filter((c) => c.items.length);

const TRIAGE_ITEMS = [
  { id: "T-1", title: "Slack bot posts issue links twice", source: "via Slack" },
  { id: "T-2", title: "New hire can't find the roadmap", source: "via Email" },
  { id: "T-3", title: "Someone requested dark mode... again", source: "via GitHub" },
  { id: "T-4", title: "API rate-limit emails look scary", source: "via Sentry" },
];

const ROADMAP_QUARTERS = [
  { name: "Q3 2026", items: [{ title: "AI code review companion", status: "In Progress" }, { title: "Multi-repo triage", status: "Todo" }] },
  { name: "Q4 2026", items: [{ title: "Roadmap timeline v2", status: "Backlog" }, { title: "Docs live-sync", status: "Todo" }] },
  { name: "Q1 2027", items: [{ title: "Mobile companion app", status: "Backlog" }] },
].map((q): RoadmapQuarter => ({ ...q, items: q.items.map((it) => ({ ...it, color: statusColor(it.status) })) }));

const DOCS_TREE = [
  { title: "Getting Started" },
  { title: "Architecture", active: true },
  { title: "Git Bridge", indent: true },
  { title: "MCP Server", indent: true },
  { title: "Contributing" },
].map((d): DocTreeItem => ({
  title: d.title,
  paddingLeft: d.indent ? "22px" : "10px",
  color: d.active ? "#f2fbfc" : "oklch(75% 0.006 260)",
  bg: d.active ? "oklch(26% 0.02 260)" : "transparent",
  weight: d.active ? 700 : 500,
}));

const NAV_ITEMS = [
  { key: "triage", label: "TRIAGE" },
  { key: "issues", label: "ISSUES" },
  { key: "board", label: "BOARD" },
  { key: "cycles", label: "CYCLES" },
  { key: "roadmap", label: "ROADMAP" },
  { key: "docs", label: "DOCS" },
];

const bgDots = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)",
  backgroundSize: "24px 24px",
};

export default function NovaStructurApp() {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [page, setPage] = useState<string>("board");
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);

  useEffect(() => {
    const link1 = document.createElement("link");
    link1.rel = "preconnect";
    link1.href = "https://fonts.googleapis.com";
    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href =
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link1);
    document.head.appendChild(link2);
    return () => {
      document.head.removeChild(link1);
      document.head.removeChild(link2);
    };
  }, []);

  const goPage = (p: string) => {
    setPage(p);
    setActiveIssue(null);
    setPaletteOpen(false);
  };
  const openIssue = (issue: Issue) => {
    setActiveIssue(issue);
    setPaletteOpen(false);
  };

  if (!loggedIn) {
    return (
      <div
        style={{
          width: "100%",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "oklch(19% 0.014 260)",
          fontFamily: "'Inter',sans-serif",
          ...bgDots,
        }}
      >
        <div
          style={{
            width: 360,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            padding: "36px 32px",
            background: "oklch(17% 0.014 260)",
            border: "1px solid oklch(36% 0.02 260)",
            borderRadius: 14,
            boxShadow: "0 0 40px rgba(0,0,0,.4)",
          }}
        >
          <img src="/assets/novastructur-logo.png" style={{ width: 56, height: 56, borderRadius: 12, filter: "hue-rotate(150deg) saturate(1.6) brightness(1.15) drop-shadow(0 0 14px oklch(82% 0.15 200 / .7))" }} alt="NovaStructur" />
          <div style={{ textAlign: "center" }}>
            <div style={{ font: "800 20px 'Plus Jakarta Sans'", color: "#f2fbfc", letterSpacing: ".02em" }}>NOVASTRUCTUR</div>
            <div style={{ font: "500 12.5px 'Inter'", color: "oklch(80% 0.006 260)", marginTop: 6 }}>
              Where structure meets a little bit of joy
            </div>
          </div>
          <div
            style={{
              width: "100%",
              background: "oklch(22% 0.04 200)",
              border: "1px solid oklch(82% 0.15 200 / .7)",
              boxShadow: "0 0 16px oklch(82% 0.15 200 / .35)",
              color: "oklch(90% 0.11 200)",
              borderRadius: 8,
              padding: 11,
              font: "700 13px 'Plus Jakarta Sans'",
              textAlign: "center",
              letterSpacing: ".02em",
              cursor: "pointer",
            }}
            onClick={() => setLoggedIn(true)}
          >
            Continue with GitHub
          </div>
          <div style={{ font: "500 11px 'Inter'", color: "oklch(60% 0.006 260)" }}>or continue with email</div>
        </div>
      </div>
    );
  }

  const showDetail = !!activeIssue;
  const navStyle = (key: string): React.CSSProperties => {
    const active = page === key && !showDetail;
    return {
      padding: "7px 10px",
      borderRadius: 5,
      background: active ? "oklch(26% 0.04 200)" : "transparent",
      borderLeft: active ? "2px solid oklch(82% 0.15 200)" : "2px solid transparent",
      color: active ? "oklch(90% 0.11 200)" : "oklch(80% 0.006 260)",
      fontWeight: active ? 700 : 600,
      fontSize: 11.5,
      fontFamily: "'Inter'",
      letterSpacing: ".02em",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
    };
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        fontFamily: "'Inter',sans-serif",
        background: "oklch(19% 0.014 260)",
        position: "relative",
        overflow: "hidden",
        ...bgDots,
      }}
    >
      {/* sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: "1px solid oklch(36% 0.02 260)",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "oklch(17% 0.014 260)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/assets/novastructur-logo.png" style={{ width: 28, height: 28, borderRadius: 6, filter: "hue-rotate(150deg) saturate(1.6) brightness(1.15) drop-shadow(0 0 8px oklch(82% 0.15 200 / .7))" }} alt="" />
          <span style={{ font: "700 13px 'Plus Jakarta Sans'", color: "#f2fbfc", letterSpacing: ".03em" }}>NOVASTRUCTUR</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid oklch(36% 0.02 260)",
            borderRadius: 6,
            padding: "7px 10px",
            color: "oklch(70% 0.006 260)",
            font: "500 12px 'Inter'",
            cursor: "pointer",
          }}
          onClick={() => setPaletteOpen((v) => !v)}
        >
          <span>Search</span>
          <span style={{ font: "500 10px ui-monospace", background: "oklch(24% 0.02 260)", padding: "2px 5px", borderRadius: 4 }}>⌘K</span>
        </div>
        <div
          style={{
            background: "oklch(22% 0.04 200)",
            border: "1px solid oklch(82% 0.15 200 / .7)",
            boxShadow: "0 0 14px oklch(82% 0.15 200 / .3)",
            color: "oklch(90% 0.11 200)",
            borderRadius: 6,
            padding: "8px 12px",
            font: "700 11px 'Plus Jakarta Sans'",
            textAlign: "center",
            letterSpacing: ".03em",
            cursor: "pointer",
          }}
        >
          + NEW ISSUE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((n) => (
            <div key={n.key} style={navStyle(n.key)} onClick={() => goPage(n.key)}>
              <span>{n.label}</span>
              {n.key === "triage" && (
                <span style={{ background: "oklch(30% 0.02 260)", borderRadius: 8, padding: "0 6px", fontSize: 10, color: "oklch(85% 0.006 260)" }}>
                  {TRIAGE_ITEMS.length}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", font: "500 9.5px ui-monospace", color: "oklch(55% 0.006 260)" }}>SYS.STATUS: NOMINAL</div>
      </div>

      {/* main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
        {!showDetail && page === "triage" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>TRIAGE</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; new signals, not yet real_</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {TRIAGE_ITEMS.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8 }}>
                  <span style={{ font: "500 12px 'Inter'", color: "#e6ebf2", flex: 1 }}>{t.title}</span>
                  <span style={{ font: "500 10px 'Inter'", color: "oklch(65% 0.006 260)" }}>{t.source}</span>
                  <span style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(79% 0.16 150)", border: "1px solid oklch(79% 0.16 150 / .5)", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>Accept</span>
                  <span style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(70% 0.006 260)", border: "1px solid oklch(40% 0.006 260)", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>Decline</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!showDetail && page === "issues" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>ALL ISSUES</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; grouped by status_</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "14px 20px" }}>
              {ISSUES_GROUPS.map((group) => (
                <div key={group.name} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color }} />
                    <span style={{ font: "700 11px 'Plus Jakarta Sans'", color: "oklch(80% 0.006 260)", letterSpacing: ".06em" }}>
                      {group.name} · {group.items.length}
                    </span>
                  </div>
                  {group.items.map((issue) => (
                    <div
                      key={issue.id}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}
                      onClick={() => openIssue(issue)}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: issue.priorityColor, flexShrink: 0 }} />
                      <span style={{ font: "600 9.5px ui-monospace", color: "oklch(65% 0.006 260)", flexShrink: 0 }}>{issue.id}</span>
                      <span style={{ font: "500 12px 'Inter'", color: "#e6ebf2", flex: 1 }}>{issue.title}</span>
                      <span style={{ font: "600 9px 'Inter'", color: "oklch(75% 0.1 260)", background: "oklch(28% 0.02 260)", borderRadius: 10, padding: "2px 8px" }}>{issue.label}</span>
                      {issue.avatarColor && (
                        <span style={{ width: 20, height: 20, borderRadius: "50%", background: issue.avatarColor, color: "#0c0e12", font: "700 9px 'Inter'", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {issue.assignee}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {!showDetail && page === "board" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>SPRINT BOARD</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; tracking active threads_</div>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 10, padding: 14, overflow: "auto" }}>
              {BOARD_COLUMNS.map((col) => (
                <div key={col.name} style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ font: "700 10.5px 'Plus Jakarta Sans'", color: col.color, letterSpacing: ".06em" }}>
                    {col.name} · {col.items.length}
                  </div>
                  {col.items.map((issue) => (
                    <div key={issue.id} style={{ background: "oklch(23% 0.02 260)", border: "1px solid oklch(36% 0.02 260)", borderRadius: 8, padding: 8, cursor: "pointer" }} onClick={() => openIssue(issue)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ font: "600 9.5px ui-monospace", color: "oklch(65% 0.006 260)" }}>{issue.id}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: issue.priorityColor }} />
                      </div>
                      <div style={{ font: "500 11.5px 'Inter'", color: "#e6ebf2", marginTop: 4 }}>{issue.title}</div>
                      {issue.avatarColor && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                          <span style={{ width: 18, height: 18, borderRadius: "50%", background: issue.avatarColor, color: "#0c0e12", font: "700 8px 'Inter'", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {issue.assignee}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {!showDetail && page === "cycles" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>CYCLE 14</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; the one where we actually ship_</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "oklch(23% 0.02 260)", border: "1px solid oklch(30% 0.02 260)", borderRadius: 10, padding: 16, maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 11px 'Inter'", color: "oklch(75% 0.006 260)" }}>
                  <span>Sep 1 – Sep 14</span>
                  <span>11 / 18 done</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "oklch(30% 0.02 260)", marginTop: 10, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "61%", background: "oklch(82% 0.15 200)", boxShadow: "0 0 8px oklch(82% 0.15 200 / .5)" }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8, opacity: 0.6 }}>
                  <span style={{ font: "500 12px 'Inter'", color: "#e6ebf2" }}>Cycle 13 — shipped, mostly</span>
                  <span style={{ font: "500 10px 'Inter'", color: "oklch(65% 0.006 260)" }}>Aug 18 – Aug 31</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8, opacity: 0.6 }}>
                  <span style={{ font: "500 12px 'Inter'", color: "#e6ebf2" }}>Cycle 12 — the migration one</span>
                  <span style={{ font: "500 10px 'Inter'", color: "oklch(65% 0.006 260)" }}>Aug 4 – Aug 17</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", border: "1px dashed oklch(40% 0.006 260)", borderRadius: 8 }}>
                  <span style={{ font: "500 12px 'Inter'", color: "oklch(75% 0.006 260)" }}>Cycle 15 — up next</span>
                  <span style={{ font: "500 10px 'Inter'", color: "oklch(65% 0.006 260)" }}>Sep 15 – Sep 28</span>
                </div>
              </div>
            </div>
          </>
        )}

        {!showDetail && page === "roadmap" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>ROADMAP</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; promises, hopefully kept_</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", gap: 16 }}>
              {ROADMAP_QUARTERS.map((q) => (
                <div key={q.name} style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ font: "700 11px 'Plus Jakarta Sans'", color: "oklch(75% 0.006 260)", letterSpacing: ".06em" }}>{q.name}</div>
                  {q.items.map((it) => (
                    <div key={it.title} style={{ background: "oklch(23% 0.02 260)", border: "1px solid oklch(30% 0.02 260)", borderLeft: `3px solid ${it.color}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ font: "500 12px 'Inter'", color: "#e6ebf2" }}>{it.title}</div>
                      <div style={{ font: "600 9px 'Plus Jakarta Sans'", color: it.color, marginTop: 5, letterSpacing: ".04em" }}>{it.status}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {!showDetail && page === "docs" && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)" }}>
              <div style={{ font: "800 19px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>DOCS</div>
              <div style={{ font: "500 11.5px ui-monospace", color: "oklch(82% 0.15 200)", marginTop: 3 }}>&gt; the truth, occasionally up to date_</div>
            </div>
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid oklch(30% 0.02 260)", padding: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                {DOCS_TREE.map((d) => (
                  <div key={d.title} style={{ padding: `6px 10px 6px ${d.paddingLeft}`, borderRadius: 6, fontSize: 12, fontFamily: "'Inter'", fontWeight: d.weight, color: d.color, background: d.bg, cursor: "pointer" }}>
                    {d.title}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
                <div style={{ font: "800 16px 'Plus Jakarta Sans'", color: "#f2fbfc", marginBottom: 10 }}>Architecture</div>
                <div style={{ font: "400 13px/1.6 'Inter'", color: "oklch(80% 0.006 260)", maxWidth: 560 }}>
                  NovaStructur runs on a tRPC API over Prisma, with a git-bridge worker that mirrors issue state into branch names and PR checks. The MCP server exposes the same actions to AI agents, so triage can happen from a terminal as easily as a browser.
                </div>
              </div>
            </div>
          </>
        )}

        {showDetail && (
          <>
            <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid oklch(34% 0.02 260)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ cursor: "pointer", color: "oklch(75% 0.006 260)", font: "600 15px 'Inter'" }} onClick={() => setActiveIssue(null)}>←</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 600 }}>
                <div style={{ font: "800 18px 'Plus Jakarta Sans'", color: "#f2fbfc" }}>{activeIssue.id} — {activeIssue.title}</div>
                <div style={{ font: "500 11.5px ui-monospace", color: activeIssue.statusColor }}>{activeIssue.status}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", gap: 24 }}>
              <div style={{ flex: 1, maxWidth: 560, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ font: "400 13px/1.6 'Inter'", color: "oklch(80% 0.006 260)" }}>
                  Reported after three separate people hit the same wall in one afternoon. Worth a look before it becomes the thing everyone quietly works around.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ font: "700 11px 'Plus Jakarta Sans'", color: "oklch(75% 0.006 260)", letterSpacing: ".06em" }}>COMMENTS</div>
                  <div style={{ background: "oklch(23% 0.02 260)", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8, padding: 10 }}>
                    <div style={{ font: "600 11px 'Inter'", color: "#e6ebf2" }}>Jamie S.</div>
                    <div style={{ font: "400 12px/1.5 'Inter'", color: "oklch(75% 0.006 260)", marginTop: 4 }}>Pretty sure this is the runner pool, not the tests. Bumping concurrency now.</div>
                  </div>
                  <div style={{ background: "oklch(23% 0.02 260)", border: "1px solid oklch(30% 0.02 260)", borderRadius: 8, padding: 10 }}>
                    <div style={{ font: "600 11px 'Inter'", color: "#e6ebf2" }}>Tunde K.</div>
                    <div style={{ font: "400 12px/1.5 'Inter'", color: "oklch(75% 0.006 260)", marginTop: 4 }}>Confirmed. Also renamed the job so the Slack alert stops sounding like a fire.</div>
                  </div>
                </div>
              </div>
              <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(65% 0.006 260)", letterSpacing: ".06em", marginBottom: 5 }}>PRIORITY</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeIssue.priorityColor }} />
                    <span style={{ font: "500 12px 'Inter'", color: "#e6ebf2" }}>{activeIssue.priority}</span>
                  </div>
                </div>
                {activeIssue.assignee && (
                  <div>
                    <div style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(65% 0.006 260)", letterSpacing: ".06em", marginBottom: 5 }}>ASSIGNEE</div>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: activeIssue.avatarColor, color: "#0c0e12", font: "700 8px 'Inter'", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {activeIssue.assignee}
                    </span>
                  </div>
                )}
                <div>
                  <div style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(65% 0.006 260)", letterSpacing: ".06em", marginBottom: 5 }}>LABEL</div>
                  <span style={{ font: "600 9px 'Inter'", color: "oklch(75% 0.1 260)", background: "oklch(28% 0.02 260)", borderRadius: 10, padding: "2px 8px" }}>{activeIssue.label}</span>
                </div>
                <div>
                  <div style={{ font: "700 10px 'Plus Jakarta Sans'", color: "oklch(65% 0.006 260)", letterSpacing: ".06em", marginBottom: 5 }}>GITHUB</div>
                  <div style={{ font: "500 11px ui-monospace", color: "oklch(82% 0.15 200)" }}>PR pending</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {paletteOpen && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120 }}
          onClick={() => setPaletteOpen(false)}
        >
          <div
            style={{ width: 520, background: "oklch(17% 0.014 260)", border: "1px solid oklch(36% 0.02 260)", borderRadius: 12, boxShadow: "0 0 40px rgba(0,0,0,.5)", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid oklch(30% 0.02 260)" }}>
              <span style={{ font: "500 13px 'Inter'", color: "oklch(60% 0.006 260)" }}>Type a command or search…</span>
            </div>
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ padding: "9px 12px", borderRadius: 6, font: "500 12px 'Inter'", color: "#e6ebf2", display: "flex", gap: 8 }}>
                <span style={{ color: "oklch(82% 0.15 200)" }}>&gt;</span> Create new issue
              </div>
              <div style={{ padding: "9px 12px", borderRadius: 6, font: "500 12px 'Inter'", color: "#e6ebf2", display: "flex", gap: 8 }}>
                <span style={{ color: "oklch(82% 0.15 200)" }}>&gt;</span> Go to Board
              </div>
              <div style={{ padding: "9px 12px", borderRadius: 6, font: "500 12px 'Inter'", color: "#e6ebf2", display: "flex", gap: 8 }}>
                <span style={{ color: "oklch(82% 0.15 200)" }}>&gt;</span> Go to Roadmap
              </div>
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid oklch(30% 0.02 260)", font: "500 10px 'Inter'", color: "oklch(55% 0.006 260)" }}>
              ↑↓ navigate · ↵ select · esc close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
