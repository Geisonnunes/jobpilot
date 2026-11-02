# Avisos de terceiros

O JobPilot inclui código portado e adaptado de um projeto de código aberto.

## Career Ops

- Repositório de origem: Career Ops (https://github.com/career-ops-hq/career-ops)
- Licença: MIT
- Mantenedor: Santiago Fernández de Valderrama

Os arquivos abaixo foram portados de JavaScript para TypeScript e adaptados ao JobPilot
(tipos, contrato `JobConnector`, integração com Prisma, mensagens em português).
"Career Ops" é citado aqui apenas para indicar a origem; o JobPilot é um produto independente,
sem afiliação nem endosso do projeto original.

| Arquivo do JobPilot | Origem (Career Ops) | O que foi aproveitado |
|---|---|---|
| `src/server/connectors/gupy.ts` | `providers/gupy.mjs` | Endpoint, paginação, descarte de vagas confidenciais, mapeamento de campos |
| `src/server/connectors/remotive.ts` | `providers/remotive.mjs` | Endpoint e mapeamento de campos |
| `src/server/connectors/http.ts` | `providers/_http.mjs` | Retry com backoff exponencial e jitter, Retry-After limitado, redirect bloqueado |
| `src/server/jobs/canonical-url.ts` | `url-key.mjs` | Lista de parâmetros de rastreamento e regras de normalização de URL |
| `src/server/jobs/text.ts` | `providers/_html-to-text.mjs`, `providers/_html-entities.mjs` | Conversão de HTML em texto e decodificação segura de entidades |

## Texto da licença MIT do Career Ops

```
MIT License

Copyright (c) 2026 Santiago Fernández de Valderrama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fontes de dados

- **Gupy** (portal.gupy.io): API pública de busca de vagas; os anúncios pertencem às empresas que os publicam.
- **Remotive** (remotive.com): API pública. Conforme as regras de uso, o JobPilot faz no máximo uma consulta por coleta,
  mostra o Remotive como fonte e linka para o anúncio original. As vagas não são reenviadas a terceiros.
