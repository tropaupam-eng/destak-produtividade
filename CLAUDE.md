# Regras do Projeto — Destak Produtividade

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
| `lancamentos` | Lançamentos de cargas (motorista, ajudante, rota, veículo) |
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
| `erros_sistema` | Log de erros em produção |

## Arquitetura

- Aplicação monolítica: único arquivo `index.html` (~21.000 linhas)
- Deploy: GitHub Pages em `tropaupam-eng.github.io/destak-produtividade`
- Repositório: `tropaupam-eng/destak-produtividade`
- Autenticação: tabelas `usuarios`, `motoristas`, `ajudantes`, `conferentes` (verificadas em cadeia no login)
- Sem framework — JavaScript vanilla com Supabase REST API
