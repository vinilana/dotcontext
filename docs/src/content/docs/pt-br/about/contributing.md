---
title: Contribuindo & desenvolvimento
description: Prepare o repositório do dotcontext, rode os quatro comandos de validação, mantenha a documentação em dia e encontre seu caminho pelo código.
sidebar:
  order: 2
---

O dotcontext é open source, e contribuições são bem-vindas — seja uma correção de bug, uma nova heurística de sensor, uma action extra de tool MCP, ou simplesmente melhorar esta documentação. Esta página cobre tudo o que você precisa para trabalhar no repositório com confiança: clonar e fazer o build, os comandos de validação que controlam cada mudança, a higiene de documentação que esperamos e um mapa de onde as coisas ficam.

Se você só quer *usar* o dotcontext, não precisa de nada disto — comece pela [Instalação](/pt-br/getting-started/installation/). Esta página é para quem vai trabalhar **no** runtime em si.

:::tip
Leia a [Arquitetura](/pt-br/about/architecture/) primeiro. Ela explica o formato `cli -> harness <- mcp` e as regras de fronteira que o código impõe, o que torna o mapa de diretórios abaixo muito mais fácil de navegar.
:::

## Pré-requisitos

| Requisito | Versão | Observações |
| --- | --- | --- |
| Node.js | `>=20.0.0` | A CLI e o harness têm como alvo Node 20+. |
| npm | incluído com o Node | O repositório usa npm scripts para build, testes e packaging. |
| Git | qualquer versão recente | Para clonar e commitar. |

## Clonar e instalar

```bash
git clone https://github.com/vinilana/dotcontext.git
cd dotcontext
npm install
```

O `npm install` baixa toda a stack de desenvolvimento (TypeScript, Jest, os AI SDKs e os scripts de packaging). Quando terminar, você já pode fazer o build e rodar os testes.

## Comandos de validação

Toda mudança precisa passar pelos mesmos quatro comandos, nesta ordem. Eles são o contrato: se estiverem verdes, sua mudança está em bom estado. Rode-os localmente antes de abrir um pull request.

```bash
npm run build
npm test -- --runInBand
npm run build:packages
npm run smoke:packages
```

Veja o que cada um faz e por que importa.

### `npm run build`

Compila os fontes TypeScript para `dist/` — `dist/cli/`, `dist/harness/`, `dist/mcp/` e `dist/shared/`, além das definições de tipo `.d.ts`. É o sinal mais rápido: um build limpo significa que os tipos batem e os imports entre fronteiras resolvem.

### `npm test -- --runInBand`

Roda a suíte de testes do Jest de forma **síncrona**. A flag `--runInBand` força os testes a rodarem em um único processo, em vez de em workers paralelos — muitos testes mexem no sistema de arquivos (sessions, traces, contracts em `.context/runtime/`), então rodar in band evita a instabilidade que workers paralelos causariam.

:::note
Os testes ficam colocados junto do código que cobrem, em pastas `__tests__/`, e não em uma árvore de testes separada no topo do projeto. Quando você adiciona comportamento, adicione ou atualize o teste ao lado dele.
:::

### `npm run build:packages`

Faz o build dos três bundles de pacote isolados em `.release/packages/{cli,harness,mcp}` via `scripts/build-package-bundles.js`. Esta etapa é o que prova que as fronteiras dos pacotes realmente se sustentam:

- Copia o `dist/` para a raiz de cada pacote.
- Escreve um manifesto `package.json` específico para cada surface — dependências filtradas, `exports` e entradas `bin`.
- Copia arquivos compartilhados (`LICENSE`, `README.md`).
- Gera os shims de bin para os executáveis (`dotcontext`, `dotcontext-mcp`).
- Copia o diretório `prompts/` (somente CLI).

### `npm run smoke:packages`

Roda `scripts/smoke-package-bundles.js` para validar os bundles que você acabou de gerar. É um smoke test estrutural, não de runtime, e verifica:

- Que o nome de cada manifesto bate com o escopo esperado (`@dotcontext/cli`, `@dotcontext/harness`, `@dotcontext/mcp`) e que a versão bate com a raiz.
- Que o entry principal existe (`dist/cli/index.js`, `dist/harness/index.js`, `dist/mcp/index.js`) e que os arquivos de tipo `.d.ts` também existem.
- Que os `exports` esperados estão presentes em cada index compilado.
- Que as entradas `bin` e os shims locais existem para CLI e MCP.
- Que **nenhuma pasta legada `dist/services/`** é publicada — isso reforça a arquitetura (comportamento de domínio não pode vazar para as surfaces de transporte).
- Que `README.md` e `LICENSE` estão incluídos; e que o diretório `prompts/` está presente para a CLI.

:::caution
A verificação de "nenhum `dist/services/`" é intencional. Se um smoke test de pacote falhar nela, provavelmente você moveu comportamento de domínio para `cli` ou `mcp` em vez de para o `harness`. Veja a [Arquitetura](/pt-br/about/architecture/) para as regras de fronteira.
:::

## Os três pacotes

O monorepo publica três pacotes independentes a partir de uma única versão compartilhada. Entender qual surface é dona de quê mantém sua mudança no lugar certo.

| Pacote | Papel | Bin |
| --- | --- | --- |
| `@dotcontext/cli` | Sync, import/export, setup de MCP, relatórios e workflows admin voltados ao operador. | `dotcontext` |
| `@dotcontext/harness` | Runtime reutilizável: regras de domínio, sessions, policies, sensors, contracts, replay, estado de workflow. | — |
| `@dotcontext/mcp` | Adaptador de transporte do Model Context Protocol e instalador para ferramentas de IA. | `dotcontext-mcp` |

Os três são versionados juntos para permanecerem compatíveis. Para o detalhe completo de exports e packaging, veja [Packaging & versionamento](/pt-br/reference/configuration/).

:::note
O `package.json` da raiz expõe apenas o bin `dotcontext`. O binário `dotcontext-mcp` aparece no manifesto `.release/packages/mcp/` produzido pelo `build:packages` — a CLI raiz inicia o servidor com `dotcontext mcp`, e não com um binário separado.
:::

## Higiene de documentação

A documentação faz parte da mudança, não é algo deixado para depois. Quando você mexer em qualquer um dos itens abaixo, atualize a documentação no mesmo pull request:

- posicionamento do produto
- comportamento de instalação do MCP
- fronteiras dos pacotes
- comandos de workflow
- orientações de release / versionamento

No mínimo, revise estes arquivos do repositório quando sua mudança os afetar:

| Arquivo | Cobre |
| --- | --- |
| `README.md` | Descrição do produto e orientação de instalação. |
| `docs/src/content/docs/` | Fluxos de uso (publicados em [dotcontext.dev](https://dotcontext.dev)). |
| `ARCHITECTURE.md` | Diagramas de runtime e de fronteira. |
| `CONTRIBUTING.md` | Processo de contribuição. |
| `CHANGELOG.md` | Notas de release. |

Se sua mudança é visível para o usuário, quase certamente ela também precisa de uma atualização correspondente neste site de documentação — e lembre-se de que as páginas são bilíngues: toda página em inglês sob `docs/src/content/docs/en/` tem um espelho em português brasileiro sob `docs/src/content/docs/pt-br/` com a mesma estrutura.

## Por onde começar no repositório

O código é organizado em torno do formato `cli -> harness <- mcp`. Mantenha o comportamento de domínio no harness — não o mova para `cli` ou `mcp`.

| Caminho | O que vive aqui |
| --- | --- |
| `src/cli` | Exports voltados ao operador e serviços orientados à CLI. |
| `src/harness` | Exports do runtime reutilizável (regras de domínio, sessions, sensors, policies, contracts, replay). |
| `src/mcp` | A fronteira de transporte do MCP. |
| `src/integrations` | Adaptadores de hooks de host e helpers de instalação (Claude Code, Codex, Pi). |
| `src/shared/fs/pathHelpers.ts` | Resolução centralizada de caminhos — a única fonte da verdade para os caminhos `.context/`. |
| `scripts/build-package-bundles.js` | Bundling dos pacotes. |
| `scripts/smoke-package-bundles.js` | Smoke tests dos pacotes. |

Uma boa primeira leitura é o `ARCHITECTURE.md` para os diagramas de fronteira, depois o `README.md` para o enquadramento do produto, e então o [site de documentação](/pt-br/getting-started/quickstart/) para os fluxos de uso que você está prestes a alterar.

## Branches e commits

Trabalhe em uma branch — não commite direto na `main`. Mantenha os commits focados, escreva mensagens claras e garanta que os quatro comandos de validação passem antes de fazer push.

Abra seu pull request contra a `main` no [GitHub](https://github.com/vinilana/dotcontext). Descreva o que mudou, por quê e quais comandos de validação você rodou.

## Próximos passos

- [Arquitetura](/pt-br/about/architecture/) — as fronteiras que sua mudança precisa respeitar.
- [Packaging & versionamento](/pt-br/reference/configuration/) — como os três pacotes são construídos e publicados.
- [Comandos da CLI](/pt-br/reference/cli-commands/) — a surface de operador que você pode estar estendendo.
- [Tools MCP](/pt-br/reference/mcp-tools/) — as actions de tool expostas aos clientes de IA.
