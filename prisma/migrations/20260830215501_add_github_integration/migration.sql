-- CreateTable
CREATE TABLE "GitHubConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubLogin" TEXT NOT NULL,
    "githubUserId" INTEGER NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssueGitHubLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prUrl" TEXT NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prState" TEXT NOT NULL DEFAULT 'OPEN',
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "headBranch" TEXT,
    "authorLogin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueId" TEXT NOT NULL,
    CONSTRAINT "IssueGitHubLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_userId_key" ON "GitHubConnection"("userId");

-- CreateIndex
CREATE INDEX "IssueGitHubLink_issueId_idx" ON "IssueGitHubLink"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueGitHubLink_issueId_repoOwner_repoName_prNumber_key" ON "IssueGitHubLink"("issueId", "repoOwner", "repoName", "prNumber");
