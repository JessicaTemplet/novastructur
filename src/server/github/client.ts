const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_BASE = "https://api.github.com";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_CHARS = 300;

function withTimeout(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

function clientId(): string {
  const id = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!id) throw new Error("GITHUB_OAUTH_CLIENT_ID is not set.");
  return id;
}

export type GitHubApiErrorKind = "not_found" | "unauthorized" | "rate_limited" | "unknown";

export class GitHubApiError extends Error {
  constructor(
    public readonly kind: GitHubApiErrorKind,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

// Classifies a failed GitHub REST response into a small set of cases the UI
// can give the user useful guidance for, instead of surfacing raw response
// bodies. `context` should read naturally as "<context> failed/not found".
async function toGitHubApiError(res: Response, context: string): Promise<GitHubApiError> {
  if (res.status === 404) {
    return new GitHubApiError(
      "not_found",
      404,
      `${context}: not found. Check the URL and that your connected GitHub account can access this repo.`
    );
  }
  if (res.status === 401) {
    return new GitHubApiError(
      "unauthorized",
      401,
      "GitHub rejected your token. Reconnect GitHub in Settings → GitHub."
    );
  }
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    const resetHeader = res.headers.get("x-ratelimit-reset");
    const resetMinutes = resetHeader
      ? Math.max(1, Math.ceil((Number(resetHeader) * 1000 - Date.now()) / 60_000))
      : null;
    return new GitHubApiError(
      "rate_limited",
      403,
      `GitHub API rate limit reached — try again in about ${resetMinutes ?? "a few"} minute(s).`
    );
  }
  if (res.status === 403) {
    return new GitHubApiError(
      "unauthorized",
      403,
      "Your GitHub token doesn't have access to this repo. Reconnect GitHub in Settings → GitHub."
    );
  }
  const text = (await res.text().catch(() => "")).slice(0, MAX_ERROR_BODY_CHARS);
  return new GitHubApiError("unknown", res.status, `${context} failed (${res.status})${text ? `: ${text}` : "."}`);
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export async function requestDeviceCode(scope: string): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId(), scope }),
    ...withTimeout(),
  });
  if (!res.ok) throw await toGitHubApiError(res, "GitHub device code request");
  const json = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    expiresIn: json.expires_in,
    interval: json.interval,
  };
}

export type DeviceTokenResult =
  | { status: "ok"; accessToken: string; scope: string }
  | { status: "pending" }
  | { status: "slow_down"; interval: number }
  | { status: "expired" }
  | { status: "denied" };

export async function pollDeviceToken(deviceCode: string): Promise<DeviceTokenResult> {
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId(),
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
    ...withTimeout(),
  });
  const json = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    interval?: number;
  };

  if (json.access_token) {
    return { status: "ok", accessToken: json.access_token, scope: json.scope ?? "" };
  }
  switch (json.error) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      return { status: "slow_down", interval: json.interval ?? 5 };
    case "expired_token":
      return { status: "expired" };
    case "access_denied":
      return { status: "denied" };
    default:
      throw new Error(`GitHub device token poll failed: ${json.error ?? res.status}`);
  }
}

export interface GitHubUser {
  login: string;
  id: number;
}

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API_BASE}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    ...withTimeout(),
  });
  if (!res.ok) throw await toGitHubApiError(res, "GitHub user lookup");
  const json = (await res.json()) as { login: string; id: number };
  return { login: json.login, id: json.id };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  headBranch: string;
  authorLogin: string;
}

export async function fetchPullRequest(
  token: string,
  owner: string,
  repo: string,
  number: number
): Promise<GitHubPullRequest> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${number}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    ...withTimeout(),
  });
  if (!res.ok) throw await toGitHubApiError(res, `Pull request ${owner}/${repo}#${number}`);
  const json = (await res.json()) as {
    number: number;
    title: string;
    html_url: string;
    state: "open" | "closed";
    merged_at: string | null;
    draft: boolean;
    head: { ref: string };
    user: { login: string } | null;
  };
  const state: GitHubPullRequest["state"] = json.merged_at ? "MERGED" : json.state === "open" ? "OPEN" : "CLOSED";
  return {
    number: json.number,
    title: json.title,
    url: json.html_url,
    state,
    isDraft: json.draft,
    headBranch: json.head.ref,
    authorLogin: json.user?.login ?? "",
  };
}
