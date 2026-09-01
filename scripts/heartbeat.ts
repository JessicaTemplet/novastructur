#!/usr/bin/env tsx
/**
 * heartbeat.ts - project DNA report for this repo.
 *
 * Reads this project's own manifest, lockfile, prisma schema, and env
 * template, then prints what stack it runs on, which dependency versions
 * are hard-pinned vs range-pinned, and which third-party providers it
 * talks to. Cloud-service tier/plan is account info, not something the
 * code can know, so that piece is read from heartbeat.meta.json (edit
 * that file by hand, this script never guesses at it).
 *
 * Run:
 *   npm run heartbeat            pretty console report
 *   npm run heartbeat -- --json  machine-readable JSON (for CI, other tools)
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();

function readJson<T>(relPath: string): T | null {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, "utf-8")) as T;
}

function readText(relPath: string): string | null {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf-8");
}

// --- package.json ---------------------------------------------------------

type PkgJson = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function isExactPin(range: string): boolean {
  // "16.3.3" is an exact pin. "^16.3.3", "~16.3.3", ">=16" are ranges.
  return /^\d/.test(range) && !/^[\^~>=<]/.test(range);
}

type DependencyRow = {
  name: string;
  declared: string;
  pinned: boolean;
  installed: string;
  dev: boolean;
};

function loadDependencyReport(pkg: PkgJson): DependencyRow[] {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const lock = readJson<{ packages?: Record<string, { version?: string }> }>(
    "package-lock.json"
  );
  const resolved = lock?.packages ?? {};

  const rows: DependencyRow[] = Object.entries(deps).map(([name, range]) => {
    const lockEntry = resolved[`node_modules/${name}`];
    return {
      name,
      declared: range,
      pinned: isExactPin(range),
      installed: lockEntry?.version ?? "(run npm install)",
      dev: !!pkg.devDependencies?.[name],
    };
  });

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// --- language / file mix ---------------------------------------------------

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript (JSX)",
  ".js": "JavaScript",
  ".jsx": "JavaScript (JSX)",
  ".mjs": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".sql": "SQL",
  ".prisma": "Prisma schema",
  ".css": "CSS",
  ".sh": "Shell",
  ".ps1": "PowerShell",
};

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function detectLanguages(): { language: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const f of walkFiles(ROOT)) {
    const lang = EXT_LANGUAGE[extname(f)];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files);
}

// --- stack detection --------------------------------------------------------

function detectFramework(pkg: PkgJson) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return {
    framework: deps["next"] ? `Next.js ${deps["next"]}` : null,
    ui: deps["react"] ? `React ${deps["react"]}` : null,
    styling: deps["tailwindcss"] ? `Tailwind CSS ${deps["tailwindcss"]}` : null,
  };
}

function detectDataLayer() {
  const schema = readText("prisma/schema.prisma") ?? "";
  const providerMatch = schema.match(
    /datasource\s+\w+\s*{[^}]*provider\s*=\s*"(\w+)"/
  );
  return {
    orm: "Prisma",
    provider: providerMatch?.[1] ?? "unknown",
    driverAdapter: "@prisma/adapter-libsql",
    swapNote: schema.toLowerCase().includes("swap")
      ? "schema comments note a documented path to swap to Postgres later"
      : null,
  };
}

function detectAuth(pkg: PkgJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return deps["next-auth"] ? `Auth.js (next-auth) ${deps["next-auth"]}` : null;
}

function detectApiLayer(pkg: PkgJson): string | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return deps["@trpc/server"] ? `tRPC ${deps["@trpc/server"]}` : null;
}

// --- git (best-effort, no shell-out required) -------------------------------

function detectGit() {
  const head = readText(".git/HEAD") ?? "";
  const branchMatch = head.match(/ref: refs\/heads\/(.+)/);
  const configText = readText(".git/config") ?? "";
  const remoteMatch = configText.match(/\[remote "origin"\][\s\S]*?url = (.+)/);
  return {
    branch: branchMatch?.[1]?.trim() ?? "(detached HEAD)",
    remote: remoteMatch?.[1]?.trim() ?? "(no origin configured)",
  };
}

// --- third-party providers --------------------------------------------------

type Provider = {
  name: string;
  purpose: string;
  authMethod: string;
  costModel: "bring-your-own-key" | "free-api" | "local-no-network";
};

function detectProviders(): Provider[] {
  const envExample = readText(".env.example") ?? "";
  const providers: Provider[] = [];

  if (envExample.includes("GITHUB_OAUTH_CLIENT_ID")) {
    providers.push({
      name: "GitHub",
      purpose: "OAuth device-flow login, linking PRs to issues",
      authMethod: "OAuth device flow, no client secret stored",
      costModel: "free-api",
    });
  }
  if (envExample.includes("AI_KEY_ENCRYPTION_SECRET")) {
    providers.push({
      name: "OpenAI / Anthropic / OpenAI-compatible",
      purpose: "AI draft description, per-user bring-your-own key",
      authMethod: "user-supplied API key, encrypted at rest",
      costModel: "bring-your-own-key",
    });
  }
  if (envExample.includes("BINSG_BIN")) {
    providers.push({
      name: "binsg (local, own project)",
      purpose: "grounds AI drafts in this project's own docs/issues via local semantic search",
      authMethod: "local binary, no network call",
      costModel: "local-no-network",
    });
  }
  return providers;
}

// --- meta (hand-maintained, tier/plan/deployment) ---------------------------

type HeartbeatMeta = {
  providers?: Record<string, { tier?: string; notes?: string }>;
  deployment?: { target?: string; notes?: string };
};

function loadMeta(): HeartbeatMeta {
  return readJson<HeartbeatMeta>("heartbeat.meta.json") ?? {};
}

// --- report assembly ---------------------------------------------------------

function buildReport() {
  const pkg = readJson<PkgJson>("package.json");
  if (!pkg) throw new Error("package.json not found. Run this from the project root.");

  const meta = loadMeta();
  const { framework, ui, styling } = detectFramework(pkg);
  const dataLayer = detectDataLayer();
  const providers = detectProviders().map((p) => ({
    ...p,
    tier: meta.providers?.[p.name]?.tier ?? "(not set in heartbeat.meta.json)",
  }));
  const deps = loadDependencyReport(pkg);

  return {
    project: { name: pkg.name, version: pkg.version },
    git: detectGit(),
    languages: detectLanguages(),
    framework,
    ui,
    styling,
    auth: detectAuth(pkg),
    apiLayer: detectApiLayer(pkg),
    dataLayer,
    deployment: meta.deployment ?? { target: "(not set in heartbeat.meta.json)" },
    providers,
    dependencies: {
      total: deps.length,
      pinned: deps.filter((d) => d.pinned).length,
      rows: deps,
    },
  };
}

type Report = ReturnType<typeof buildReport>;

// --- console output ------------------------------------------------------------

function printConsole(r: Report) {
  const line = (s = "") => console.log(s);

  line(`\n${r.project.name} v${r.project.version}, project heartbeat`);
  line("=".repeat(60));
  line(`Git:          ${r.git.branch} -> ${r.git.remote}`);
  line(`Framework:    ${r.framework ?? "(none detected)"}`);
  line(`UI:           ${r.ui ?? "(none detected)"}`);
  line(`Styling:      ${r.styling ?? "(none detected)"}`);
  line(`Auth:         ${r.auth ?? "(none detected)"}`);
  line(`API layer:    ${r.apiLayer ?? "(none detected)"}`);
  line(
    `Data layer:   ${r.dataLayer.orm} -> ${r.dataLayer.provider} (via ${r.dataLayer.driverAdapter})`
  );
  if (r.dataLayer.swapNote) line(`              ${r.dataLayer.swapNote}`);
  line(
    `Deployment:   ${r.deployment.target}${r.deployment.notes ? ", " + r.deployment.notes : ""}`
  );

  line(`\nLanguages (by file count)`);
  line("-".repeat(60));
  for (const l of r.languages) line(`  ${l.language.padEnd(20)} ${l.files}`);

  line(`\nThird-party providers`);
  line("-".repeat(60));
  for (const p of r.providers) {
    line(`${p.name}`);
    line(`  purpose: ${p.purpose}`);
    line(`  auth:    ${p.authMethod}`);
    line(`  cost:    ${p.costModel}`);
    line(`  tier:    ${p.tier}`);
  }

  line(
    `\nDependencies (${r.dependencies.total} total, ${r.dependencies.pinned} exact-pinned)`
  );
  line("-".repeat(60));
  for (const d of r.dependencies.rows) {
    const flag = d.pinned ? "PINNED" : "range ";
    line(
      `${flag}  ${d.name.padEnd(30)} declared ${d.declared.padEnd(14)} installed ${d.installed}${d.dev ? "  (dev)" : ""}`
    );
  }
  line();
}

// --- entry point ---------------------------------------------------------------

const args = process.argv.slice(2);
const report = buildReport();

if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printConsole(report);
}
