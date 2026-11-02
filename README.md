# JobPilot

Busca de vagas assistida por IA, com foco inicial em **front-end júnior no Brasil**.
O JobPilot encontra vagas, avalia a compatibilidade com o seu CV e prepara a candidatura.
**Nenhuma candidatura é enviada automaticamente**: a aprovação é sempre sua.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- PostgreSQL 17 + Prisma 7 (driver adapter `@prisma/adapter-pg`)
- Zod para validar env e respostas da IA
- IA: Claude Code local (`claude-cli`, padrão) ou Claude API (`anthropic-api`), na Fase 3
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

### Login com GitHub

1. Crie um OAuth App em https://github.com/settings/developers → **New OAuth App**:
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
2. Copie o **Client ID** e gere um **Client secret**.
3. No `.env`, preencha `AUTH_GITHUB_ID` e `AUTH_GITHUB_SECRET`.
4. Gere o `AUTH_SECRET` com o comando abaixo e cole o resultado em `AUTH_SECRET` no `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   (Não use `npx auth secret`: o pacote `auth` do npm hoje é da Better Auth e gera `BETTER_AUTH_SECRET`, que o Auth.js não lê.)

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
    ai/                # provedores de IA, pré-filtro e matching (Fase 3)
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

## Coleta de vagas (Fase 2)

```bash
npm run scan -- --source=gupy|remotive|all [--force]   # coleta pela linha de comando
npm test                                               # testes (vitest), sem acesso à rede
```

- Fontes: Gupy e Remotive (APIs públicas) e vagas coladas à mão em `/vagas/nova`. Nada de scraping.
- A busca vem do seu perfil (cargos + principais tecnologias). Cada fonte respeita `minIntervalMinutes` e
  `requestDelayMs` (o Remotive pede no máximo ~4 consultas por dia). `--force` ignora o intervalo mínimo.
- **Gupy: busca específica e filtro de relevância.** Os termos vêm do perfil (até 6, sem habilidades genéricas sozinhas).
  Vagas de outra área, de mobile nativo, back-end puro ou de nível acima do seu perfil (pleno, sênior, "Sr", "Pl"…) **não são salvas**;
  os contadores ficam em `ScanRun.query.stats`. Os termos de cada categoria estão em `src/server/jobs/relevance.ts`.
  O Remotive não é filtrado.
- Vagas híbridas/presenciais fora da sua UF são barradas no pré-filtro de IA ("Fora da sua região"); remotas não.
- `npm run jobs:cleanup` aplica o mesmo filtro às vagas da Gupy já salvas. Por padrão é `--dry-run` (só lista);
  `-- --apply` apaga. Nunca remove vagas manuais nem vagas com avaliação de IA ou candidatura.
- Código portado do Career Ops (MIT): veja `THIRD_PARTY_NOTICES.md`.
- Só para desenvolvimento: com `JOBPILOT_RECORD_DIR=<pasta>` (por exemplo em `.env.local`) as respostas cruas das
  fontes são gravadas nessa pasta, para criar fixtures de teste.

## Matching com IA (Fase 3)

Cada vaga é comparada com o seu perfil e o seu currículo principal: nota de 1,0 a 5,0, recomendação
(`APPLY`, `MAYBE`, `SKIP`), cinco dimensões com justificativa, skills encontradas (com o trecho literal do CV),
skills que faltam e alertas. O resultado fica em `JobMatch`; cada chamada fica em `AiUsage`.

```bash
npm run match [-- --limit=N] [-- --posting=<id>] [-- --force]   # lote pela linha de comando
```

Na interface: botão **Avaliar compatibilidade** em `/vagas/[id]` (uma vaga por vez; o lote é só pelo script).

### Provedor de IA (`AI_PROVIDER`)

| Valor | O que faz | Custo |
|---|---|---|
| `claude-cli` (padrão) | Executa o Claude Code em modo headless na sua máquina, com a sua assinatura. Precisa do `claude` instalado e logado. | Sem custo de API |
| `anthropic-api` | Claude API pelo SDK oficial. Exige `ANTHROPIC_API_KEY`. Respeita `AI_MONTHLY_BUDGET_USD`. | Por uso |

Trocar de provedor é só mudar `AI_PROVIDER` no `.env`. Outras variáveis (todas opcionais): `AI_MODEL_MATCH`
(vazio = padrão do provedor), `CLAUDE_CLI_PATH` (precisa ser um `.exe`/binário, não `.cmd`) e
`AI_MAX_EVALUATIONS_PER_RUN` (padrão 10). Os preços usados no orçamento da API estão em `src/server/ai/pricing.ts`
e precisam ser conferidos na página oficial de preços.

### Segurança e privacidade da IA

- O CV vai à IA **sem** e-mail, telefone, CPF, endereço, links e nome (`redactPii`). Vaga e CV vão como dados delimitados,
  e o prompt manda ignorar instruções contidas neles.
- `claude-cli`: sem shell, prompt pelo stdin, pasta temporária vazia como diretório de trabalho (apagada depois),
  todas as ferramentas desativadas, sessão não persistida, timeout de 120 s.
- Toda `evidence` de skill precisa existir literalmente no CV; as que não existem são removidas. A recomendação final é
  recalculada no código a partir da nota mínima do perfil.
- Vagas barradas por regras simples (encerrada, palavra excluída no título, senioridade ou modalidade incompatível,
  descrição curta) não chamam a IA.

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
