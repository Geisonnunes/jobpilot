import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

/**
 * Retorna o usuário logado ou redireciona para /login.
 * Use em Server Components e Server Actions das áreas protegidas.
 */
export async function requireUser() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as typeof session.user & { id: string };
}
