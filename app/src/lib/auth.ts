import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import { prisma } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Naver({
      clientId: process.env.NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // Email is the cross-provider identity key — Google and Naver both return
    // a verified email. On first login we find-or-create the user row by
    // email, so existing accounts (and their riding history) stay linked.
    async signIn({ user }) {
      if (!user.email) return false;
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          email: user.email,
          displayName: user.name?.trim() || "User",
          role: "user",
        },
      });
      return true;
    },
    async jwt({ token }) {
      // token.email is populated on sign-in and persists in the JWT.
      // Resolve the DB user on every call so role/status stay fresh, and
      // expose the internal user UUID as token.sub.
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, role: true, status: true, displayName: true },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.roles = [dbUser.role];
          token.status = dbUser.status;
          token.name = dbUser.displayName;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // session.user.id is the internal users.id UUID.
        session.user.id = token.sub!;
        session.user.roles = (token.roles as string[]) ?? ["user"];
        session.user.status = (token.status as string) ?? "active";
        session.user.name = (token.name as string) ?? session.user.name ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
});
