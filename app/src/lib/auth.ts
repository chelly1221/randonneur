import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { prisma } from "./db";

const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

function resolveDisplayName(
  user: { name?: string | null; email?: string | null },
  profile: Record<string, unknown>
) {
  const given = typeof profile.given_name === "string" ? profile.given_name.trim() : "";
  const family = typeof profile.family_name === "string" ? profile.family_name.trim() : "";
  const preferred =
    typeof profile.preferred_username === "string"
      ? profile.preferred_username.trim()
      : "";

  if (family && given) {
    // When Keycloak relays a Google login, it maps Google's full name (e.g. "서상현")
    // into given_name, leaving family_name as "서". Detect this by checking whether
    // given_name already begins with family_name — if so, given_name is the full name.
    if (given.startsWith(family)) return given;
    return `${family}${given}`;
  }
  if (user.name && user.name.trim()) return user.name.trim();
  if (preferred) return preferred;
  return "User";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
    }),
  ],
  cookies: {
    pkceCodeVerifier: {
      name: `${cookiePrefix}authjs.pkce.code_verifier.v2`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    state: {
      name: `${cookiePrefix}authjs.state.v2`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    nonce: {
      name: `${cookiePrefix}authjs.nonce.v2`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.sub = profile.sub ?? undefined;
        token.name = resolveDisplayName(
          { name: token.name as string | null, email: token.email as string | null },
          profile as Record<string, unknown>
        );
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
        session.user.name = (token.name as string) ?? session.user.name ?? null;
      }
      return session;
    },
    async signIn({ user, profile }) {
      if (!profile?.sub) return true;
      // Upsert user in local database on first login
      try {
        const profileRecord = profile as Record<string, unknown>;
        const displayName = resolveDisplayName(user, profileRecord);
        await prisma.user.upsert({
          where: { keycloakId: profile.sub },
          update: {
            displayName,
            email: user.email ?? "",
          },
          create: {
            keycloakId: profile.sub,
            displayName,
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
