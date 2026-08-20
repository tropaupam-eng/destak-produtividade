# Regras do Projeto — Destak Produtividade

> ⚠️ **LEIA ANTES DE MEXER EM SEGURANÇA/BANCO/INDICADORES/DEPLOY:** [`AUDITORIA-SEGURANCA-2026-08-20.md`](AUDITORIA-SEGURANCA-2026-08-20.md)
> Auditoria de 5 agentes (feita pelo Claude, a pedido do Rafael, colaborador deste repo). **Parte 1 (Segurança):** o app não tem controle de acesso server-side — sem RLS, sem Supabase Auth, senha em texto puro, chave do ERP hardcoded. **NÃO marque "Enable RLS" sem antes migrar a autenticação** — derruba o app inteiro (todo request usa a mesma `anon`; não há identidade para a policy avaliar). **Parte 2 (Corretude/Dados/Perf/Deploy):** bugs de dinheiro (carga devolvida paga integral, pagamento duplicado, R.E. paga R$0), o indicador "Carregamento no Prazo" pode estar medindo um `limit=5000` e não o armazém, bug de fuso sistêmico (71 lugares em UTC), e o deploy **não tem verificação** (já derrubou a produção uma vez, commit `7005a8f`). `arquivo:linha`, o que é código × o que é banco, e a ordem de conserto estão no arquivo.

> **Correção da própria doc:** este app **não** é "único arquivo `index.html` ~21.000 linhas". São **44.756 linhas** no `index.html` + o painel `gerot.html` (iframe). E ~43 tabelas em uso não estão na tabela abaixo (ela cobre ~metade do sistema).

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
