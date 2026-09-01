-- CreateTable
CREATE TABLE "Doc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sortOrder" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "Doc_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Doc_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Doc_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Doc" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocIssueLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "docId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    CONSTRAINT "DocIssueLink_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocIssueLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Doc_organizationId_idx" ON "Doc"("organizationId");

-- CreateIndex
CREATE INDEX "Doc_parentId_idx" ON "Doc"("parentId");

-- CreateIndex
CREATE INDEX "DocIssueLink_issueId_idx" ON "DocIssueLink"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "DocIssueLink_docId_issueId_key" ON "DocIssueLink"("docId", "issueId");
