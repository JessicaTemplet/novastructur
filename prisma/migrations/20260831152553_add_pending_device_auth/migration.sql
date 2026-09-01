-- CreateTable
CREATE TABLE "PendingDeviceAuth" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "deviceCode" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "PendingDeviceAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
