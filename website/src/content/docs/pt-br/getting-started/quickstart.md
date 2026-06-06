---
title: Início rápido
description: Use o dotcontext de ponta a ponta a partir da sua ferramenta de IA — bootstrap do contexto, scaffold de um plano, início do workflow PREVC e avanço pelas fases.
sidebar:
  order: 3
---

Este guia leva você de um repositório vazio até um workflow PREVC em execução em cerca de cinco passos — tudo conduzido por linguagem natural de dentro de uma ferramenta de IA que fala MCP (Claude Code, Cursor, Windsurf e companhia).

o dotcontext é um harness para o seu harness: ele dá ao seu agente uma camada de contexto durável que ele pode retomar depois — contexto compartilhado, um workflow com fases e estado de runtime — não importa qual ferramenta de IA você use. Na maior parte do tempo você conversa com o agente em português; por baixo dos panos ele chama as ferramentas MCP do dotcontext. Cada passo abaixo mostra tanto o prompt que você digita quanto a ferramenta que o agente executa.

:::note[Antes de começar]
Você precisa do servidor MCP do dotcontext instalado na sua ferramenta de IA. Se ainda não fez isso, rode `npx @dotcontext/mcp install` (ou siga a página de [Instalação](/pt-br/getting-started/installation/)) e reinicie a ferramenta para que ela reconheça o servidor.
:::

## Passo 1 — Bootstrap do contexto

Primeiro, dê ao projeto um diretório `.context/`. É nele que vivem o conhecimento durável (docs, agents, skills) e o estado de runtime gerado.

Peça ao seu agente:

```text
Inicialize o contexto do dotcontext para este projeto e preencha automaticamente a partir do codebase.
```

Nos bastidores, o agente verifica se `.context/` existe e então faz o scaffold:

```jsonc
// context: verifica o estado do projeto
{ "action": "check", "repoPath": "/caminho/para/seu/projeto" }

// context: faz o scaffold de .context/ e popula conteúdo a partir do codebase
{ "action": "init", "autoFill": true }
```

A primeira chamada a `context` deve incluir `repoPath`; chamadas seguintes reutilizam o valor em cache. A action `init` cria o layout `.context/` — incluindo `config/` para configuração autorada e `runtime/` para estado gerado. Veja a [convenção .context](/pt-br/concepts/context-convention/) para o layout completo.

## Passo 2 — Preencha os arquivos pendentes

O `init` deixa o scaffold pronto, mas alguns arquivos começam vazios e precisam de conteúdo real. Peça ao agente para preenchê-los.

Prompt:

```text
Liste o que ainda está pendente em .context e preencha cada arquivo a partir do codebase.
```

O agente encontra os arquivos pendentes e preenche um de cada vez:

```jsonc
// context: veja o que ainda precisa de conteúdo
{ "action": "listToFill" }

// context: preenche um único arquivo (repita para cada arquivo pendente)
{ "action": "fillSingle", "filePath": ".context/docs/overview.md" }
```

:::tip[Preencha de forma incremental]
O `fillSingle` roda uma vez por arquivo, então você pode revisar e corrigir o conteúdo gerado conforme avança. Isso mantém o seu `.context/docs` preciso, em vez de despejar tudo de uma só vez.
:::

## Passo 3 — Scaffold de um plano

Para trabalho não trivial, crie um template de plano. Ele dá ao workflow um lugar para registrar decisões, progresso das fases e outputs.

Prompt:

```text
Crie um plano chamado "dark-mode" para adicionar um toggle de tema escuro.
```

O agente faz o scaffold do plano:

```jsonc
// context: cria um template de plano
{
  "action": "scaffoldPlan",
  "planName": "dark-mode",
  "title": "Toggle de modo escuro",
  "summary": "Adicionar um tema escuro para o usuário, com persistência"
}
```

:::note
Pule este passo para mudanças rápidas de um único arquivo — um plano é overhead desnecessário para corrigir um typo. Inicie o workflow direto (próximo passo) e o dotcontext vai rotear você por um conjunto de fases mais curto.
:::

## Passo 4 — Inicie o workflow PREVC

Agora transforme o contexto recém-criado em um workflow em execução. PREVC significa **Plan → Review → Execute → Verify → Confirm**, e o dotcontext roteia apenas as fases que a sua tarefa realmente precisa, com base na escala dela.

Prompt:

```text
Inicie um workflow PREVC chamado "dark-mode" para adicionar um toggle de tema escuro.
```

O agente inicializa o workflow:

```jsonc
// workflow-init
{
  "name": "dark-mode",
  "description": "Adicionar um tema escuro para o usuário, com persistência"
}
```

O dotcontext detecta automaticamente uma escala a partir da sua descrição (ou você pode passar `scale` explicitamente como `QUICK`, `SMALL`, `MEDIUM` ou `LARGE`) e seleciona as fases a executar:

| Escala | Fases | Uso típico |
| --- | --- | --- |
| `QUICK` | E → V | Correções de bug, ajustes mínimos |
| `SMALL` | P → E → V | Features simples |
| `MEDIUM` | P → R → E → V | Features regulares com design |
| `LARGE` | P → R → E → V → C | Sistemas complexos, compliance, docs |

O estado canônico do workflow fica em `.context/runtime/workflows/prevc.json`. Esse arquivo é a única fonte de verdade para a fase atual, configuração de gates e progresso — e, por ser persistido, o workflow sobrevive entre sessões e ferramentas.

:::tip[Gates são opcionais, mas úteis]
Você pode exigir um plano antes de sair de Plan (`require_plan`) ou uma aprovação antes de sair de Review (`require_approval`). Passe esses parâmetros ao `workflow-init` para que o runtime os imponha. Veja o [workflow PREVC](/pt-br/concepts/prevc-workflow/) para o modelo completo de gates.
:::

## Passo 5 — Trabalhe as fases e avance

Com o workflow rodando, peça o status, faça o trabalho da fase atual e então avance.

Prompt:

```text
Qual é a fase atual do workflow e o que devo fazer em seguida?
```

O agente lê o status:

```jsonc
// workflow-status
{}
```

Faça o trabalho que a fase exige — por exemplo, em Execute você implementa a feature e escreve testes. Quando a fase terminar, diga ao agente para seguir adiante e entregue os artefatos que você produziu.

Prompt:

```text
A implementação está pronta. Avance o workflow e registre os arquivos que alterei.
```

O agente avança, repassando os outputs:

```jsonc
// workflow-advance
{ "outputs": ["src/theme/darkMode.ts", "src/theme/__tests__/darkMode.test.ts"] }
```

Repita status → trabalho → avanço para cada fase restante. Cada transição atualiza `.context/runtime/workflows/prevc.json`, então você sempre tem um registro preciso e replayável de onde o trabalho está.

:::caution[Transições com gate]
Se um gate estiver configurado, o `workflow-advance` vai bloquear até que ele seja satisfeito — por exemplo, P → R exige um plano quando `require_plan` está ativo, e R → E exige uma aprovação quando `require_approval` está ativo. Você pode passar `force: true` para contornar um gate quando souber que é seguro, mas prefira satisfazer o gate.
:::

## O que você construiu

Depois desses cinco passos, você tem:

- Um diretório `.context/` populado com docs, agents e skills
- Um scaffold de plano opcional acompanhando decisões e progresso
- Um workflow PREVC ativo cujo estado canônico é `.context/runtime/workflows/prevc.json`
- Um rastro fase a fase de outputs que o agente pode retomar depois

## Próximos passos

- [Workflow PREVC](/pt-br/concepts/prevc-workflow/) — o modelo completo de fases, escalas, papéis e gates
- [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) — prompts, ferramentas e fluxos de agente em profundidade
- [A convenção .context](/pt-br/concepts/context-convention/) — o que mora onde no disco
- [Referência de ferramentas MCP](/pt-br/reference/mcp-tools/) — cada ferramenta, action e parâmetro
