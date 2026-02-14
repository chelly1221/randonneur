import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { prisma } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.sub = profile.sub ?? undefined;
        // Extract realm roles from Keycloak token
        const realmAccess = (profile as Record<string, unknown>)
          .realm_access as { roles?: string[] } | undefined;
        token.roles = realmAccess?.roles ?? ["user"];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.roles = (token.roles as string[]) ?? ["user"];
      }
      return session;
    },
    async signIn({ user, profile }) {
      if (!profile?.sub) return true;
      // Upsert user in local database on first login
      try {
        await prisma.user.upsert({
          where: { keycloakId: profile.sub },
          update: {
            displayName: user.name ?? profile.preferred_username as string ?? "User",
            email: user.email ?? "",
          },
          create: {
            keycloakId: profile.sub,
            displayName: user.name ?? profile.preferred_username as string ?? "User",
            email: user.email ?? "",
            role: "user",
          },
        });
      } catch (e) {
        console.error("Failed to upsert user:", e);
      }
      return true;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
});
