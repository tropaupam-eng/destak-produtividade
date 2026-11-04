# 🔒 Auditoria de Segurança — Destak Produtividade (Cronos) — 2026-10-27

> **Para:** quem for decidir o que corrigir primeiro
> **De:** Claude, a pedido do usuário ("faça uma auditoria completa de todas as vulnerabilidades de segurança que temos")
> **Método:** 5 agentes independentes (RLS/autenticação/secrets, XSS/injeção, controle de acesso/autorização, dependências/deploy/CI, dados/dinheiro/lógica de negócio), cada um lendo o código em `origin/main` fresco (commit `33a6650`) e consultando o Supabase (`hiydkyslgiomdyginfdx`) só em leitura (SQL de contagem/estrutura, advisors, migrations). **Nenhum arquivo foi alterado, nenhum dado foi escrito/apagado no banco** — esta é uma auditoria, não uma correção.
> **Ponto de partida:** a auditoria anterior, [`AUDITORIA-SEGURANCA-2026-08-20.md`](AUDITORIA-SEGURANCA-2026-08-20.md) (20/08/2026). Cada achado abaixo diz explicitamente se é "ainda aberto", "corrigido" ou "novo desde agosto".

---

## Resumo executivo

Em ~2 meses (muito desenvolvimento: reorganização de Cadastros, sistema de perfis customizados, Painel de Indicadores, e dezenas de commits de um colaborador, "Gabriel", direto em `main`) **houve progresso real**: senha não é mais texto puro comparado no navegador, a chave do ERP foi corrigida e o padrão se espalhou pra outras 10 Edge Functions, vários bugs de dinheiro antigos continuam corrigidos (e as lições foram aplicadas certo no código novo), e a proporção de XSS melhorou bastante.

Mas o **problema estrutural central continua exatamente igual**: **o banco não tem controle de acesso nenhum** — a chave pública (`anon`, já está no HTML do site) ainda lê, escreve e apaga qualquer tabela, sem login. E há uma descoberta nova e grave: **alguém já tentou ligar essa proteção (RLS) duas vezes em produção, e as duas vezes os dados "zeraram" e precisou reverter de emergência**, sem nunca documentar por quê. Enquanto isso não for resolvido, qualquer outra correção de segurança é uma camada fina em cima de uma porta aberta.

### As 3 coisas mais importantes, nessa ordem

1. **Investigar por que o RLS quebrou duas vezes (15/09 e 18/09) antes de tentar de novo.** Hoje não há registro da causa raiz em lugar nenhum. Religar sem entender isso tem boa chance de derrubar a produção pela 3ª vez.
2. **Travar a escrita anônima em `configuracoes`** (`REVOKE INSERT, UPDATE ON configuracoes FROM anon`, testando o login depois) — fecha o vetor mais barato e mais novo de escalação de privilégio sem esperar o projeto de autenticação inteiro terminar.
3. **Confirmar se existe "Require pull request before merging" ligado em `main`** — Gabriel tem acesso de escrita e empurrou direto pra `main` em 23 dos últimos 24 commits (30 dias), sem review. A API não deixou eu confirmar isso — só quem tem acesso às configurações do repositório no GitHub consegue checar.

---

## 🔴 CRÍTICO — ainda explorável hoje

### 1. RLS desligado em ~110 tabelas de negócio — igual a agosto, mas já tentaram ligar 2x e quebrou

Confirmado agora: de ~115 tabelas, só 2 têm RLS ligado (`clientes_vendedor`, com uma política totalmente aberta que não protege nada; e uma tabela de backup inerte). Todo o resto — `usuarios`, `motoristas`, `lancamentos`, `base_data`, `configuracoes`, `pagamentos`, etc. — continua com `anon` lendo/escrevendo/apagando livre, exatamente como em agosto.

**O que é novo:** o histórico de migrations do Supabase (aplicadas direto no projeto, nunca commitadas no repo) mostra **duas tentativas reais** de ligar RLS:
- `20260915144516_batch1_rls_somente_autenticado` → revertida 1h depois: `20260915145721_rollback_batch1_rls_emergencia`
- `20260918144344_reativa_rls_batch1_com_excecoes_pre_login` → revertida no mesmo dia: `20260918144720_reverte_emergencial_rls_dados_zerados`, com a nota: *"usuário reportou 'todos os dados estão zerados' logo após a reativação do RLS... mesmo padrão do incidente de 2026-09-15"*.

A causa raiz **não está documentada** em nenhuma migration nem no código. Existem **86 políticas de RLS já escritas e prontas** (`somente_autenticado`, `anon_self_cadastro_insert`, etc.) — mas como RLS está desligado nas tabelas, o Postgres as ignora completamente. Isso cria uma armadilha: quem olhar `pg_policies` rapidamente pode achar que "já tem proteção" quando não tem nenhuma.

**Ressalva importante para quando for tentar de novo:** as 86 políticas atuais são todas `role=authenticated, ALL, qual=true` — ou seja, **não diferenciam por perfil**. Religar do jeito que está hoje resolve "anônimo da internet lê tudo", mas **não resolve** "um ajudante comum lê/edita a folha de pagamento inteira" — qualquer login real continuaria com acesso total a tudo. O desenho das políticas precisa de revisão antes da 3ª tentativa, não só reativar.

**Mitigação imediata que não depende de terminar o projeto de Auth:** `REVOKE DELETE, UPDATE ON usuarios, motoristas, ajudantes, conferentes FROM anon` (mesma recomendação de agosto, ainda válida e ainda não aplicada).

### 2. Escalação de privilégio via sistema de perfil customizado — confirmado funcional

Esta sessão usou hoje mesmo a tela "Cadastro > Perfis" (via SQL direto, não pela UI) pra dar a 3 usuários acesso a uma página nova. Um dos agentes confirmou que **a mesma coisa é possível para qualquer pessoa, sem nunca logar**:

1. `POST` anônimo em `configuracoes` criando uma linha `perfil_custom_<qualquer_coisa>` com `paginas`/`permissoes` cobrindo qualquer página do sistema (inclusive `cadastros`, `banco-dados`, `financeiro` — a própria tela já oferece esses checkboxes).
2. `PATCH` anônimo em `usuarios?id=eq.<qualquer_id>` trocando o `perfil` dessa pessoa pra essa chave nova.
3. No próximo login (ou simplesmente editando `localStorage.usuario_logado.perfil` no console do navegador, sem precisar nem do passo 1), o app aceita sem revalidar nada no servidor.

Nada no banco nem no app impede nenhum dos passos — `configuracoes` está tão aberta quanto qualquer outra tabela (achado #1). **Importante: esse vetor é "redundante"** no sentido de que o mesmo buraco de RLS já dá controle total sobre `usuarios` direto, sem precisar criar perfil nenhum — mas ele é mais disfarçado (a conta parece normal, sobrevive a reload, não precisa mexer no console a cada sessão).

Não existe nenhuma trilha de auditoria: `configuracoes` e `usuarios` não têm coluna de "quem alterou" — uma troca de perfil feita por um admin legítimo, pela UI, é indistinguível de uma troca feita por um ataque.

### 3. `showPage()` sem nenhuma checagem de perfil — causa raiz que amplifica os itens 1 e 2

Confirmado de novo (era o achado #5 de agosto, mudou só o número da linha): a função que troca de página no app **não verifica em nenhum momento** se o perfil logado tem acesso àquela página. Esconder item de menu é só visual. Qualquer usuário logado, de qualquer perfil, abre o console do navegador e digita `showPage('financeiro')` ou `showPage('cadastros')` ou `showPage('banco-dados')` — a página abre e funciona normalmente, mesmo que o perfil dele nunca tivesse essa página na lista.

Esse é o motivo pelo qual, mesmo sem escalar perfil nenhum (achado #2), **qualquer funcionário logado já consegue entrar em qualquer tela do sistema hoje**, só não aparece no menu.

O controle mais fino (`podeEditar`/`temAcesso`, que decidiria "só leitura" vs "edição") também não é chamado em lugar nenhum do app além da própria definição — o enforcement real é um "escutador" genérico que reconhece o nome da função chamada num `onclick` por uma lista de ~45 verbos conhecidos. Funciona para cliques normais na tela, mas **não pega nada feito direto no console ou via API** — nem precisa pegar, porque sem RLS a API já está aberta de qualquer jeito.

---

## 🟠 ALTO

### 4. XSS — 6 pontos novos sem escape, um deles alcançável sem login nenhum

A proporção geral melhorou bastante desde agosto (de ~12,7 `innerHTML` pra cada `escapeHtml` → ~3,3:1 hoje), e o código novo quase sempre vem com escape — o problema não é falta de disciplina, é esquecimento quando um campo de nome é **copiado pra uma segunda tabela** e lido de novo numa tela secundária.

O mais grave: o **nome do ajudante** — campo 100% texto livre, vindo de um formulário de auto-cadastro **público, sem login nenhum** — aparece sem escape em 3 lugares, incluindo um widget ("⚠️ Cargas Sem Motorista Definido") que **renderiza automaticamente** toda vez que um admin abre a aba Lançamento, sem precisar clicar em nada. Outros achados: `desativado_por` sem escape em 2 cadastros, nome de conferente no quadro de Armazém, campos de divergência de expedição renderizados automaticamente no próprio portal do motorista afetado.

Lado bom: os ~10 pontos que a auditoria de agosto tinha marcado como prioritários (tela de Ocorrências, tabelas de cadastro, `gerot.html` sem login) **foram corrigidos de verdade** — inclusive a feature nova do Gabriel (editar ocorrência) já nasceu escapando tudo certo.

### 5. Push direto em `main`, sem PR nem review

`Gabriel26armzn` tem papel de colaborador com permissão de escrita (`write`) no repositório, e 23 dos 24 commits dele nos últimos 30 dias foram push direto em `main` (só 1 passou por PR). Em um dia só (26/10) foram 6 pushes diretos; em outro (23/10), 8. Cada push aciona o deploy automático — se passar a checagem de sintaxe (`check.js`), vai pro ar sem nenhum humano revisar. Não consegui confirmar via API se existe "Require pull request before merging" configurado em `main` (a API retornou 403 pra essa consulta específica) — só quem tem acesso às configurações do GitHub consegue confirmar isso.

### 6. Risco de pagamento duplicado em `marcarPagamento` — mesma classe do bug antigo (Q3), função diferente

A correção de agosto (Q3) foi só em `confirmarPagamento`. Existe uma segunda função de pagamento, `marcarPagamento` (`index.html:45933`), que decide se grava um pagamento novo ou atualiza um existente olhando só o cache em memória da tela, sem reconferir no banco antes — e a tabela `pagamentos` não tem nenhuma trava (`UNIQUE`) que impeça duas linhas pro mesmo nome/mês. Hoje o impacto real é baixo (só 1 linha na tabela — a função mal começou a ser usada pra valer), mas vale corrigir antes que vire o fluxo principal de pagamento. A correção é simples: espelhar o padrão que `confirmarPagamento` já usa (conferir de novo no banco antes de decidir INSERT ou PATCH).

---

## 🟡 MÉDIO

### 7. SheetJS/xlsx na versão 0.18.5 — provavelmente numa faixa com vulnerabilidade conhecida

Mesma versão de agosto, nunca atualizada. Pelo conhecimento do agente (confiança média-alta, não 100%): SheetJS teve uma advisory de *prototype pollution* corrigida na 0.19.3 e uma de ReDoS corrigida depois disso — 0.18.5 é anterior às duas. Mitigante parcial: só processa planilhas que o próprio usuário sobe, não é input de rede não confiável. Recomendo atualizar para ≥0.20.x e confirmar contra uma base de CVE atualizada antes de decidir a urgência exata.

### 8. Bug de fuso horário — nível de MÊS, nunca coberto pela correção de agosto

A correção de agosto resolveu o nível de *dia* (de 71 pontos problemáticos pra 8, e os 8 que sobraram já são defensivos). Mas existe a mesma falha no nível de *mês* (`new Date().toISOString().slice(0,7)`, que pega o mês em UTC em vez do horário de Brasília) em **~70 lugares**, incluindo a função nova de cálculo de ganhos do ajudante. Na prática: no último dia de qualquer mês, entre 21h e 23h59 (horário de Brasília), o sistema já está "pensando" que é dia 1º do mês seguinte em UTC — o Portal do Ajudante mostraria os ganhos do mês errado (provavelmente vazio, parecendo que o pagamento sumiu), e o Painel de Indicadores abriria no mês errado por padrão. Conserto é mecânico: criar um `mesAtualBRT()` (do mesmo jeito que já existe `hojeDataBRT()`) e trocar os ~70 pontos.

### 9. Senha padrão `destak123` se espalhou — de 2 pontos em agosto pra 21 hoje

Mitigado parcialmente porque a senha real agora é comparada com hash no servidor (não trafega mais em texto puro) — mas continua sendo uma lista previsível de contas até a pessoa trocar a senha no primeiro acesso, e o padrão se replicou pelos novos formulários de Cadastros em vez de ser centralizado.

### 10. CI só verifica sintaxe JS, não a estrutura do HTML

O `check.js` que roda antes de cada deploy (confirmado funcionando, nos dois arquivos) pega truncamento e erro de sintaxe JavaScript — mas **não verifica balanço de `<div>`**. Essa checagem é feita manualmente antes de cada publicação (prática desta sessão), sem nenhum enforcement automático. Um push com HTML estruturalmente quebrado passaria o CI sem problema.

### 11. `gerot.html` — autenticação fraca, mas já é uma melhora real

Em agosto não tinha checagem nenhuma. Hoje bloqueia o acesso se `localStorage.usuario_logado` não existir — mas só verifica se a chave existe, não o conteúdo (`localStorage.setItem('usuario_logado','{}')` no console já libera). Resolve a exposição casual (o risco real apontado em agosto), não resolve acesso deliberado.

---

## ✅ Confirmado corrigido desde agosto (boas notícias)

| Item (agosto) | Status hoje |
|---|---|
| Senha em texto puro comparada no navegador | **Corrigido de verdade** — hash bcrypt + função `verificar_login` no servidor (`SECURITY DEFINER`), com rate limiting de tentativas de login. Um bug real nessa função (login com e-mail errado + senha certa de outra pessoa) foi encontrado e corrigido em produção em 19/09. |
| Chave do ERP hardcoded | **Corrigido**, e o padrão (fail-fast sem valor literal de fallback) foi estendido pra outras 10 Edge Functions, incluindo 3 que nem existiam em agosto. |
| Q2 — carga totalmente devolvida pagando cheio | **Ainda corrigido**, e a lição foi aplicada certo na função nova de ganhos do ajudante. |
| Q3 — pagamento duplicado em `confirmarPagamento` | **Ainda corrigido** (mas ver achado novo #6 acima, numa função diferente). |
| Q4 — rota externa pagando R$0 | **Ainda corrigido**, mesmo padrão replicado certo no código novo. |
| XSS na tela de Ocorrências/Distribuição | **Corrigido** — todo campo de texto livre passa por `escapeHtml()` hoje, inclusive na feature nova do Gabriel. |
| Filtros de busca sem `encodeURIComponent` | **Parece corrigido** — todos os pontos revisados hoje já encodam certo. |
| `gerot.html` sem autenticação nenhuma | **Melhorado** (ver ressalva no achado #11). |
| Deploy sem verificação de sintaxe | **Corrigido e em produção** (`check.js`). |
| Indicador "Liberação no Prazo" excluindo carga que nunca saiu | **Corrigido.** |
| Trigger do banco não reconhecia status "formação" | **Corrigido.** |
| Loop do ERP fazendo DELETE+INSERT (risco de perda de dado) | **Corrigido** — upsert com `on_conflict`, sem DELETE. |
| `limit=5000` truncando indicador de conferência | **Confirmado, de novo, que não é risco real** no volume atual (3.080 linhas, limite hoje é 50.000). |

---

## Nota sobre a feature "Gerar Apresentação"

Um dos agentes recebeu instrução pra checar essa feature (PowerPoint gerado no Painel de Indicadores) e não achou nenhum vestígio dela em `origin/main` — porque ela **ainda não foi publicada** (PR #486, aberto, aguardando decisão). Quando for mesclada, vale reconferir a versão do PptxGenJS contra uma base de CVE atualizada antes do merge (ela já tem uma checagem defensiva — `typeof PptxGenJS === 'undefined'` — o que é um bom sinal).

---

## Ordem de ação sugerida

1. **Hoje, investigação (não é código):** descobrir por que as duas tentativas de RLS zeraram os dados, antes de tentar de novo.
2. **Hoje, SQL simples:** `REVOKE INSERT, UPDATE ON configuracoes FROM anon` + `REVOKE DELETE, UPDATE ON usuarios, motoristas, ajudantes, conferentes FROM anon` — testar o login logo depois.
3. **Esta semana, GitHub:** confirmar/ativar "Require pull request before merging" em `main`.
4. **Esta semana, código (baixo risco, mecânico):** os 6 pontos de XSS novos (achado #4) + corrigir `marcarPagamento` (achado #6) pra espelhar o padrão seguro de `confirmarPagamento`.
5. **Quando houver tempo, código:** `mesAtualBRT()` + os ~70 sites do bug de fuso mensal (achado #8); atualizar xlsx pra ≥0.20.x (achado #7); adicionar checagem de `<div>` no `check.js` (achado #10).
6. **Projeto maior, coordenado:** redesenhar as políticas de RLS por perfil (não só `authenticated = tudo`) antes da 3ª tentativa de religar — é o único conserto de verdade pros achados #1, #2 e #3.
