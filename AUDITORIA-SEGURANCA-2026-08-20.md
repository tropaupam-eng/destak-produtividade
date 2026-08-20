# 🔒 Auditoria de Segurança — Destak Produtividade (Cronos)

> **Para:** a IA / dev responsável por este repositório (tropaupam-eng)
> **De:** Claude, a pedido do Rafael (colaborador deste repo)
> **Data:** 2026-08-20
> **Status:** revisão concluída no eixo de segurança. Correções **NÃO** aplicadas — este documento é um aviso, não uma mudança.

---

## Antes de qualquer coisa: ⚠️ NÃO "Enable RLS" sozinho

Se você ler abaixo que "não existe RLS" e a reação for marcar **Enable Row Level Security** nas tabelas — **PARE.** Isso **derruba o app inteiro na hora**, para todos os motoristas, conferentes e fiscais.

Motivo: o app não usa Supabase Auth. O login é caseiro (baixa a tabela `usuarios` e compara no navegador) e **toda** requisição usa a **mesma chave `anon`**. Não existe identidade no banco para uma policy avaliar. Ligar RLS sem antes migrar a autenticação = todo `SELECT`/`INSERT` do app vira "forbidden" → tela branca em produção.

O conserto é **coordenado** (banco + `index.html` juntos), descrito na seção "Plano de conserto". Leia até o fim antes de tocar em qualquer coisa.

---

## O que eu (Claude, pelo Rafael) fiz — e o que NÃO fiz

**Fiz:**
- Auditoria **somente leitura** do código (`index.html`, `gerot.html`, `supabase/`, `.github/`, `.claude/`).
- Algumas sondas **não-destrutivas** contra a API de produção para confirmar hipóteses: apenas **contagens** (`Range: 0-0`, `count=exact`) e escritas com **filtro que casa zero linhas** (ex.: `nome=eq.__valor_que_nao_existe__`). **Nenhum dado real foi lido, alterado ou apagado.** Nenhuma PII (nome, CPF, senha) foi trazida para tela ou log.

**NÃO fiz (e não vou fazer sem o seu OK):**
- Não toquei no seu Supabase. A conta Supabase que eu (via MCP) acesso enxerga **apenas** o projeto do Rafael (`reformo-erp`). O projeto deste app (`hiydkyslgiomdyginfdx`) **não está no meu alcance** — quem aplica migration, liga RLS, troca senha por hash ou rotaciona secret é **você/o dono**.
- Não subi nenhuma correção de código. Se e quando isso acontecer, será combinado antes.

**Ofereço:** um pacote pronto pra rodar (SQL de RLS + Auth + hash + RPC de login, e o diff do `index.html`), desenhado para **não** brickar o app. Só peça.

**Crédito onde é devido:** o repo mostra cuidado de segurança real — houve `fix(seguranca)` de XSS, `Fix password-in-URL`, e o primeiro-acesso por CPF foi endurecido para não permitir bypass. Os pontos abaixo são o que ficou de fundação, não desleixo de superfície.

---

## Achados críticos (confirmados contra produção)

### 1. Banco sem RLS → a chave `anon` (que está neste repo público) dá leitura, escrita e exclusão totais

Nenhuma das 6 migrations em `supabase/migrations/` contém `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` ou `GRANT`. Confirmado: leitura anônima retorna 206 em todas as tabelas testadas (`usuarios`, `motoristas`, `ajudantes`, `conferentes`, `base_data`, `lancamentos`, `notas_fiscais`, `absenteismo`), e `PATCH`/`DELETE` em `usuarios` retornam **204 (executado)**.

Na prática: qualquer pessoa da internet — só com o repo público — pode apagar a operação inteira, se promover a admin, ou baixar as tabelas de cadastro e financeiro. Sem conta, sem login.

**Conserto:** ver "Plano de conserto". Mitigação imediata que **não** quebra o fluxo de leitura: `REVOKE DELETE, UPDATE ON usuarios, motoristas, ajudantes, conferentes FROM anon`. ⚠️ Testar o login logo depois — o fallback em `index.html:~8794` faz um `PATCH` em `ajudantes`; se quebrar, ajuste esse ponto junto.

### 2. Senhas em texto puro, comparadas no navegador

`index.html:8746-8804` (comparação em `:8760`): o login faz `select=*` em `usuarios` e compara `u.senha === senha` no cliente. Para funcionar, o banco devolve a senha em texto puro. `grep` por `bcrypt`/`sha256`/`crypto.subtle` = **0** ocorrências. Somado ao item 1, são ~**246 contas** (usuários + motoristas + ajudantes + conferentes) expostas.

**Conserto:** Supabase Auth (senha com hash, JWT com `perfil` em `app_metadata`). Enquanto a comparação for no cliente, a senha precisa trafegar para o cliente — não há atalho.

### 3. Sessão é um JSON editável no cliente → login contornável

`index.html:8907-8917` e `:37950-37956`: a sessão é lida do `localStorage` e a validação inteira é "tem `id` e tem `email`". Sem token, sem assinatura, sem expiração, sem verificação no servidor. É possível forjar uma sessão de admin editando esse objeto no cliente — sem senha e sem conta existente. Um funcionário curioso descobre sozinho.

**Conserto:** mesma raiz do item 2 — a sessão precisa ser um JWT assinado que o servidor valida.

### 4. Chave da API do ERP hardcoded, protegendo um endpoint `service_role`

`supabase/functions/receber-pedidos-erp/index.ts:6` — a `ERP_API_KEY` tem um **fallback literal no código** e esse literal é o que está protegendo o endpoint (confirmei que a env não está setada: a chave do código autentica, uma chave errada dá 401). Esse endpoint usa `SUPABASE_SERVICE_ROLE_KEY` (`:182`).

Na prática: quem lê o repo injeta pedidos falsos em `base_data_erp` (contamina OTIF, faturamento, indicadores) com privilégio de `service_role`.

**Conserto (5 min, do dono):** `supabase secrets set ERP_API_KEY=<novo valor aleatório>` **e** trocar o fallback por fail-fast: `if (!API_KEY) throw new Error('ERP_API_KEY não configurada')`. Segredo ausente deve derrubar a função, nunca virar default público. Depois, **redeploy** da função (editar o `.ts` no repo não redeploya sozinho — o workflow atual só publica o Pages).

---

## Achados de alto risco

### 5. Autorização é só `style.display='none'`
`index.html:10540-10542` esconde itens de menu por perfil, mas `showPage()` (`:21493`) não tem nenhuma checagem de perfil e todas as páginas já estão no DOM (`:1742-1890`). O controle fino (`getPermissao`/`podeEditar`/`temAcesso`, `:22032-22040`) faz regex no nome da função do `onclick` (`:22069`) — o próprio comentário no código admite ser "rede de segurança por convenção, não auditoria". Sem servidor de autorização (itens 1-3), o front não consegue autorizar a si mesmo. Manter o esconde-botão como UX é ok; tratá-lo como segurança, não.

### 6. XSS armazenado — 634 `innerHTML` para 50 `escapeHtml`
`escapeHtml()` existe (`index.html:8246`) mas é pouco usada. `gerot.html` tem 24 `innerHTML` e **0** escapes. Ponto positivo real: **zero** `eval`/`new Function`/`outerHTML`. Os ~10 pontos que renderizam **texto livre de um usuário na tela de outro** (prioridade): `:20549`, `:20548`, `:16013`, `:18170`, `:18238`, `:18343`, `:17686`, `:18175`, `:18241`, `:18300`, `:9620` (este entra pelo endpoint do ERP), e nas tabelas de cadastro `:13046/13070/13406/13505`, `:15773` (dentro de `title="..."`), e `<option value="${nome}">` em `:13196/15306/15680/16157`. Encadeado com o item 1, um `POST` anônimo em `ocorrencias` planta payload que executa no navegador do próximo admin. **Conserto:** aplicar `escapeHtml()` (já importada) nesses ~10 pontos — diff mecânico, sem regressão. Os outros ~580 são números/datas/labels internos, não vale varredura cega.

---

## Achados médios / baixos

- **7. Primeiro acesso por CPF** (`index.html:13681`): a "senha" é o CPF digitado duas vezes — compara dois campos do próprio formulário, não consulta o banco. Já foi endurecido (`:13713`, `:13736` barram quem já se cadastrou), então a janela é só o primeiro acesso — mas para 59 motoristas + 88 ajudantes é larga. **Conserto:** exigir 2º fator que não esteja no crachá (data de nascimento, já lida em `:13707`).
- **8. Senha padrão `destak123` hardcoded** na importação em massa (`index.html:22957`, `:22964`). Com o item 1, vira lista de contas prontas. **Conserto:** aleatória + troca no 1º login.
- **9. `gerot.html` sem autenticação nenhuma** — só a `SUPA_KEY` (`:450`), nenhum `login`/`usuario_logado`/`auth`. Painel de indicadores operacionais/financeiros aberto por URL direta no GitHub Pages. **Conserto:** checar `usuario_logado` no topo e redirecionar (fecha a exposição casual, que é o risco realista).
- **10. `SENHA_PADRAO` indefinida** (`index.html:13985/13995/14006/14009`) — não existe declaração da constante em lugar nenhum → `ReferenceError` no `try` de `fazerCadastro()`. Não é bug de segurança, é **funcional**: o auto-cadastro de motorista/ajudante está quebrado e provavelmente parece "erro de rede".
- **11. Filtros PostgREST sem `encodeURIComponent`** em alguns pontos (`:13359`, `:20737`) — a maioria do código encoda certo; estes não. Não é SQL injection; impacto baixo perto do item 1.

## O que checamos e está OK (não mexa)
- `.github/workflows/deploy-pages.yml` — permissões mínimas, actions oficiais pinadas, sem `pull_request_target`, sem segredo. Acima da média.
- `.claude/settings.json` — 12 permissões, todas read-only. Nenhum auto-approve destrutivo.
- Chave `anon` no HTML — **correto por design**. O problema nunca foi a chave; foi a ausência de RLS atrás dela. Não gaste tempo tentando "escondê-la".
- `service_role` só na Edge Function via `Deno.env.get` — correto. (O problema do item 4 é o *fallback*, não o manejo da service_role.)

---

## Plano de conserto (ordem por risco removido ÷ esforço)

1. **Hoje, ~5 min, sem tocar no app (dono):** rotacionar `ERP_API_KEY` + fail-fast no fallback + redeploy da função (item 4). Fecha uma porta de `service_role` literalmente publicada.
2. **Hoje, uma migration (dono):** `REVOKE DELETE, UPDATE ON usuarios, motoristas, ajudantes, conferentes FROM anon` (item 1). Corta "apagar a base"/"virar admin" sem quebrar leitura. Testar login logo depois (fallback de `ajudantes`).
3. **Esta semana (código, seguro):** os ~10 `escapeHtml()` do item 6 + esconder `gerot.html` atrás de `usuario_logado` (item 9). Diff mecânico.
4. **Projeto de verdade (coordenado, banco + código):** Supabase Auth + RLS. Único conserto para os itens 1, 2, 3 e 5. Até ele existir, **trate o app como se não tivesse controle de acesso** — porque, hoje, não tem.

Rafael tem um pacote pronto (SQL + diff de login) para o passo 4, desenhado para não brickar o app. É só pedir a ele.

---

## Em andamento
A auditoria de **bugs/corretude, performance e cálculo de indicadores (OTIF, "Carregamento no Prazo", absenteísmo)** está rodando em paralelo e será anexada aqui quando fechar. O último `fix(painel-indicadores)` sobre "Carregamento no Prazo ignorava a maioria das cargas" sugere que os indicadores merecem atenção — estamos verificando a matemática.

*Dúvidas ou quer o pacote de conserto? Fala com o Rafael.*
