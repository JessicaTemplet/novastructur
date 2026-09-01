import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      avatarColor: string;
    } & DefaultSession["user"];
  }
}
