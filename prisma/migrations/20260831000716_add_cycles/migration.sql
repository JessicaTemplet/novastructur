-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" TEXT NOT NULL,
    CONSTRAINT "Cycle_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Issue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TASK',
    "priority" TEXT NOT NULL DEFAULT 'NO_PRIORITY',
    "estimate" REAL,
    "dueDate" DATETIME,
    "sortOrder" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "canceledAt" DATETIME,
    "teamId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "creatorId" TEXT NOT NULL,
    "parentId" TEXT,
    "cycleId" TEXT,
    CONSTRAINT "Issue_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Issue_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "WorkflowState" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Issue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Issue_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Issue_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Issue" ("assigneeId", "canceledAt", "completedAt", "createdAt", "creatorId", "description", "dueDate", "estimate", "id", "identifier", "number", "parentId", "priority", "sortOrder", "stateId", "teamId", "title", "type", "updatedAt") SELECT "assigneeId", "canceledAt", "completedAt", "createdAt", "creatorId", "description", "dueDate", "estimate", "id", "identifier", "number", "parentId", "priority", "sortOrder", "stateId", "teamId", "title", "type", "updatedAt" FROM "Issue";
DROP TABLE "Issue";
ALTER TABLE "new_Issue" RENAME TO "Issue";
CREATE INDEX "Issue_teamId_stateId_idx" ON "Issue"("teamId", "stateId");
CREATE INDEX "Issue_assigneeId_idx" ON "Issue"("assigneeId");
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");
CREATE INDEX "Issue_identifier_idx" ON "Issue"("identifier");
CREATE INDEX "Issue_cycleId_idx" ON "Issue"("cycleId");
CREATE UNIQUE INDEX "Issue_teamId_number_key" ON "Issue"("teamId", "number");
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "issueCounter" INTEGER NOT NULL DEFAULT 0,
    "cycleCounter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("createdAt", "id", "issueCounter", "key", "name", "organizationId") SELECT "createdAt", "id", "issueCounter", "key", "name", "organizationId" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_organizationId_key_key" ON "Team"("organizationId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_teamId_number_key" ON "Cycle"("teamId", "number");
