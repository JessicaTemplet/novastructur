import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const teams = session
    ? await db.team.findMany({
        where: { organizationId: session.user.organizationId },
        select: { id: true, name: true, key: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <AppShell user={session?.user ?? null} teams={teams}>
      {children}
    </AppShell>
  );
}
