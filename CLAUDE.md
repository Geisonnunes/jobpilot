@AGENTS.md

# JobPilot

Busca de vagas assistida por IA para **front-end júnior no Brasil**. Prepara candidaturas, mas **o envio é sempre feito pelo usuário**.
Stack: Next.js 16.4 (`cacheComponents` + `partialPrefetching`), React 19, TypeScript, Tailwind 4, Prisma 7 + Postgres (Docker),
Auth.js v5 (GitHub), Zod 4, vitest. Detalhes de setup e modelo de dados: `README.md`.

## Comandos

```bash
npm run dev          # servidor em http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run (sem rede)
npm run db:up        # Postgres no Docker
npm run db:migrate   # prisma migrate dev (pedir antes, veja "Pedir antes")
npm run db:seed      # fontes de vagas iniciais
npm run db:studio    # Prisma Studio
npm run scan -- --source=gupy|remotive|all [--force]   # coleta de vagas
```

O servidor de dev normalmente **já está rodando na porta 3000** em outro terminal: não o encerre nem suba outro.

## Estrutura

- `src/app/(app)/` — áreas logadas (`perfil`, `curriculo`, `vagas`, `dashboard`); cada uma com `page.tsx`, `actions.ts` e formulários client.
- `src/server/connectors/` — um conector por fonte (`gupy.ts`, `remotive.ts`), contrato em `types.ts`, `http.ts` resiliente, `registry.ts`.
- `src/server/jobs/` — ingestão, deduplicação, consulta/filtros, `scan.ts`. (`src/server/ai/` e `src/workers/` ainda vazios.)
- `src/lib/` — `session.ts`, `env.ts`, `prisma.ts`, `profile.ts`, `resume.ts`.
- `scripts/` (CLI, ex.: `scan.ts`), `tests/` (+ `tests/fixtures/`), `prisma/` (schema, migrations, seed).
- `src/generated/` é gerado pelo Prisma e não é versionado: não editar.

## Padrões obrigatórios de código

- **Páginas** em `src/app/(app)`: componente síncrono exportado + componente `async` dentro de `<Suspense>` da própria página.
  Nenhuma leitura de sessão, cookies ou banco fora do `Suspense`.
- **Autenticação**: `requireUser()` de `src/lib/session.ts` em toda página e Server Action logada.
  Dados do usuário (perfil, currículos, candidaturas, matches) sempre filtrados por `user.id`; nunca confiar em `userId`
  ou ids de recursos vindos do cliente sem conferir o dono.
  `JobPosting` é compartilhado entre usuários: só é visível se `addedByUserId` for `null` ou o do usuário
  (veja `buildJobsWhere` em `src/server/jobs/list.ts`). Reuse esse filtro.
- **Formulários**: Server Action + `useActionState`, enviados por `onSubmit` + `startTransition` (não usar `action=` direto:
  o React reseta campos controlados). Validação com Zod no servidor; erros em português, por campo.
- **Conteúdo externo** (descrições de vagas etc.): sempre texto puro. Nunca renderizar HTML de terceiros nem usar `dangerouslySetInnerHTML`.
- **Interface** em português do Brasil, estilo zinc/emerald, dark mode, testada em 390px de largura.
- **Commits** em inglês: `Phase N: ...` ou descrição curta no imperativo.

## Segurança e privacidade (inegociável)

- **NUNCA** ler, imprimir, copiar ou registrar valores de `.env` ou `.env.local`. Só é permitido verificar se uma variável existe.
- **NUNCA** criar rotas de API, páginas, scripts ou logs que leiam ou exibam variáveis de ambiente, nem temporariamente para diagnóstico.
- **NUNCA** criar `.env.local` nem alterar `.env` sem pedir.
- Nunca registrar texto de currículo, dados de perfil ou e-mails em `console.log` ou mensagens de erro (logar no máximo `error.name`).
- Não salvar em disco arquivos enviados pelo usuário (o PDF do currículo é processado em memória).
- Screenshots e arquivos de teste só em `.playwright-mcp/` (ignorada pelo Git). Testes usam dados fictícios e apagam o que criaram.
- Nunca digitar credenciais em sites durante testes com Playwright: peça ao usuário para fazer o login.

## Fontes de vagas

- **Permitidas**: APIs públicas (Gupy, Remotive), respeitando `JobSource.minIntervalMinutes` e `requestDelayMs`.
  Remotive exige atribuição e no máximo ~4 consultas por dia.
- **Proibido** coletar de LinkedIn, Indeed, Glassdoor, InfoJobs ou qualquer site que proíba automação.
  Vagas dessas fontes só entram manualmente (`/vagas/nova`), **sem requisição à URL**.
- Em desenvolvimento e testes, prefira as fixtures de `tests/fixtures/` a chamadas reais.
- Código portado do Career Ops (MIT) mantém o cabeçalho de copyright e é listado em `THIRD_PARTY_NOTICES.md`.
  Não usar "career-ops" como nome do produto.

## Candidaturas e IA

- **Nenhum envio automático de candidatura, em nenhuma circunstância.** `Application.approvedAt` registra a aprovação humana.
- Documentos gerados por IA são verificados contra o CV base; a IA não pode inventar experiências, datas ou habilidades.
- Toda chamada à Claude API registra tokens e custo em `AiUsage` e respeita `AI_MONTHLY_BUDGET_USD`.

## Pedir antes de fazer

- Alterar `prisma/schema.prisma` ou rodar migrations.
- Instalar ou atualizar dependências.
- Fazer commit ou push.
- Qualquer ação contra serviços externos além das fontes permitidas.

## Checklist antes de encerrar uma tarefa

1. `npm run typecheck`, `npm run lint` e `npm test` passando.
2. `git status` sem `.env`, `.env.local`, `.playwright-mcp/` nem arquivos temporários (ex.: PNGs na raiz).
3. Relatório final com arquivos alterados e decisões tomadas.
