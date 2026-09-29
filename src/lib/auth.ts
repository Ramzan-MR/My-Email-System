import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// Single-owner/admin auth for the MVP (see CLAUDE.md "Authentication").
// Architected to allow multiple DB-backed users later without changing the
// login flow: authorize() checks the User table first and only falls back
// to the env-configured admin when no DB user matches, so the app is usable
// before the database has been seeded.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        let passwordHash: string | undefined;
        let userId = "env-admin";
        let userEmail = email;

        const dbUser = await prisma.user.findUnique({ where: { email } }).catch(() => null);
        if (dbUser) {
          passwordHash = dbUser.passwordHash;
          userId = dbUser.id;
          userEmail = dbUser.email;
        } else if (
          process.env.ADMIN_EMAIL &&
          process.env.ADMIN_PASSWORD_HASH &&
          email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
        ) {
          passwordHash = process.env.ADMIN_PASSWORD_HASH;
        }

        if (!passwordHash) return null;

        const valid = await bcrypt.compare(password, passwordHash);
        if (!valid) return null;

        return { id: userId, email: userEmail };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
