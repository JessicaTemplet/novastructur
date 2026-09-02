// Installs the git-bridge hooks (see src/git-bridge/) into .git/hooks/.
// Run once per clone: `npx tsx scripts/install-git-hooks.ts`
//
// Writes small shell shims, not the TypeScript directly — git invokes hook
// files straight from .git/hooks (no way to point it at `npx tsx` for the
// whole repo), so each shim's only job is to hand off to tsx against the
// real script, which stays in src/git-bridge/ under normal version control
// and normal review, unlike the hook file itself.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const MARKER = "# installed by novastructur git-bridge";

const HOOKS: Record<string, string> = {
  "post-checkout": "src/git-bridge/post-checkout.ts",
  "pre-push": "src/git-bridge/pre-push.ts",
};

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function shimContent(scriptPath: string): string {
  // "$@" forwards git's own hook arguments (e.g. post-checkout's three
  // shas/flag) straight through to the tsx script unchanged.
  return [
    "#!/bin/sh",
    MARKER,
    "# Safe to delete. Reinstall with: npx tsx scripts/install-git-hooks.ts",
    `exec npx tsx "$(git rev-parse --show-toplevel)/${scriptPath}" "$@"`,
    "",
  ].join("\n");
}

function main() {
  const root = repoRoot();
  const hooksDir = join(root, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const force = process.argv.includes("--force");
  let skipped = 0;
  let installed = 0;

  for (const [hookName, scriptPath] of Object.entries(HOOKS)) {
    const hookPath = join(hooksDir, hookName);

    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf8");
      const isOurs = existing.includes(MARKER);
      if (!isOurs && !force) {
        console.log(`Skipped ${hookName}: a hook already exists there and it wasn't installed by this script.`);
        console.log(`  Back it up and rerun, or rerun with --force to overwrite it: ${hookPath}`);
        skipped++;
        continue;
      }
    }

    writeFileSync(hookPath, shimContent(scriptPath), "utf8");
    try {
      chmodSync(hookPath, 0o755); // no-op on Windows filesystems, needed on macOS/Linux clones
    } catch {
      // ignore — Windows doesn't track a POSIX exec bit; Git for Windows
      // runs hooks via the shebang regardless.
    }
    console.log(`Installed ${hookName} -> ${scriptPath}`);
    installed++;
  }

  console.log(`\n${installed} hook(s) installed, ${skipped} skipped.`);
  if (installed > 0) {
    console.log('Make sure NOVASTRUCTUR_USER_EMAIL is set in .env — see src/git-bridge/README.md.');
  }
}

main();
