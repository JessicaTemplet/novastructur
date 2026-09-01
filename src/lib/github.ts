export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = url
    .trim()
    .match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (!match) return null;
  const [, owner, repo, number] = match;
  return { owner, repo, number: Number(number) };
}

export function suggestBranchName(login: string, identifier: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  const suffix = slug ? `-${slug}` : "";
  return `${login}/${identifier.toLowerCase()}${suffix}`;
}
