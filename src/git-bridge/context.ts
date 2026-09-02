// Shared setup for every git-bridge hook script. Standalone tsx entry
// points (same pattern as src/mcp/server.ts) don't get Next's automatic
// .env loading, so this is the one place that pulls it in — every hook
// script imports from here rather than repeating the dotenv/actor-lookup
// boilerplate.
import "dotenv/config";
import { db } from "../server/db";
import { appRouter } from "../server/api/root";

export type Caller = ReturnType<typeof appRouter.createCaller>;

export async function createBridgeCaller() {
  const actorEmail = process.env.NOVASTRUCTUR_USER_EMAIL;
  if (!actorEmail) {
    throw new Error(
      'NOVASTRUCTUR_USER_EMAIL is not set. Add it to .env, e.g.\n  NOVASTRUCTUR_USER_EMAIL="you@example.com"'
    );
  }

  const actor = await db.user.findUnique({ where: { email: actorEmail } });
  if (!actor) {
    throw new Error(`No NovaStructur user found for "${actorEmail}".`);
  }

  const caller = appRouter.createCaller({
    db,
    session: {
      user: {
        id: actor.id,
        organizationId: actor.organizationId,
        avatarColor: actor.avatarColor,
        name: actor.name,
        email: actor.email,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  return { db, caller, actor };
}
