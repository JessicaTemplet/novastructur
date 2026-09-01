import type { ReactNode } from "react";

const SAFE_URL = /^(https?:\/\/|\/)/;
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, url] = link;
      return SAFE_URL.test(url!) ? (
        <a key={i} href={url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
          {label}
        </a>
      ) : (
        label
      );
    }
    return part;
  });
}

/** A tiny, dependency-free markdown renderer for doc pages — headings, bold/italic/code,
 * links, lists, and fenced code blocks. Intentionally not a full CommonMark implementation. */
export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const Tag = (`h${level}` as const) as "h1" | "h2" | "h3";
      const sizes = { h1: "text-xl font-semibold", h2: "text-lg font-semibold", h3: "text-base font-semibold" };
      blocks.push(
        <Tag key={key++} className={`${sizes[Tag]} mt-4 mb-1 text-neutral-900 first:mt-0`}>
          {renderInline(heading[2]!)}
        </Tag>
      );
      i++;
      continue;
    }

    if (/^(-|\*)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(-|\*)\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^(-|\*)\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,3})\s+/.test(lines[i]!) && !lines[i]!.startsWith("```")) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1.5 text-sm leading-relaxed text-neutral-700">
        {renderInline(paraLines.join(" "))}
      </p>
    );
  }

  return <>{blocks}</>;
}
