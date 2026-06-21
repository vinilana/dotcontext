---
title: Introdução
description: O que é o dotcontext, o problema que ele resolve e como as superfícies cli, harness e mcp se encaixam.
sidebar:
  order: 1
---

Ferramentas de código com IA são poderosas, mas esquecidas. Cada conversa nova começa do zero. As regras que seu time combinou vivem no prompt de alguém, as decisões de arquitetura vivem em uma thread do Slack, e o conhecimento de "como entregamos as coisas por aqui" vive na cabeça das pessoas. Quando você troca de uma ferramenta de IA para outra, nada disso vai junto.

O **dotcontext** resolve isso. Ele dá ao seu repositório um cérebro durável e versionado — seus docs, playbooks de agentes, skills, checagens de qualidade e o workflow de execução — que qualquer ferramenta de IA pode ler através de um único servidor Model Context Protocol (MCP).

## O problema

Se você já usou assistentes de IA em uma base de código real, provavelmente esbarrou em algo assim:

- **O conhecimento do projeto está espalhado.** Notas de arquitetura, convenções e conhecimento tribal ficam dispersos por READMEs, wikis, histórico de chat e o notebook de ninguém.
- **As regras de execução vivem nos prompts.** "Sempre rode os testes", "não mexa no config", "peça review antes de fazer merge" — isso é redigitado em toda conversa e esquecido com a mesma frequência.
- **Não existe trilha de auditoria.** Quando um agente de IA faz uma alteração, você raramente tem registro do que ele rodou, do que produziu ou por que decidiu algo.
- **Nada é reutilizável entre ferramentas de IA.** Você configura o Claude Code hoje, troca para o Cursor amanhã, e recomeça do zero. Cada ferramenta quer seu próprio config no seu próprio formato.

O dotcontext transforma esse contexto espalhado e descartável em uma única fonte de verdade que vive no seu repo, dentro de `.context/`, e viaja junto com o projeto.

## O que o dotcontext oferece

- **Uma base de conhecimento versionada.** Docs do projeto, playbooks de agentes e skills reutilizáveis vivem em `.context/` e são commitados no git como qualquer outro código.
- **Um workflow de execução estruturado.** O workflow PREVC (Plan, Review, Execute, Validate, Confirm) dá aos agentes de IA um caminho em fases pelo trabalho real, com gates e handoffs entre papéis.
- **Checagens de qualidade que de fato rodam.** Sensors são checagens executáveis — build, testes, typecheck, lint — que emitem resultados de pass/fail durante a execução, registrados como parte da run.
- **Enforcement e auditoria.** Policies declaram regras de allow/deny/approve, enquanto sessions, traces, artifacts e checkpoints dão um registro durável do que aconteceu. Replay e failure datasets permitem reconstruir e aprender com runs passadas.
- **Um config, todas as ferramentas.** Escreva o contexto uma vez e exporte para qualquer ferramenta de IA que seu time usa, ou rode o servidor MCP para que todas leiam o mesmo cérebro ao vivo.

## A forma: cli -> harness <- mcp

O dotcontext é construído em torno de um runtime central — o **harness** — com duas superfícies envolvendo-o:

```text
cli -> harness <- mcp
```

O harness contém todo o comportamento real. A CLI e o MCP são fronteiras finas que operadores e ferramentas de IA usam para alcançá-lo.

| Superfície | Pacote | Quem usa | O que faz |
| --- | --- | --- | --- |
| **harness** | `@dotcontext/harness` | importado pelas outras duas | O runtime reutilizável: estado do workflow PREVC, sessions, sensors, policies, task contracts, replay e datasets. |
| **cli** | `@dotcontext/cli` | operadores (você, no terminal) | Sync e admin: exportar/importar rules, agents e skills entre `.context/` e os diretórios das ferramentas de IA, instalar o servidor MCP, rodar reports e gerenciar o estado do workflow. |
| **mcp** | `@dotcontext/mcp` | ferramentas de IA (Claude Code, Cursor, etc.) | O transporte Model Context Protocol: expõe o comportamento do harness como tools e resources MCP, além de um instalador para clients suportados. |

### As três superfícies de pacote

O dotcontext é distribuído como três pacotes npm publicáveis de forma independente que compartilham uma única versão:

- **`@dotcontext/harness`** — o runtime reutilizável. Regras de domínio, roteamento do workflow, estado de session e runtime, sensors, policies e contracts. Importe-o se você está construindo em cima do dotcontext.
- **`@dotcontext/cli`** — a linha de comando voltada ao operador. É o binário `dotcontext` que você roda para sincronizar artefatos e configurar ferramentas.
- **`@dotcontext/mcp`** — o adaptador de transporte MCP e o instalador. É a isso que suas ferramentas de IA se conectam.

:::note
A CLI standalone é **focada em sync e admin**. Criação de contexto, fills gerados por IA e scaffolding de plano são **MCP-first** — rodam através do servidor MCP e das tools com Claude, não como comandos diretos da CLI.
:::

## Para quem é

O dotcontext é para desenvolvedores e times que usam ferramentas de código com IA em bases reais e de vida longa e querem que esse trabalho seja consistente, revisável e portátil. Ele encaixa especialmente bem se você:

- usa mais de uma ferramenta de IA, ou espera trocar entre elas
- quer convenções compartilhadas e aplicáveis em vez de prompts por pessoa
- se importa com uma trilha de auditoria do que os agentes de IA fazem no seu repo
- executa trabalho estruturado (features, refatorações, mudanças sensíveis a compliance) e quer execução em fases com gates

Se você só quer uma resposta pontual em um único chat, não precisa do dotcontext. No momento em que você quer que esse contexto persista, seja compartilhado e seja aplicado — é aí que ele justifica seu lugar.

## Próximos passos

- **[Instalação](/pt-br/getting-started/installation/)** — instale o servidor MCP (recomendado) ou a CLI standalone.
- **[Quickstart](/pt-br/getting-started/quickstart/)** — vá de um repo vazio a um workflow PREVC rodando em poucos passos.
- **[Visão geral dos conceitos](/pt-br/concepts/prevc-workflow/)** — entenda em profundidade o workflow PREVC, sensors, policies, task contracts e runtime state.
- **[Referência de tools MCP](/pt-br/reference/mcp-tools/)** — a lista completa de tools que seu client de IA pode chamar.

Para código-fonte e issues, veja o projeto no [GitHub](https://github.com/vinilana/dotcontext).
