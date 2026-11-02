import { Suspense } from "react";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";

/**
 * Layout das áreas protegidas.
 * Com Cache Components, a leitura da sessão acontece por requisição e precisa
 * ficar dentro de <Suspense>. O cabeçalho carrega na hora; o usuário e o
 * conteúdo da página chegam logo em seguida. Cada página chama requireUser(),
 * que redireciona para /login se não houver sessão.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="font-semibold text-emerald-600">
              JobPilot
            </Link>
            <Link
              href="/dashboard"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              Painel
            </Link>
          </nav>

          <Suspense fallback={<div className="h-7 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await requireUser();

  return (
    <div className="flex items-center gap-3 text-sm">
      {user.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-7 rounded-full" />
      )}
      <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{user.name ?? user.email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
