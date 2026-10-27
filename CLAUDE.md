# Regras do Projeto — Destak Produtividade

> ✅ **Incidente resolvido (2026-10-15 a 2026-10-17) — cota de egress do Supabase:** o projeto
> `hiydkyslgiomdyginfdx` estava no plano Free, estourou a cota de *egress* e o Supabase
> restringiu a API REST do projeto inteiro (`exceed_egress_quota`, 402 em toda `supaFetch`) —
> sistema fora do ar por ~1 dia. **Nenhum dado foi perdido** (confirmado: o banco nunca foi
> tocado, só a API de leitura/escrita ficou bloqueada; os últimos registros em todas as
> tabelas batem exatamente com o horário em que o bloqueio começou). Resolvido com upgrade
> da conta pro plano **Pro**. Em paralelo, reduzido o consumo de egress no código (PR #483 —
> `syncBaseData()` não rebaixa mais a tabela `base_data` inteira a cada login, cache
> compartilhado no Portal do Conferente, filtros movidos pra consulta em vez de JS) pra não
> estourar de novo. Se "erro ao carregar dados" voltar a aparecer, a mensagem de erro agora
> mostra o motivo real (`e.message`, PR #481) — confira ali antes de supor bug de código.

> 📓 **O que o Rafael mexeu aqui e por quê:** [`MUDANCAS-DO-RAFAEL.md`](MUDANCAS-DO-RAFAEL.md)
> Registro das mudanças feitas pelo lado dele (colaborador), com o commit de cada uma e o que
> ficou pendente do lado de vocês. Toda mudança nova entra lá no mesmo commit.

> 📓 **O que o Gabriel mexeu aqui e por quê:** [`MUDANCAS-DO-GABRIEL.md`](MUDANCAS-DO-GABRIEL.md)
> Mesmo formato do registro do Rafael, mas em arquivo separado. Toda mudança do Gabriel entra lá,
> no mesmo commit, com o commit a reverter e o que ficou pendente.

> 🟡 **PERGUNTA ABERTA, AGUARDANDO RESPOSTA DO DANIEL:** [`PERGUNTAS-RAFAEL-MFV.md`](PERGUNTAS-RAFAEL-MFV.md)
> São 7 perguntas de verificação, feitas pelo Rafael (colaborador). **Nenhuma delas pede
> para implementar nada** — pedem conferência no código e uma resposta escrita no próprio
> arquivo. A nº 1 é a que trava as outras: descobrir se alguma coisa LÊ
> `atribuicoes_armazem.inicio_separacao` ou `conferencia_pedidos.separador_vinculado_em`,
> e se algum lugar trata `NULL` nessas colunas como estado. Se ler, a proposta cai.
> Respondido tudo, apague este aviso.

> 🔴 **LEIA ANTES DE MEXER EM SEGURANÇA/BANCO/INDICADORES/DEPLOY:** [`AUDITORIA-SEGURANCA-2026-10-27.md`](AUDITORIA-SEGURANCA-2026-10-27.md)
> Reauditoria de 5 agentes (a pedido do usuário, 27/10) em cima da de 20/08 (mantida no repo como histórico). **Ainda sem RLS em ~110 tabelas** — a chave `anon` pública lê/escreve/apaga tudo, sem login, igual em agosto. **NÃO marque "Enable RLS" sozinho** — já foi tentado 2x em produção (15/09 e 18/09) e as duas vezes os dados "zeraram" e precisou reverter de emergência, sem a causa raiz nunca documentada. Achado novo grave: o sistema de perfil customizado (Cadastro > Perfis) permite, sem login nenhum, criar um perfil com acesso a páginas admin e trocar o perfil de qualquer usuário — `showPage()` não verifica perfil nenhum. **Boas notícias:** senha não é mais texto puro (hash + RPC no servidor), chave do ERP corrigida em 11 Edge Functions, bugs de dinheiro antigos (Q2/Q3/Q4) seguem corrigidos. Ordem de conserto, achados novos de XSS, e tudo com `arquivo:linha` estão no arquivo.

> **Correção da própria doc:** este app **não** é "único arquivo `index.html` ~21.000 linhas". São **44.756 linhas** no `index.html` + o painel `gerot.html` (iframe). E ~43 tabelas em uso não estão na tabela abaixo (ela cobre ~metade do sistema).

> 🔵 **Painel de Indicadores → Pedidos & Rotas, visão R.E. (externa) vem de Expedição (`demandas_rota`), não de `lancamentos`** (pedido do usuário, 2026-10-05: valor por rota estava subcontado — Salvador R$ 2,99 mi no card contra R$ 4,11 mi lançados em Expedição). Código: `_carregarExpedicaoRE` / `_agregarExpedicaoRE` (index.html). Regras: 1 linha por carga (a mais recente), sem `cancelado`/`formacao`, mês = mês de `data_saida` (regra do usuário: data de saída dentro do mês conta no mês; `ts_saiu` só se faltar a data), só rotas fora de `ROTAS_RI`. Rota interna (Ceasa/Petrolina/Juazeiro/Retira) segue vindo de `lancamentos`. "Entrega" = parada de cliente (código do cliente por carga), diferente de pedido. A lista "Valor por Rota" mostra TODAS as rotas (antes só as 10 maiores em pedidos, e a soma não fechava).

> 🔴 **`lancamentos` ≠ `demandas_rota` — NUNCA criar uma a partir da outra:** achado em auditoria 2026-09-28, depois de duas tentativas erradas (Claude criou 31 cards fantasma na Expedição — CEASA/PETROLINA/RETIRA/JUAZEIRO — tentando "auto-criar" `demandas_rota` a partir de `lancamentos`, primeiro sem checar `vinculado`, depois checando `vinculado=true`; nenhuma das duas bastava). `lancamentos` = registro de motorista/veículo pra produtividade/pagamento; `demandas_rota` = board de Expedição, criado **SOMENTE** por ação humana explícita (botão "Adicionar à Pré-Carga" em `acaoRotaUnificada('lancar',...)`, ou o formulário manual de lançamento). Uma carga pode ter `lancamentos` (até com `vinculado=true`) sem nunca ter passado pela Expedição — isso é normal, não é bug. `sincronizarDemandasRota()` em `_shared/erp-comum.ts` (Edge Functions do ERP) faz **só UPDATE, nunca INSERT** — não mexer nisso sem confirmar com o usuário antes. Há um trigger (`trg_log_criacao_demandas_rota` → tabela `demandas_rota_log_criacao`) que registra automaticamente toda criação de linha com o `role` de quem criou (`service_role` = veio de automação/Edge Function, suspeito; `anon`/`authenticated` = veio de clique real de usuário) — consultar essa tabela antes de mexer em qualquer coisa relacionada a criação de carga.

## Banco de Dados (Supabase) — REGRA OBRIGATÓRIA

**Todo dado de negócio DEVE ir para o Supabase. Ponto final.**

- Projeto: `hiydkyslgiomdyginfdx`
- Helper de acesso: `supaFetch(path, opts)` — use sempre este helper, nunca `fetch` direto para o Supabase

### O que NUNCA pode ficar só em localStorage:
- Lançamentos, cargas, pedidos, rotas
- Status de conferência, fiscal, armazém
- Divergências aceitas, ocorrências
- Rotas comerciais pendentes ou resolvidas
- Datas de entrega, OTIF, planilhas importadas
- Qualquer dado que outro usuário precise ver

### localStorage — uso permitido apenas para:
- Token de sessão (`usuario_logado`, `ajudante_logado`)
- Cache de performance de dados já salvos no Supabase (`base_data_prod`, `lancamentos_prod`, `carga_map_prod`) — o Supabase é sempre a fonte verdadeira
- Preferências de interface (`tema`, `destak_pagina_atual`, `app_version`)
- Flags de migração única (`migr_rotas_v1`)

### Padrão de cache aceitável (write-through):
```javascript
// OK: salvar local E sincronizar com Supabase simultaneamente
function salvar(dados) {
  localStorage.setItem('chave', JSON.stringify(dados)); // cache local
  supaFetch('tabela', { method: 'POST', body: JSON.stringify(dados) }); // fonte verdadeira
}
```

### Padrão PROIBIDO:
```javascript
// ERRADO: dado de negócio só em localStorage
localStorage.setItem('comercial_rotas', JSON.stringify(novaRota));
// Outros usuários nunca verão esse dado!
```

## Tabelas disponíveis no Supabase

| Tabela | Uso |
|--------|-----|
| `lancamentos` | Lançamentos de cargas (motorista, ajudante, rota, veículo). `motorista` é texto livre (nome); `motorista_id` é FK opcional para `motoristas` — fica NULL para LOJA/A DEFINIR MOTORISTA/frete e para nomes ainda fora do cadastro (planilha/digitação antiga). Use `motoristaIdPorNome(nome)` ao gravar. |
| `lancamentos_ajudante` | Participação de ajudantes por carga |
| `base_data` | Dados da planilha (pedidos, valores, ocorrências) |
| `demandas_rota` | Cargas em trânsito na expedição |
| `atribuicoes_armazem` | Atribuições de pedidos para conferentes |
| `atribuicoes_fiscal` | Atribuições de pedidos para o fiscal |
| `notas_fiscais` | NFs e boletos enviados pelo fiscal |
| `conferencia_pedidos` | Status de conferência de pedidos |
| `motivos_devolucao` | Motivos de devolução cadastrados, vinculados a um setor (armazem/distribuicao/comercial) — usados ao registrar ocorrência em Ocorrências (Distribuição) |
| `ocorrencias_distribuicao_itens` | Produtos devolvidos por ocorrência (tabela filha de `ocorrencias_distribuicao`, uma linha por produto+quantidade; devolução total grava todos os itens do pedido, parcial só os selecionados) |
| `comercial_rotas` | Rotas com pendência comercial (valor mínimo) |
| `agendamentos_rotas` | Agendamento mensal de rotas |
| `divergencias_aceitas` | Divergências de condutor aceitas por usuário |
| `entrega_datas` | Datas de entrega importadas para cálculo OTIF |
| `usuarios` | Usuários do sistema |
| `motoristas` | Cadastro de motoristas |
| `veiculos` | Cadastro de veículos |
| `rotas` | Cadastro de rotas com metas de valor |
| `ajudantes` | Cadastro de ajudantes |
| `conferentes` | Cadastro de conferentes |
| `configuracoes` | Configurações do sistema |
| `pagamentos` | Registros de pagamento |
| `absenteismo` | Registro de absenteísmo |
| `validacoes_caixa` | Validações do portal de caixa |
| `abastecimento_loja` | Registros de abastecimento de loja (carga, veículo, motorista, conferente, unidade) |
| `erros_sistema` | Log de erros em produção |

## Arquitetura

- Aplicação monolítica: único arquivo `index.html` (~21.000 linhas)
- Deploy: GitHub Pages em `tropaupam-eng.github.io/destak-produtividade`
- Repositório: `tropaupam-eng/destak-produtividade`
- Autenticação: tabelas `usuarios`, `motoristas`, `ajudantes`, `conferentes` (verificadas em cadeia no login)
- Sem framework — JavaScript vanilla com Supabase REST API
