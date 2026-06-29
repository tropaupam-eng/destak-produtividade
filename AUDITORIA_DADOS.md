# Relatório Executivo de Auditoria de Dados — Destak Produtividade

> Gerado em 2026-06-29 | 7 agentes | 329 chamadas ao codebase | ~32.000 linhas analisadas

---

## 1. Resumo Executivo

A auditoria cobriu **5 domínios** (Pedidos, OTIF, Rotas, Cargas e Produtividade) e mapeou **38 tabelas** consumidas por **27 módulos** distintos dentro de um único `index.html`.

| Categoria | Qtd |
|-----------|-----|
| Divergências críticas (impacto financeiro ou operacional) | **20** |
| Fontes de dados duplicadas para o mesmo dado | **18** |
| Grupos de valores hardcoded que deveriam vir do banco | **14** |
| Funções equivalentes definidas em múltiplos lugares | **6** |

### Score de Maturidade de Dados: **3 / 10**

O Supabase é usado como repositório, mas a lógica de negócio está fragmentada em mais de 20 implementações paralelas sem contrato formal de interface. Cálculos financeiros críticos divergem entre módulos. Dados hardcoded no HTML são usados em decisões de pagamento. Não há testes nem validação de integridade entre tabelas relacionadas.

---

## 2. Mapa de Single Source of Truth (SSoT)

| Informação | Fonte Oficial | Fontes Secundárias em Uso | Status |
|------------|--------------|--------------------------|--------|
| Motorista da carga | `lancamentos.motorista` | `base_data.condutor`, `demandas_rota.motorista` | 🔴 CRÍTICO |
| Ajudante da carga | `ajudante_cargas` (UUID) | `lancamentos.ajudante`, `base_data.ajudante`, `lancamentos_ajudante` | 🔴 CRÍTICO |
| Contagem de pedidos por carga | `COUNT(base_data WHERE carga=X)` | `demandas_rota.quantidade_pedidos`, `ajudante_pedidos` | 🔴 CRÍTICO |
| Classificação RI/RE | `getRireFromRota()` via `ROTAS_RI` dinâmico | `ROTAS_RI_ORIG` hardcoded, `ROTAS_CONTAGEM`, `lancamentos.rire`, `base_data.rire` | 🔴 CRÍTICO |
| Valores de bônus por rota | `rotas` (Supabase) via `syncConfig()` | `CONFIG_BONUS` (objeto morto), `CONFIG_DEFAULT` (hardcoded), fallbacks literais | 🔴 CRÍTICO |
| OTIF (On Time In Full) | `_carregarOtifMes(mes)` (cache) | Cálculo paralelo em `renderDashInterna` (L.19282), `carregarTV` (L.30509), bloco semanal (L.19601) | 🔴 CRÍTICO |
| Bônus KM para motoristas RE | `km_cargas` + `rotas_viagem` | **Ignorado em `gerarPagamentos`** | 🔴 CRÍTICO |
| Cadastro de rotas ativas | `rotas` (Supabase) | `ROTAS_RI_ORIG` hardcoded (L.7828), `ROTAS_CONTAGEM` (L.7826), listas inline em 4+ locais | 🔴 CRÍTICO |
| Pagamento de ajudantes | `pagamentos` (schema unificado) | Dois shapes incompatíveis: `confirmarPagamento` vs `marcarPagamento` | 🔴 CRÍTICO |
| In Full (pedidos sem ocorrência) | `ocorrencias_distribuicao` | `base_data.ocorrencia` (Dashboard Interno) | 🟡 RISCO |
| Status do ciclo de vida da carga | `demandas_rota.status` | Transições bypassando `_patchStatusDemanda` | 🟡 RISCO |
| KM da viagem | `km_cargas` (motorista) | `rotas_viagem` (admin) — dois registros para o mesmo KM | 🟡 RISCO |
| Rota da carga | `demandas_rota.rota` | `lancamentos.rota`, `base_data.rota` | 🟡 RISCO |
| Prazo OTIF por rota | `rotas.prazo_otif` (Supabase) | Hardcoded 24h (RI) e 192h (RE) como fallback | 🟡 RISCO |
| Datas de entrega para OTIF | `entrega_datas` | Cache local em `renderDashInterna` sem `mes_ano` filter (já corrigido) | 🟡 RISCO |
| Bônus ADM confirmado | `configuracoes.bonus_adm_YYYY-MM` | Lido só em `carregarPortalMotorista`; ignorado por `gerarPagamentos` | 🟡 RISCO |
| Preferências de interface | `localStorage` | — | ✅ OK |
| Token de sessão | `localStorage` | — | ✅ OK |

---

## 3. Duplicidades Críticas — Impacto Imediato

### DC-01 — Bônus de Motoristas RE = R$0 no Módulo Financeiro 🔴

**Problema:** `gerarPagamentos` (L.26813) não busca `km_cargas` nem `rotas_viagem`. Para rotas RE, `getValorRota().motSem = 0` (correto — RE é pago por KM), mas o KM nunca é somado.

**Causa:** A componente `kmBonusRE = kmRodado × valorKm` existe em `carregarPortalMotorista` (L.16363) mas não foi portada para `gerarPagamentos`.

**Impacto:** Motoristas de rota externa recebem R$0 no processamento financeiro mensal. O valor correto aparece só no portal do motorista — divergência invisível para o gestor.

**Correção:** Em `gerarPagamentos`, buscar `km_cargas` para o mês e somar `(km_final - km_inicial) × valorKm` ao total de cada motorista RE.

---

### DC-02 — Schema Duplo na Tabela `pagamentos` 🔴

**Problema:** Dois módulos gravam na mesma tabela com shapes incompatíveis:
- `confirmarPagamento` (L.10286): grava `ajudante_id` (UUID), `valor_calculado`, `valor_pago`
- `marcarPagamento` (L.27254): grava `nome` (string), `mes_ano`, `tipo`, `entregas`, `val_entrega`, `total`, `status`

**Impacto:** Um ajudante pode ser pago duas vezes no mesmo mês sem que o sistema detecte duplicidade. O histórico de pagamentos é ilegível de forma unificada.

**Correção:** Definir schema único (`tipo`, `referencia_id` UUID, `nome`, `mes_ano`, `total`, `status`). Migrar registros antigos. Remover `confirmarPagamento`.

---

### DC-03 — In Full do OTIF Zerado no Fallback (Bug Silencioso) 🔴

**Problema:** Dois fallbacks chamam `_computeOtifStats` sem o 6º argumento `ocorrRows`:
- `renderDashInterna` L.19282: 5 args (sem `ocorrRows`)
- `carregarTV` L.30509: 5 args (sem `ocorrRows`)

**Impacto:** Quando o cache `_carregarOtifMes` falha e a query ao Supabase retorna vazia, `inFullG = total` (todos os pedidos são "in full"), inflando o OTIF silenciosamente.

**Correção:** Passar `ocorrRows` em todos os chamadores de `_computeOtifStats`.

---

### DC-04 — Contagem de Pedidos Diverge Entre Módulos 🔴

Cada módulo aplica filtros diferentes sobre `base_data`:

| Módulo | Exclui ocorrência=1 | Filtra por mês | Filtra por rota |
|--------|--------------------|--------------|-----------------|
| Portal Motorista | ✅ Sim | Via lancamentos | Via lancamentos.rire |
| Dashboard Interno | ✅ Sim | Via lancamentos.ts | Via cargaIsRI |
| OTIF | ✅ Sim (só sem data_pedido) | ✅ `data_pedido.startsWith(mes)` | Via lancamentos |
| Pagamentos (`gerarPagamentos`) | ✅ Sim | Via lancamentos.ts | `getRireFromRota` |
| TV | ✅ Sim | Via lancamentos | Via ROTAS_RI dinâmico |

**Causa:** Não existe uma função centralizada `getPedidosDaCarga(carga, filtros)`. Cada módulo reimplementa o filtro.

**Impacto:** Para uma mesma carga de 100 pedidos, dashboards diferentes podem exibir 95, 100 ou 98 dependendo de qual módulo o gestor consulta.

---

### DC-05 — Classificação RI/RE Inconsistente (4 Árbitros) 🔴

Existem **4 fontes diferentes** para determinar se uma rota é RI ou RE:

1. `ROTAS_RI_ORIG` — Set hardcoded (L.7825), imutável, tem prioridade em alguns módulos
2. `ROTAS_RI` — Set dinâmico, populado pelo banco via `syncConfig()` — pode divergir do hardcoded
3. `lancamentos.rire` — campo do banco, pode estar errado (digitado manualmente)
4. `getRireFromRota()` — função que consulta `CONFIG.rotas[rota]` (que vem do banco)

**Impacto:** Uma nova rota RI cadastrada no banco não é reconhecida como RI em módulos que usam `ROTAS_RI_ORIG` como árbitro final. Resultado: pedidos dessa rota entram no RE, valores calculados errado, OTIF errado.

---

### DC-06 — Bônus ADM Ignorado pelo Módulo Financeiro 🔴

O bônus ADM (confirmado pelo gestor em `configuracoes.bonus_adm_YYYY-MM`) é lido **apenas** em `carregarPortalMotorista` (L.16418). O módulo `gerarPagamentos` (L.26813) ignora esse valor e gera um total diferente do que o motorista vê no próprio portal.

---

### DC-07 — `quantidade_pedidos` em `demandas_rota` Desatualizado 🟡

`demandas_rota.quantidade_pedidos` é preenchido no momento do lançamento e não é atualizado quando pedidos são adicionados ou removidos de `base_data` depois. Módulos que usam este campo como fallback (ex: Portal Motorista L.16299) exibem contagens desatualizadas.

---

## 4. Valores Hardcoded que Devem Ir para o Banco

| Valor | Onde está | Impacto |
|-------|-----------|---------|
| `motSem:1.00, motCom:0.50, ajud:0.50` | L.9977–9981 (PETRO, JUA, CEASA, RETIRA) | Se o gestor alterar o valor no banco, o hardcoded prevalece em fallback |
| `ajud:0.75` para RE | L.10046 | Ajudante de rota externa sem configuração recebe R$0.75 fixo |
| `valorKm:0.20` para RE | L.10026 | Valor de KM fixo ignorando configuração da rota específica |
| `conferente:0.20` | L.10026, 10041, 10046 | Todos os conferentes recebem R$0.20 se rota não tem cadastro |
| `24h` (prazo RI) e `192h` (prazo RE) | `_computeOtifStats` L.19735 | Prazo errado se a rota não está cadastrada |
| ROTAS_RI_ORIG (lista de 20+ rotas) | L.7825 | Nova rota RI no banco não reconhecida como RI até o código ser editado |
| Dados de demandas de Maio 2026 | L.~19000 (hardcoded no JS) | Dados de produção dentro do código — não deveria existir |

---

## 5. Fluxo de Dados por Domínio

### Pedidos
```
Planilha importada
    → base_data (pedido, carga, rota, valor, ocorrencia, data_pedido)
        ├── Portal Motorista: filtra carga ∈ lancamentos[motorista], exclui ocorrencia=1
        ├── Dashboard Interno: filtra carga ∈ lancamentos[mes], exclui ocorrencia=1
        ├── OTIF: filtra data_pedido ∈ mes, exclui sem data_pedido
        ├── Pagamentos: filtra carga ∈ lancamentos[mes], exclui ocorrencia=1
        └── TV: idem Dashboard Interno
    ⚠️ PROBLEMA: 5 filtros diferentes → 5 contagens diferentes
```

### OTIF
```
base_data + entrega_datas + lancamentos + demandas_rota + rotas + ocorrencias_distribuicao
    → _carregarOtifMes(mes) [CACHE — SSoT pretendido]
        ├── Dashboard Interno: usa cache ✅ (mas tem fallback sem ocorrRows ⚠️)
        ├── TV: usa cache ✅ (mesmo fallback problemático ⚠️)
        ├── OTIF por Semana: recalcula inline sem cache ⚠️
        └── Painel Geral: usa cache ✅
```

### Rotas / Valores
```
Banco: tabela `rotas` (mot_sem_aj, mot_com_aj, val_ajudante, valor_km)
    → syncConfig() → CONFIG.rotas [memória]
        → getValorRota(nome) [função SSoT para valores]
            ├── Portal Motorista: usa getValorRota ✅
            ├── Pagamentos: usa getValorRota ✅ (mas não KM para RE ⚠️)
            └── Portal Ajudante: usa getValorRota ✅
    ⚠️ Competindo com: CONFIG_BONUS (objeto morto), ROTAS_RI_ORIG (hardcoded)
```

### Cargas
```
Expedição lança: demandas_rota (rota, motorista, status, quantidade_pedidos)
Dispatcher confirma: lancamentos (carga, motorista, ajudante, rota, rire, ts)
Ajudante se registra: ajudante_cargas (carga, ajudante_id, ajudante_nome)
Motorista registra KM: km_cargas OU rotas_viagem [DUPLICADO]

⚠️ Motorista: lancamentos.motorista vs base_data.condutor (qual prevalece?)
⚠️ Ajudante: lancamentos.ajudante vs ajudante_cargas (qual prevalece?)
⚠️ Pedidos: COUNT(base_data) vs demandas_rota.quantidade_pedidos
```

### Produtividade
```
Para R.I.:
    bônus = getValorRota(rota).motSem|motCom × COUNT(pedidos sem ocorrencia=1)
    temAjudante → motCom; sozinho → motSem

Para R.E.:
    bônus = (km_final - km_inicial) × getValorRota(rota).valorKm
    ⚠️ gerarPagamentos ignora KM → R$0 para RE no financeiro

Bônus ADM:
    configuracoes.bonus_adm_YYYY-MM → só Portal Motorista lê
    ⚠️ gerarPagamentos ignora → divergência motorista vs gestor
```

---

## 6. Plano de Centralização — Prioridade

### Prioridade 1 — Impacto Financeiro Imediato

| # | Ação | Onde mudar | Impacto |
|---|------|-----------|---------|
| P1-A | Adicionar KM de RE em `gerarPagamentos` | L.26813 + buscar `km_cargas` | Motoristas RE recebem corretamente |
| P1-B | Passar `ocorrRows` nos fallbacks de `_computeOtifStats` | L.19282 e L.30509 | OTIF não infla quando cache falha |
| P1-C | Unificar schema da tabela `pagamentos` | Migration SQL + código | Histórico legível, sem duplo pagamento |

### Prioridade 2 — Consistência dos Indicadores

| # | Ação | Onde mudar | Impacto |
|---|------|-----------|---------|
| P2-A | Criar função `getPedidosDaCarga(carga, {excluirOcorr, mesAno})` | Nova função utilitária | Todos os módulos usam a mesma contagem |
| P2-B | Eliminar `ROTAS_RI_ORIG` — usar apenas `ROTAS_RI` dinâmico | L.7825 e 4+ módulos | Novas rotas reconhecidas imediatamente |
| P2-C | `gerarPagamentos` ler `bonus_adm` de `configuracoes` | L.26813 | Valor do gestor = valor do motorista |

### Prioridade 3 — Limpeza Estrutural

| # | Ação | Onde mudar | Impacto |
|---|------|-----------|---------|
| P3-A | Remover `CONFIG_BONUS` (objeto morto) | L.10456 | Menos confusão, sem fonte fantasma |
| P3-B | Remover valores hardcoded de `getValorRota()` | L.9977–10046 | Todos os valores gerenciados pelo banco |
| P3-C | Unificar KM: `km_cargas` como única tabela, remover `rotas_viagem` ou deixá-la como histórico | Múltiplos módulos | Uma fonte para KM |
| P3-D | Remover dados de produção hardcoded no JS | L.~19000 | Código não contém dados |

---

## 7. Arquitetura SSoT Proposta

```
BANCO (Supabase) — Fonte de Verdade
├── rotas            → valores de bônus, prazo OTIF, classificação RI/RE
├── base_data        → pedidos (fonte primária de contagem)
├── lancamentos      → cargas lançadas (motorista, ajudante, ts)
├── ajudante_cargas  → ajudantes por carga (UUID — fonte autorizada de ajudante)
├── km_cargas        → quilometragem (única tabela, motorista + admin)
├── entrega_datas    → datas de entrega real (OTIF)
├── ocorrencias_distribuicao → In Full (OTIF)
└── pagamentos       → schema único (tipo+nome+mes_ano+total+status)

MEMÓRIA (carregada 1× na inicialização)
├── CONFIG.rotas     → cache de rotas (via syncConfig), nunca hardcoded
├── ROTAS_RI         → Set dinâmico APENAS (remover ROTAS_RI_ORIG)
└── _otifCacheMap    → cache OTIF por mês (já implementado)

FUNÇÕES CENTRALIZADAS (uma por domínio)
├── getValorRota(rota)        → valores sem hardcode (já existe, mas tem fallbacks ruins)
├── getPedidosDaCarga(c, f)   → NOVA — contagem única de pedidos com filtros padrão
├── _carregarOtifMes(mes)     → OTIF cache (já existe — garantir que TODOS usem)
├── getRireFromRota(rota)     → classificação RI/RE (já existe — todos devem usar)
└── getAjudanteDaCarga(carga) → NOVA — verificar ajudante_cargas + lancamentos

MÓDULOS (consumidores — não calculam, apenas exibem)
├── Dashboard Interno  → usa funções centralizadas
├── TV / Painel        → usa funções centralizadas
├── Portal Motorista   → usa funções centralizadas
├── Portal Ajudante    → usa funções centralizadas
└── Financeiro         → usa funções centralizadas + km_cargas para RE
```

---

## 8. Resumo dos Riscos Ativos

| Código | Risco | Severidade | Status |
|--------|-------|-----------|--------|
| DC-01 | Motoristas RE com R$0 no financeiro | 🔴 Financeiro | Pendente |
| DC-02 | Schema duplo em `pagamentos` | 🔴 Integridade | Pendente |
| DC-03 | In Full OTIF zerado no fallback | 🔴 Indicador | Pendente |
| DC-04 | Contagem pedidos diferente por módulo | 🔴 Indicador | Pendente |
| DC-05 | Classificação RI/RE inconsistente | 🔴 Financeiro | Pendente |
| DC-06 | Bônus ADM ignorado pelo financeiro | 🔴 Financeiro | Pendente |
| DC-07 | `quantidade_pedidos` desatualizado | 🟡 Operacional | Pendente |
| DC-FIX-1 | Portal motorista ignorava `ajudante_cargas` | 🔴 Financeiro | ✅ Corrigido |
| DC-FIX-2 | OTIF sem filtro `mes_ano` em `entrega_datas` | 🔴 Indicador | ✅ Corrigido |
| DC-FIX-3 | Denominador OTIF vs Pedidos por Semana | 🟡 Indicador | ✅ Corrigido |
