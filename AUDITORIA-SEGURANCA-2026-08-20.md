# 🔒 Auditoria de Segurança e Qualidade — Destak Produtividade (Cronos)

> **Para:** a IA / dev responsável por este repositório (tropaupam-eng)
> **De:** Claude, a pedido do Rafael (colaborador deste repo)
> **Data:** 2026-08-20
> **Método:** 5 agentes independentes (segurança, dados/banco, corretude, performance, arquitetura) lendo o código. Sondas contra a API de produção foram **não-destrutivas** (contagens e filtros que casam zero linhas). Nenhuma PII foi lida, nada foi escrito, nada foi apagado.
> **Status:** revisão concluída. Correções **NÃO** aplicadas — este documento é um aviso, não uma mudança.
> **Índice:** Parte 1 = Segurança (abaixo). **Parte 2 = Corretude, Dados, Performance e Deploy** (no fim do arquivo) — inclui os bugs de dinheiro e a queda de produção que já aconteceu.

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

---

# Parte 2 — Corretude, Dados, Performance e Deploy

> Consolidado de 4 agentes (dados/banco, corretude, performance, arquitetura), **deduplicado**. `✔✔` = achado encontrado por **dois** agentes independentes por caminhos diferentes (confiança alta). Tudo com `arquivo:linha`. Os itens de código são no `index.html`/`gerot.html` e **podem ser corrigidos por push** (o Rafael tem acesso); os de banco precisam de você/dono.

## 🔴 Conserta primeiro — dinheiro saindo errado e perda de dados

**Q1 — Perda de dados em produção: `DELETE base_data` + `INSERT` sem transação, em loop de 5s** `✔✔`
`index.html:9839-9844` (delete/insert), timer `:9853`. `pushBaseData` tem 3 saídas **sem lançar exceção** depois do DELETE já ter rodado: `>50000` linhas (`:9271`), sem permissão (`:9277`), validação que descarta silenciosamente (`:9291`). Cenários reais: **logout com a aba aberta** (o `logout()` não para o timer), **usuário sem permissão reabrindo a página** (`showPage` não checa perfil e `:37766` restaura a última página do `localStorage`), e **reentrância** (lote >5s). Some pedido de produção e só sai `console.warn`. **Fix:** trocar DELETE+INSERT por **upsert `on_conflict=pedido`** + flag de reentrância + `pararMonitorIntegracaoERP()` no `logout()`.

**Q2 — Carga 100% devolvida paga integral:** `const qtd = pedidosSemOcorr.size || pedidos.size`
`index.html:36301, 36368, 12920, 17193` (4 cópias). `Set` vazio é *truthy* — mas `size===0` é justamente "pagar zero". Carga de 80 pedidos toda com ocorrência → paga 80. **Quanto pior a entrega, mais paga.** **Fix:** checar `.size===0` explícito (~4 linhas).

**Q3 — Pagamento duplicado:** `await supaFetch(...) || await supaFetch(...)` em `confirmarPagamento`
`index.html:13426`. GET sempre volta array; `[]` é *truthy* → a 2ª checagem nunca roda. `marcarPagamento` grava sem `ajudante_id` → os dois caminhos geram **duas linhas de R$X** para o mesmo ajudante/mês, sem trava. **Fix:** trocar `||` por checar `.length`.

**Q4 — Rota externa (R.E.) paga R$ 0: o formulário mostra "R.E." e grava "R.I."**
`index.html:11955, 11972, 11939-11940`. `rire` é fixo `'R.I.'` no lançamento, mesmo quando a tela exibe R.E. No cálculo (`:20716`), `isRE=false` → bônus de KM não conta e `getValorRota` não acha a rota → **R$ 0,00**, sem erro. Ainda contamina o `base_data` marcando os pedidos como R.I. **Fix:** derivar `rire` da rota real.

**Q5 — Classificação R.I./R.E. quebra por normalização inconsistente**
`ROTAS_RI` (`index.html:10667`) é alimentado com `.toUpperCase()` cru (mantém acento) em `:10416/10442/25838`, mas os consumidores (`_computeOtifStats:25675`, `getValorRota:13161`) usam `normalizarRota()` (sem acento). "SIMÕES FILHOS" não casa → cobra prazo de 192h em vez de 24h e paga `motSem:0`. Agravante: `syncConfig` está num `try/catch` que só faz `console.warn` (`:10446`) → erro de rede no boot deixa **todas as rotas classificadas como R.E. pela sessão inteira**. **Fix:** `normalizarRota()` como chave única.

**Q6 — `limparDatasEntrega()` apaga o mês de OTIF a um clique, sem confirmação/log/undo**
`index.html:24519` (botões `:2953`, `:8181`). Apaga `entrega_datas` do mês inteiro + as `data_saida` propagadas + as `data_entrega` que o ERP mandou. É o **único** botão destrutivo do app sem `confirm()`. **Fix:** 1 linha de `confirm()`.

## 🔴 Indicadores podem estar mentindo — refaça os números antes de decidir

**Q7 — O "fix" do último commit (`8fda19f`) provavelmente mede um limite técnico, não o armazém**
`index.html:28113`: a query em `conferencia_pedidos` (que tem **1 linha por pedido**) tem `limit=5000` e `order=carga.asc` → as **cargas de número mais alto (as mais recentes do mês)** voltam vazias e são contadas como "fora do prazo" (`:28130`). O ~30% reportado no commit é aritmeticamente compatível com **truncamento**, não com a operação. Ainda: conta **cargas canceladas e em formação** (sem filtro de status, `:28104`) e compara **data UTC × local** (`:28131`). **Confirmar:** `GET conferencia_pedidos?...&select=carga` com `Prefer: count=exact` e comparar o `Content-Range` com 5000.

**Q8 — Bug de fuso é sistêmico — a causa-raiz de ~30 `fix(otif)`** `✔✔`
**71 lugares** usam `new Date().toISOString().slice(0,10)` (UTC); **só 1 função** usa o fuso de Brasília certo. Depois das 21h BRT, "hoje" vira amanhã → o dia inteiro de trabalho fica invisível; saída confirmada à noite vira "atraso fantasma". Atinge indicadores 03/04 (`:28014, :28131`), OTIF Diário (`:26886`), data de lançamento do admin (`:11947`), `_inicioPrazoRI` (`:25621` mistura os dois fusos no mesmo `if`). **Fix de raiz:** promover um helper único `hojeBRT()`/`parseDataBRT()` (o `_mesAnoLocal:8969` já faz certo, com comentário). Mata a família toda de `fix(otif)`.

**Q9 — Indicador 03 (Liberação no Prazo) exclui do denominador as cargas que nunca saíram**
`index.html:28007` (`ts_saiu=not.is.null`). É o **mesmo bug** que o commit `8fda19f` corrigiu no indicador 04 — não foi propagado ao irmão que fica 80 linhas acima. 60/70 = 85,7% vs 60/78 = 76,9% (meta 90%) decide se a área "cumpriu".

**Q10 — Denominadores frágeis em vários indicadores**
- **Absenteísmo** (`:29026, :32937`): denominador só conta dias **digitados**; motorista ganha `rota_auto` automático e ajudante/conferente não → assimetria; mês sem lançamento vira `"0,00% — DENTRO DA META"`.
- **Queries de indicador sem `limit`** sobre tabelas 1-linha/pedido → truncam em 1000 (`:32883, :33812, :35313, :27989, :41823`).
- **Filtro de unidade "vaza"** (`:28040`): agendamento sem carga digitada passa incondicionalmente pelo filtro.

## 🟠 O banco pode divergir do código — rode os SELECTs de confirmação

**Q11 — Migration `20260724` (FK sobre `base_data.carga`) é impossível de aplicar**
`base_data.carga` **não é única** (1 linha por pedido) → a FK do STEP 2 falha. Provavelmente parou no meio. **Sorte que falhou:** se tivesse passado, o `ON DELETE CASCADE` transformaria os vários `DELETE base_data?pedido=in(...)` do app em apagador de `lancamentos`/`demandas_rota` inteiras. **Confirmar:** `SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_%base_data';`. Bônus: `buscar_carga()` está `IMMUTABLE` lendo tabelas (deveria ser `STABLE`) e não tem consumidor.

**Q12 — Trigger de transição de status não conhece `formacao` (o estado inicial do app)**
Migration `20260625_validar_transicao`. O app usa `formacao` e auto-avança (`:8705`), mas `_patchStatusDemanda` devolve `{ok:false}` **sem lançar** e o chamador ignora dentro de `catch(e){}` vazio. 8 transições divergem (incluindo reabrir carga concluída, que é feature em produção). Ou o trigger existe e **trava cargas em silêncio**, ou não existe e a "2ª camada" é ficção. **Confirmar:** `SELECT tgname FROM pg_trigger WHERE tgrelid='demandas_rota'::regclass;`.

**Q13 — Migration de log do ERP (`erp_historico`) é morta e perigosa**
Migration `20260731`. **Nada escreve** em `erp_historico` (nem app nem edge function) → o painel "Histórico" fica vazio pra sempre e `erp_resumo_diario` nunca é preenchida. O `INTEGRACAO_ERP_DATA_ENTREGA.md` afirma que grava lá — é **falso**. Pior: `erp_historico.pedido_id REFERENCES base_data_erp_teste ON DELETE CASCADE`, e o app faz `DELETE base_data_erp_teste?id=gte.0` a cada teste (`:9541, :9875`) → cada teste apagaria a própria trilha. **Decidir:** implementar os writers ou **deletar** as migrations mortas (manter migration que não corresponde ao banco é pior que não ter).

## ⚡ Performance — ~20 linhas devolvem ~11s do login (medido, não estimado)

> Premissa corrigida: com gzip do GitHub Pages são **582 KB no fio**, não 2,69 MB. Zero base64. O tamanho do arquivo **não** é o gargalo — a sincronização em série é.

- **P1 — Login é uma fila de 16 requisições em série = 11,5s medidos.** As 11 primeiras são independentes → `Promise.all` → **3,2s**. `index.html:37789`. ~10 linhas, −8s.
- **P2 — Todo login baixa a `base_data` inteira** (9.211 linhas / 4,13 MB, os 4 meses). A função já aceita filtro. `syncBaseData(mesAtual)` no `:37806` → −81%. **1 linha.**
- **P3 — Cache offline nunca existiu:** `localStorage.setItem` estoura a cota (6,61 MB UTF-16 > 5 MB) e falha em `catch(e){}` vazio (`:9251`). P2 resolve; ou logar o erro em vez de mentir.
- **P4 — 4 scripts de CDN bloqueantes no `<head>` sem `defer`** (`:11-14`); 238 KB (xlsx+html2canvas) que o motorista **nunca usa**; sem guard `typeof` → **cdnjs cair = página branca**. `defer` + lazy-load + `preconnect`.
- **P5 — Subir a versão desloga todo mundo:** `localStorage.clear()` leva o `usuario_logado` (`:8232`). Cada `git push` na `main` derruba a sessão do motorista no meio da rota. **1 linha** (preservar o user).
- **P6 — 21 gráficos em modo claro no tema escuro** — contraste **1,74:1**. `isDark` é sempre `false` (lê atributo que o app não usa). `:25470/26361/26464`. 3 linhas.
- **P7 — `--text-muted` reprova WCAG (2,98:1)** — token dos cabeçalhos de tabela. Alpha `.35`→`.55` (`:81`). **1 caractere.**
- **P8 — Toque/legibilidade:** ~45 botões ~22px, ~938 textos <12px, **0** de 385 inputs com label, **0** `aria-label`, 114 botões só-emoji. Contido por `@media (pointer:coarse)`.
- **P9 — Polling 5s** (`:9856`) → 20s; `select=*` sem `limit` em ~10 varreduras → `&limit=5000` preventivo; N+1 em `admConferirTudo` (`:36017`) → POST em lote.

## 🛡️ Deploy — 14 linhas que teriam evitado uma queda TOTAL já ocorrida

**D1 — O deploy não tem nenhuma verificação, e já matou a produção.**
Commit `7005a8f` (30/06 09:03): o `index.html` virou **11 bytes** contendo "placeholder" (acidente de aspas no shell) e **foi pro ar** → ~5 min de app morto pra todos, restaurado por `c6da5f4`. Único incidente >40% em 1.026 commits, mas o custo é 100% de indisponibilidade. **Fix (testado contra o commit real, bloqueia):** um `check.js` de ~12 linhas (tamanho mínimo do arquivo **+** `new vm.Script()` em cada bloco inline) + 1 step no workflow antes do `configure-pages`. Custa 0,43s num deploy de 21s. **Precisa das DUAS checagens:** tamanho pega o `placeholder` (11 bytes é HTML válido sem `<script>`), sintaxe pega o erro de JS. Rollback já é bom (revert ou re-run = 21s) — **não** crie staging.

## 🧹 Manutenção (barato, opcional)
- **OTIF calculado em 3 lugares** (`:25632, :24873, :26879`); o mesmo bug já foi corrigido 2× (`#285`→`#288` no mesmo dia). Promover `_semInFullOtif` (`:24919`) a função global e trocar as 2 reimplementações por chamadas (~20 linhas). `✔✔`
- **`formatarMesAno` declarada 2×** (`:12406` é inalcançável por hoisting, `:36203` vence). Deletar `:12406-12411` (−6 linhas) — hoje é uma sessão de debug perdida esperando acontecer.
- **48 lançamentos de maio hardcoded** (`:37113-37131`) reescrevem o `localStorage` a cada load; a guarda `_manual` é **código morto** (a flag nunca é escrita). Deletar (−19). `✔✔`
- **`remover(carga)` (`:12034`) não apaga do Supabase** → o lançamento volta no próximo `syncLancamentos`. Falta o `DELETE`.
- **`CLAUDE.md` desatualizado:** diz "único arquivo ~21.000 linhas" (são **44.756** + existe o `gerot.html`); ~43 tabelas em uso **não** estão documentadas (metade do sistema).
- **1.504 linhas de código morto**; vale deletar as 6 funções grandes (612 linhas) que enganam quem lê.

## O que os agentes inocentaram (não gaste tempo aqui)
- **`supaFetch` está bom** (checa `res.ok`, timeout de 35s, retry) — o problema são os `.catch` vazios de quem chama.
- Sem base64, sem `innerHTML +=` em loop, `viewport` ok, larguras fixas **todas** dentro de `overflow-x:auto`, pollings quase todos com trava.
- **`gerot.html` NÃO é órfão nem duplicata** (iframe em `:3510`, ~20 linhas repetidas justificadas); só a documentação está errada.
- Rollback já é rápido (21s via revert ou re-run) — staging seria caro para 1-em-1.026.
- Chaves de `localStorage` todas dentro do permitido pelo `CLAUDE.md`.

## Prioridade consolidada (por retorno ÷ esforço)
1. **D1** — guard de deploy (14 linhas, previne queda total). *Código, pode subir.*
2. **Q1** — perda de dados (upsert + trava). *Código.*
3. **Q2/Q3/Q4** — dinheiro errado (fixes de 1–4 linhas). *Código.*
4. **Q6** — `confirm()` no `limparDatasEntrega`. *Código.*
5. **Q7** — refazer o número do indicador 04 antes de virar decisão de gestão.
6. **Q8** — helper de fuso único (mata ~30 `fix(otif)`). *Código.*
7. **P1/P2/P5** — performance (~15 linhas: −11s no login e ninguém mais desloga no deploy). *Código.*
8. **Q11/Q12/Q13** — rodar os 3 SELECTs de confirmação no banco. *Dono.*
9. **Segurança (Parte 1)** — Auth + RLS, projeto coordenado banco+código. *Dono + código.*

---
*Dúvidas, o pacote de conserto pronto (SQL + diffs), ou ajuda para aplicar? Fala com o Rafael.*
