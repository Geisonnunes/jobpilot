import Link from "next/link";

const phases = [
  { n: 1, title: "Fundação", desc: "Schema, autenticação, perfil e CV", status: "Em andamento" },
  { n: 2, title: "Coleta de vagas", desc: "Gupy, Remotive e ATS públicos + deduplicação", status: "Próxima" },
  { n: 3, title: "Matching com IA", desc: "Score 1–5 via Claude API com saída JSON validada", status: "Planejada" },
  { n: 4, title: "Documentos", desc: "CV e carta personalizados com checagem de fatos", status: "Planejada" },
  { n: 5, title: "Candidaturas", desc: "Tracker, histórico e follow-up — envio sempre aprovado por você", status: "Planejada" },
  { n: 6, title: "Novas fontes", desc: "Apenas APIs oficiais ou importação manual", status: "Planejada" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-emerald-600 uppercase">JobPilot</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Busca de vagas assistida por IA
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Encontra vagas de front-end, avalia a compatibilidade com o seu CV e prepara a
        candidatura. Quem aperta o botão de enviar é você.
      </p>

      <Link
        href="/login"
        className="mt-6 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        Entrar
      </Link>

      <ol className="mt-10 space-y-3">
        {phases.map((p) => (
          <li
            key={p.n}
            className="flex items-start gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium dark:bg-zinc-800">
              {p.n}
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{p.title}</h2>
                <span className="text-xs text-zinc-500">{p.status}</span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{p.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
