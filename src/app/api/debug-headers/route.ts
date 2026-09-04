import { NextResponse } from "next/server";
import { headers } from "next/headers";

// TEMPORARY — diagnosing why Auth.js redirects resolve to localhost:10000
// on Render despite trustHost: true. Delete once resolved. Deliberately
// outside the middleware matcher (/api is excluded) so it's reachable
// with no auth.
export async function GET() {
  const h = await headers();
  const relevant = [
    "host",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
    "x-forwarded-for",
    "origin",
    "referer",
  ];
  const out: Record<string, string | null> = {};
  for (const k of relevant) out[k] = h.get(k);
  return NextResponse.json({ headers: out, allHeaders: Object.fromEntries(h.entries()) });
}
