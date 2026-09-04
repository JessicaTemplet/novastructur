import type { NextAuthConfig } from "next-auth";

// Split out from auth.ts so middleware (which runs in the Edge Runtime by
// default) can build a session-checking `auth()` from this alone, without
// pulling in the Credentials provider's authorize() — which needs Prisma
// (@prisma/adapter-pg + pg, raw TCP) and bcryptjs, neither of which work
// in Edge. The full config in auth.ts spreads this and adds the provider
// for actual sign-in, used everywhere else (Node.js runtime).
export const authConfig = {
  // Render (and most non-Vercel hosts) proxy requests such that Auth.js
  // can't otherwise trust the incoming Host header to build redirect/
  // callback URLs, so it falls back to what the container sees internally
  // instead of the public hostname. Without this, signIn/signOut redirects
  // resolve to e.g. localhost:10000 instead of the real domain.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.userId = user.id;
        token.organizationId = (user as { organizationId: string }).organizationId;
        token.avatarColor = (user as { avatarColor: string }).avatarColor;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.organizationId = token.organizationId as string;
        session.user.avatarColor = token.avatarColor as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
