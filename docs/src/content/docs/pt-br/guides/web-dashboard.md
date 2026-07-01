---
title: Dashboard web
description: Rode o dashboard local do dotcontext no navegador, use Vite durante o desenvolvimento e empacote a UI buildada com a CLI.
sidebar:
  order: 8
---

O dashboard web do dotcontext é uma UI local e somente leitura sobre o runtime do harness. Ele mostra docs, skills, agents, sessões, traces, artefatos, checkpoints, planos linkados e status do workflow PREVC enquanto sessões CLI, MCP ou hooks estão rodando.

## Rodar pela CLI instalada

```bash
npx -y @dotcontext/cli@latest web
```

Por padrão, `dotcontext web` faz bind em `127.0.0.1:4317`, serve a UI React empacotada, inicia a API REST + SSE e abre o navegador. Use `--no-open` em ambientes só de terminal.

```bash
dotcontext web --no-open
dotcontext web --port 4399 --no-open
```

::: caution
O dashboard não tem autenticação. Ele faz bind em `127.0.0.1` por padrão. Use `--host` somente em uma rede local confiável.
:::

## Modo de desenvolvimento

Ao trabalhar no repositório do dotcontext, use Vite para a UI e a CLI a partir do código-fonte para a API:

```bash
npm install
npm --prefix web-ui install
npm run dev:web
```

Isso inicia:

| Processo | URL | Propósito |
| --- | --- | --- |
| `dotcontext web --api-only --no-open` | `http://127.0.0.1:4317` | API REST + SSE |
| Vite | `http://localhost:5173` | UI React com HMR |

Abra a URL do Vite. O Vite encaminha `/api/*` e `/api/events` para o processo da API.

Para rodar os processos separadamente:

```bash
npm run dev:web-api
npm run dev:web-ui
```

Se a API rodar em outra porta:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:4399 npm run dev:web-ui
```

## Build local de produção

Build a UI estática e sirva pela CLI compilada:

```bash
npm run build:web-ui
npm run build
node dist/index.js web --no-open
```

A validação de pacote também recompila e copia `web-ui/dist` para o bundle da CLI:

```bash
npm run build:packages
npm run smoke:packages
```

`smoke:packages` verifica que `.release/packages/cli/web-ui/dist/index.html` existe, então o pacote instalado `@dotcontext/cli` consegue rodar `dotcontext web` sem o projeto-fonte `web-ui/`.

## Superfície da API

A API do dashboard fica em `/api`:

| Área | Rotas |
| --- | --- |
| Docs | `/api/docs`, `/api/docs/:name` |
| Skills | `/api/skills`, `/api/skills/:slug` |
| Agents | `/api/agents`, `/api/agents/:type` |
| Sessões | `/api/sessions`, `/api/sessions/:id`, `/traces`, `/artifacts`, `/checkpoints` |
| Workflow | `/api/workflow/status`, `/guide`, `/plans`, `/plans/:slug`, `/harness` |
| Eventos | `/api/events` |

`/api/events` é um stream SSE. A UI trata cada evento como sinal para recarregar os dados REST atuais; o payload do evento não é estado autoritativo.
