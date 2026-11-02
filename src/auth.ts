import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/**
 * Autenticação com Auth.js (NextAuth v5).
 *
 * - Login via GitHub (OAuth App).
 * - Sessões salvas no Postgres (tabelas users, accounts, sessions).
 * - Lê automaticamente AUTH_SECRET, AUTH_GITHUB_ID e AUTH_GITHUB_SECRET do .env.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
  // Necessário fora do `next dev` (ex.: `next start`, Docker). Na Vercel é automático.
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    // Expõe o id do usuário na sessão para as queries do app
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
