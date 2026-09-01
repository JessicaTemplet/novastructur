import type { PrismaClient } from "@prisma/client";

// Transient holder for pending GitHub OAuth device-flow codes, persisted via
// the PendingDeviceAuth table rather than an in-memory Map. GitHub's
// device-token endpoint doesn't support browser CORS, so the tRPC server
// polls on the client's behalf; the browser only ever sees the user-facing
// code + verification URL, never the device_code itself.
// A module-scope Map only works for a single long-lived process — under
// more than one server instance (serverless, multiple replicas) a poll
// landing on a different instance than the one that started the flow would
// always see "expired". Persisting this keeps polling correct regardless of
// which instance handles a given request. Entries are short-lived (GitHub's
// own expiry, typically 15 minutes), so this table only ever holds a
// handful of rows.

interface PendingDeviceAuth {
  deviceCode: string;
  interval: number;
  expiresAt: number;
}

export async function setPendingDeviceAuth(
  db: PrismaClient,
  userId: string,
  entry: PendingDeviceAuth
): Promise<void> {
  await db.pendingDeviceAuth.upsert({
    where: { userId },
    create: { userId, deviceCode: entry.deviceCode, interval: entry.interval, expiresAt: new Date(entry.expiresAt) },
    update: { deviceCode: entry.deviceCode, interval: entry.interval, expiresAt: new Date(entry.expiresAt) },
  });
}

export async function getPendingDeviceAuth(
  db: PrismaClient,
  userId: string
): Promise<PendingDeviceAuth | undefined> {
  const entry = await db.pendingDeviceAuth.findUnique({ where: { userId } });
  if (!entry) return undefined;
  if (entry.expiresAt.getTime() < Date.now()) {
    await db.pendingDeviceAuth.deleteMany({ where: { userId } });
    return undefined;
  }
  return { deviceCode: entry.deviceCode, interval: entry.interval, expiresAt: entry.expiresAt.getTime() };
}

export async function clearPendingDeviceAuth(db: PrismaClient, userId: string): Promise<void> {
  await db.pendingDeviceAuth.deleteMany({ where: { userId } });
}
