# Pacote de Conferência — Correções de Segurança (PR #430)

## Pedido original (do usuário, verbatim)
> "pode fazer as correções / coloque um agente validando se está correto / está em andamento ?"

Contexto: o usuário havia pedido antes uma análise de segurança completa (5 agentes: segurança geral, perda de dados, roubo/tomada de controle, caça a vulnerabilidades, validador). A análise apontou vários achados. O usuário então pediu para corrigir os achados e validar com agente(s) independente(s).

## Requisitos verificáveis (derivados dos achados da auditoria anterior)

- **R1** — Bucket de Storage `notas-fiscais`: `anon` não pode mais fazer DELETE de arquivos (policy `allow_all_deletes` removida). Leitura e upload continuam funcionando (não podem ter sido quebrados).
- **R2** — Bucket de Storage `checklist-alho-fotos`: mesma coisa (policy `allow_all_deletes_checklist_alho_fotos` removida), leitura/upload intactos.
- **R3** — Tabela `login_tentativas_falhas`: `anon`/`authenticated` não têm mais nenhum privilégio direto (SELECT/INSERT/UPDATE/DELETE). O rate-limit de login (5 tentativas/15min, via RPC `verificar_login`, que é `SECURITY DEFINER`) continua funcionando.
- **R4** — Tabela `demandas_rota_log_criacao`: `anon`/`authenticated` não têm mais nenhum privilégio direto. O trigger `log_criacao_demandas_rota` foi alterado para `SECURITY DEFINER` e continua gravando o log automaticamente quando uma linha é inserida em `demandas_rota` (mesmo como `anon`).
- **R5** — Edge Function `emb-api`, ação `reservar`: agora exige o header `x-emb-key` batendo com o secret `EMB_ACCESS_KEY` (mesmo padrão da função irmã `pedidos-embalagem`). Sem a chave certa, retorna 401. As ações `estado`/`dados` continuam públicas (leitura, sem risco). A ação `limpar` continua exigindo `x-admin-key`/`EMB_ADMIN_KEY` (já corrigido antes, não mexido agora).
- **R6** — Edge Function `pedidos-embalagem-admin`: os campos `loja`, `codigo`, `descricao`, `undf` (vindos de `emb_estado`/`emb_resumo_lojas`) agora passam por um helper `esc()` (escape de `&<>"'`) antes de entrar no `innerHTML` do painel. A função continua renderizando a tabela/cards normalmente com dados reais.
- **R7** — `supabase/functions/emb-api/index.ts` e `supabase/functions/pedidos-embalagem/index.ts` agora existem no repositório git (antes só existiam deployadas no Supabase, fora de controle de versão). O conteúdo commitado deve bater com o que está deployado em produção (mesma lógica, mesmas chaves de proteção).
- **R8** — `index.html`: 7 pontos de XSS armazenado corrigidos —
  1. Autocomplete de motorista na Expedição (`filtrarOpcoesMotorista`) — nome do motorista escapado no texto exibido e no argumento do `onclick`.
  2. Autocomplete de veículo na Expedição (`filtrarOpcoesVeiculo`) — placa/tipo escapados.
  3. Popup "Pendentes — Armazém/Distribuição" — nome escapado no texto e no `onclick`.
  4. Lista "pendentes hoje" do Absenteísmo — nome escapado no texto, `title` e `onclick`.
  5. Botão "+ Lançar" do dashboard de produtividade (`c.rota`) — escapado.
  6. Botão remover rota no Cadastro (`cadRemoverRota`) — nome da rota escapado no `onclick`.
  7. Autocomplete de ajudante (`escolherAjudante`) — nome escapado no texto e no `onclick`.
  Todos usam o novo helper `_jsAttrStr()` para o argumento do `onclick` (não basta `escapeHtml()` sozinho ali — ver nota técnica abaixo) e `escapeHtml()` para o texto exibido.
- **R9** — `index.html`: `exportarDespesasXLSX()` e `exportarReceitasXLSX()` agora passam os campos `Fornecedor` e `Observação` pelo novo helper `sanitizeCsvCell()` (prefixa com `'` se o valor começar com `=`, `+`, `-`, `@`, TAB ou CR).
- **R10** — `index.html` continua sintaticamente válido: todos os blocos `<script>` parseiam sem erro (`new Function`), e a contagem de `<div>` abertas bate com `</div>` fechadas.
- **R11** — `APP_VERSION` (index.html) e `version.json` foram incrementados juntos para `4.86.0`.
- **R12** — Nada disso afetou a produção (branch `main`/GitHub Pages) ainda — está tudo na branch `claude/correcoes-seguranca`, PR #430 ainda **draft**, não mergeado.

## Nota técnica importante para o auditor (não assumir, verificar)
`escapeHtml()` converte `'` em `&#39;`. Dentro de um atributo `onclick="fn('...')"`, o navegador **decodifica entidades HTML do valor do atributo antes de compilar esse valor como código JS** (é assim que qualquer atributo HTML funciona, `onclick` incluso) — ou seja, `&#39;` vira `'` de novo bem a tempo de fechar o literal JS e injetar código. Por isso foi criado `_jsAttrStr()`, que escapa primeiro para o literal JS (barra invertida, aspa simples) e só depois para a moldura do atributo HTML (aspa dupla, `<`, `>`). **Peço que o validador confirme ou refute essa lógica de fato — não aceitar minha explicação sem checar.**

## Entregável
- Branch de código: `/home/user/destak-produtividade` (git branch `claude/correcoes-seguranca`, commit `4bfe930`)
- PR: https://github.com/tropaupam-eng/destak-produtividade/pull/430 (draft)
- Edge Functions já deployadas em produção no projeto Supabase `hiydkyslgiomdyginfdx`: `emb-api` (version 4), `pedidos-embalagem-admin` (version 4)
- Mudanças de permissão já aplicadas direto no banco Supabase `hiydkyslgiomdyginfdx` (não é migration versionada — foi feito via SQL direto nesta sessão)

## Fontes
- Código antes da mudança: `git show origin/main:index.html`, `git show origin/main:supabase/functions/pedidos-embalagem-admin/index.ts` (ou `git diff origin/main..claude/correcoes-seguranca` para ver exatamente o que mudou)
- Estado do banco Supabase: acessível via MCP `mcp__Supabase__execute_sql` (mesmo projeto, `hiydkyslgiomdyginfdx`)
- Relatório original da auditoria de segurança: está só na conversa desta sessão, não em arquivo — o pacote acima já resume os achados relevantes a cada requisito.

## Endereço do sistema
- App em produção: `https://tropaupam-eng.github.io/destak-produtividade/` (GitHub Pages, branch `main` — **não deve ter mudado**, já que o PR não foi mergeado)
- Repo: `tropaupam-eng/destak-produtividade`
- Supabase: projeto `hiydkyslgiomdyginfdx`
