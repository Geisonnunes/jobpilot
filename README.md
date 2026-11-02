# JobPilot

Busca de vagas assistida por IA, com foco inicial em **front-end júnior no Brasil**.
O JobPilot encontra vagas, avalia a compatibilidade com o seu CV e prepara a candidatura.
**Nenhuma candidatura é enviada automaticamente**: a aprovação é sempre sua.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- PostgreSQL 17 + Prisma 7 (driver adapter `@prisma/adapter-pg`)
- Zod para validar env e respostas da IA
- Claude API (a partir da Fase 3)
- Fila + workers em TypeScript (a partir da Fase 2)

## Como rodar

Pré-requisitos: Node 20+ e Docker.

```bash
npm install            # instala e gera o Prisma Client
cp .env.example .env   # ajuste se necessário
npm run db:up          # sobe o Postgres no Docker
npm run db:migrate -- --name init   # cria as tabelas (primeira vez)
npm run db:seed        # cadastra as fontes de vagas (Gupy, Remotive, manual)
npm run dev            # http://localhost:3000
```

Para ver os dados: `npm run db:studio`.

## Estrutura

```
prisma/
  schema.prisma        # modelo de dados
  seed.ts              # fontes de vagas iniciais
prisma.config.ts       # config do Prisma 7 (URL do banco, seed)
src/
  app/                 # rotas e páginas (Next.js)
  generated/prisma/    # Prisma Client gerado (não versionado)
  lib/
    env.ts             # variáveis de ambiente validadas com Zod
    prisma.ts          # instância única do Prisma Client
  server/
    connectors/        # um conector por fonte de vagas (Fase 2)
    ai/                # prompts e chamadas à Claude API (Fase 3)
    jobs/              # definição das tarefas da fila
  workers/             # processos de segundo plano
docker-compose.yml     # Postgres local
```

## Modelo de dados

| Modelo | Para que serve |
|---|---|
| `User`, `Account`, `Session`, `VerificationToken` | Autenticação (compatível com Auth.js) |
| `CandidateProfile` | Preferências: cargos, skills, senioridade, modalidade, score mínimo, palavras excluídas |
| `Resume` | Versões do CV (texto bruto + estrutura), uma marcada como principal |
| `JobSource` | Fontes de vagas e seus limites de frequência |
| `ScanRun` | Cada coleta: contadores e erros por fonte |
| `JobPosting` | Vaga normalizada. Deduplicação por `canonicalUrl` (única) e `contentHash` |
| `JobMatch` | Avaliação da IA: score 1–5, dimensões, recomendação. Única por usuário + vaga + CV + versão do prompt |
| `GeneratedDocument` | CV, carta ou respostas geradas, com resultado da checagem anti-invenção |
| `AiUsage` | Tokens e custo (em micro-dólares) de cada chamada de IA |
| `Application` | Candidatura. Única por usuário + vaga; `approvedAt` registra a aprovação humana |
| `ApplicationEvent` | Histórico de mudanças de status |

## Regras do projeto

1. **Sem envio automático.** O sistema prepara; o usuário revisa e envia.
2. **Sem scraping** de plataformas que proíbem automação (LinkedIn, Indeed, Glassdoor, InfoJobs).
   Vagas delas entram pela fonte `manual`: o usuário cola o link ou o texto.
3. **Dados pessoais fora do Git.** `.env`, CVs e exports ficam no `.gitignore`.
4. **A IA não inventa.** Todo documento gerado passa por checagem de fatos contra o CV base.

## Créditos

Partes da arquitetura e, nas próximas fases, alguns conectores são inspirados ou adaptados do
[Career Ops](https://github.com/career-ops-hq/career-ops) (MIT, © 2026 Santiago Fernández de Valderrama).
Código adaptado manterá o aviso de copyright e a licença MIT em `THIRD_PARTY_NOTICES.md`.
