import { spawn } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const CORPUS_ROOT = path.join(process.cwd(), ".binsg", "corpus");
const INDEX_ROOT = path.join(process.cwd(), ".binsg", "index");
const TOP_K = 5;

function run(bin: string, args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

/** Mirrors this org's docs + issues into flat text files binsg can index.
 * Rewriting unchanged content is cheap — binsg hashes content, not mtime,
 * so an identical rewrite is a no-op re-embed on the next `index` call. */
async function syncCorpus(db: PrismaClient, organizationId: string, dir: string) {
  await mkdir(dir, { recursive: true });
  const [docs, issues] = await Promise.all([
    db.doc.findMany({ where: { organizationId }, select: { id: true, title: true, content: true } }),
    db.issue.findMany({
      where: { team: { organizationId } },
      select: { identifier: true, title: true, description: true },
    }),
  ]);

  // Skip content-free docs (a fresh "Untitled" page) — indexing them adds no
  // real signal, just a title-only file that can randomly outrank genuine matches.
  const keep = new Set<string>();
  await Promise.all([
    ...docs
      .filter((d) => d.content.trim().length > 0)
      .map((d) => {
        const file = `doc-${d.id}.txt`;
        keep.add(file);
        return writeFile(path.join(dir, file), `${d.title}\n\n${d.content}`);
      }),
    ...issues.map((i) => {
      const file = `issue-${i.identifier}.txt`;
      keep.add(file);
      return writeFile(path.join(dir, file), `${i.identifier}: ${i.title}\n\n${i.description ?? ""}`);
    }),
  ]);

  // Drop files for deleted docs/issues so search can't surface ghosts.
  const existing = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    existing.filter((f) => !keep.has(f)).map((f) => rm(path.join(dir, f)).catch(() => undefined))
  );
}

export type SemanticMatch = {
  kind: "doc" | "issue";
  /** Doc id or issue identifier, parsed back out of the corpus filename. */
  ref: string;
  score: number;
  snippet: string;
};

/** Local semantic search (binsg — see ../../../binsg) over this org's docs +
 * issues. Returns [] (never throws) whenever binsg isn't configured or fails,
 * so callers always have a safe fallback. */
export async function semanticSearch(
  db: PrismaClient,
  organizationId: string,
  query: string,
  topK = TOP_K
): Promise<SemanticMatch[]> {
  const bin = process.env.BINSG_BIN;
  const modelDir = process.env.BINSG_MODEL_DIR;
  if (!bin || !modelDir) return [];

  try {
    const corpusDir = path.join(CORPUS_ROOT, organizationId);
    const bsgFile = path.join(INDEX_ROOT, `${organizationId}.bsg`);
    await mkdir(INDEX_ROOT, { recursive: true });
    await syncCorpus(db, organizationId, corpusDir);

    const indexed = await run(bin, ["index", corpusDir, "--output", bsgFile, "--model-dir", modelDir]);
    if (indexed.code !== 0) return [];

    // `query` is an issue title chosen by the caller and could start with
    // "-" (e.g. a title like "--help"); `--` stops binsg's own arg parser
    // from treating it as a flag instead of the positional query.
    const searched = await run(bin, [
      "search",
      "--model-dir",
      modelDir,
      "--top-k",
      String(topK),
      "--",
      query,
      bsgFile,
    ]);
    if (searched.code !== 0) return [];

    const seenFiles = new Set<string>();
    const matches: SemanticMatch[] = [];
    for (const line of searched.stdout.trim().split("\n")) {
      // Format is "similarity\tpath:line:\ttext" (see binsg-cli's run_search) —
      // split on tabs first, then strip ":<line>:" off the *end* of the middle
      // field, since the path itself may contain colons (Windows drive letters).
      const [scoreStr, pathAndLine, ...rest] = line.split("\t");
      if (!pathAndLine || rest.length === 0) continue;
      const pathMatch = /^(.*):\d+:$/.exec(pathAndLine);
      const text = rest.join("\t").trim();
      if (!pathMatch || !text) continue;
      const base = path.basename(pathMatch[1]!);
      if (seenFiles.has(base)) continue;
      seenFiles.add(base);

      const docMatch = /^doc-(.+)\.txt$/.exec(base);
      const issueMatch = /^issue-(.+)\.txt$/.exec(base);
      if (docMatch) {
        matches.push({ kind: "doc", ref: docMatch[1]!, score: Number(scoreStr) || 0, snippet: text });
      } else if (issueMatch) {
        matches.push({ kind: "issue", ref: issueMatch[1]!, score: Number(scoreStr) || 0, snippet: text });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

/** Optional grounding for AI-assist prompts: a few related docs/issues already
 * in this project, formatted as a text block to prepend to an LLM prompt. */
export async function groundedContext(
  db: PrismaClient,
  organizationId: string,
  query: string
): Promise<string> {
  const matches = await semanticSearch(db, organizationId, query);
  if (matches.length === 0) return "";
  return `Related context already in this project (may or may not be relevant):\n${matches
    .map((m) => `- ${m.snippet}`)
    .join("\n")}`;
}
