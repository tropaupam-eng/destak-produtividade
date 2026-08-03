# Integração ERP — Data de Entrega (validando cliente e carga)

> Documento de especificação. Ainda **não implementado** — depende de confirmação
> do nome/semântica do campo antes de mexer em produção (ver "Perguntas em aberto").

## 1. Como a integração ERP funciona hoje

Existem dois caminhos que gravam pedidos do ERP na mesma tabela de staging
`base_data_erp_teste` (nunca afeta produção diretamente):

1. **Produção real**: edge function `supabase/functions/receber-pedidos-erp/index.ts`,
   endpoint HTTPS que o ERP chama via POST com `x-api-key`. Valida campos
   obrigatórios, grava em `base_data_erp_teste` (upsert por `id`), registra
   histórico em `erp_historico`.
2. **Fluxo manual/teste**: `integrarPedidosERP()` em `index.html` — colar o JSON
   na tela de Integração ERP, mesma tabela de destino.

De `base_data_erp_teste` pra `base_data` (produção), três funções em `index.html`
fazem a promoção — todas do mesmo jeito (buscam linhas com `carga_erp` preenchido,
montam o registro, deletam o pedido antigo em `base_data` e reinserem):

- `erpPromoverAutomaticamente()` — roda sozinha, em polling a cada 5s.
- `erpPromoverParaProducao()` — botão manual, com confirmação.
- `erpPromoverAutomatico()` — cola o JSON e promove tudo num fluxo só.

**Desde o PR #223**, essas três funções já separam pedidos com `status: "cancelado"`
antes de promover: eles não entram em `base_data` (e são removidos de lá se já
tinham sido promovidos antes) e viram um registro em `pedidos_cancelados`
(aparece em Comercial > Cancelamentos). Esse é o padrão a seguir para a
"data de entrega".

## 2. Onde "data de entrega" já existe hoje (sem ser do ERP)

Isso é importante porque já existem **dois conceitos diferentes** de "data de
entrega" no sistema:

| Tabela | Significado | Quem preenche hoje |
|---|---|---|
| `entrega_datas` (coluna `data_entrega`) | Data **real** em que o pedido foi entregue — é a fonte usada no cálculo de **OTIF** | Confirmação do motorista no portal, lançamento manual do Comercial, ou propagada automaticamente a partir de `data_saida` quando a carga sai (`confirmarSaidaRota`) |
| `agendamentos_pedidos` (coluna `data_entrega`) | Data **agendada/prevista** de entrega (calendário de agendamento) | Lançamento manual na tela de Agendamentos |

O pedido do usuário ("quero que na integração venha a data da entrega quando
tiver") ainda não deixa claro qual das duas é — ver seção 5.

## 3. Proposta de implementação (assumindo: data REAL de entrega, mesmo papel de `entrega_datas`)

### 3.1 Schema
- Nova coluna `data_entrega date` (ou `timestamptz`) em `base_data_erp_teste`
  (migration nova em `supabase/migrations/`).
- `receber-pedidos-erp/index.ts`: aceitar `data_entrega` **opcional** no
  payload (nem todo pedido tem — só quando já foi entregue), validar formato
  `YYYY-MM-DD` quando vier preenchido, gravar em `dadosPedido`.
- `integrarPedidosERP()` (`index.html`): mesmo tratamento, pro fluxo manual/teste
  ficar consistente com o real.

### 3.2 Validação de cliente e carga antes de gravar

Dois riscos que a validação precisa cobrir:

- **Carga inexistente/errada**: só considerar o pedido se `carga_erp`
  corresponder a uma `demandas_rota` real (Pré-Carga da Expedição) — mesma
  checagem que `erpTestePreverPreCarga`/`erpPromoverAutomatico` já fazem hoje
  pra validar vínculo antes de promover.
- **Pedido de outro cliente por engano** (duplicidade/erro de numeração no
  ERP): antes de sobrescrever a data de entrega de um `pedido` que já existe
  em `base_data`, conferir se o cliente do registro novo (`codigo_cliente` /
  `nome_destinatario` do JSON) bate com o cliente já gravado (`base_data.cliente`)
  pra aquele mesmo número de pedido. Se não bater, **não grava** e loga o
  conflito pra revisão manual (dá pra reaproveitar o padrão de alerta usado
  pros cancelamentos, ex.: aparecer numa lista de "conflitos" em vez de
  falhar silenciosamente).
- Reaproveitar o filtro que já existe (PR #223): pedidos com
  `status === "cancelado"` continuam nunca gravando data de entrega.

### 3.3 Gravação em `entrega_datas`

Nas três funções de promoção, pra cada pedido ativo e validado com
`data_entrega` preenchida:

```
POST entrega_datas?on_conflict=mes_ano,pedido
Prefer: resolution=merge-duplicates,return=minimal
body: [{ mes_ano, pedido: String(pedido), data_entrega }]
```

(`entrega_datas` tem `UNIQUE(mes_ano, pedido)` e `pedido` é `text` — precisa
`String(pedido)` — então o upsert por `on_conflict` funciona direto, mesmo
padrão já usado em `confirmarSaidaRota` pra propagar `data_saida`.)

Uma função nova, `erpProcessarDatasEntrega(erpRowsComData, ...)`, seguindo o
mesmo formato de `erpProcessarPedidosCancelados()` (já existente), chamada
nos três pontos de promoção.

## 4. Riscos identificados

- **Overwrite indevido**: se o ERP reenviar o mesmo `numero_pedido_erp` associado
  a cliente/carga diferente por erro de dado, a validação de cliente evita
  sobrescrever — mas alguém precisa ver esse conflito em algum lugar (painel,
  toast, log em `erros_sistema`?). A decidir.
- **Pedido sem carga ainda**: hoje as três funções de promoção só processam
  linhas com `carga_erp` preenchido. Se o ERP mandar a data de entrega antes
  da carga ser vinculada, ela fica "esquecida" em `base_data_erp_teste` até o
  pedido ganhar carga — mesmo comportamento que já existe hoje pra outros
  campos (`carga_erp=null` fica pendente).
- **Formato da data**: confirmar se o ERP manda `YYYY-MM-DD` (data pura) ou
  timestamp com hora — `entrega_datas.data_entrega` é `timestamptz`.

## 5. Perguntas em aberto (preciso confirmar antes de codar)

1. **Nome exato do campo** no JSON do ERP — assumi `data_entrega`, seguindo o
   padrão dos campos que já existem (`data_pedido`, `data_documento`). Pode
   ser outro nome.
2. **Data agendada ou data real?** Se for a data *prevista/agendada* de
   entrega (não a que já aconteceu), o destino correto é
   `agendamentos_pedidos`, não `entrega_datas` — e a lógica de OTIF não deve
   usar esse valor.
3. **O campo vem sempre ou só depois da entrega acontecer?** (reenvio do
   mesmo pedido com a data preenchida depois, ou já vem no primeiro envio como
   previsão?)
4. **O que fazer no caso de conflito de cliente** (item 3.2): bloquear
   silenciosamente com log, ou criar um alerta visível tipo o de
   Comercial > Cancelamentos?

## 6. Próximos passos

Assim que as perguntas da seção 5 forem respondidas, a implementação segue o
mesmo formato do PR #223 (cancelamento): migration + edge function +
`integrarPedidosERP()` + uma função `erpProcessarDatasEntrega()` chamada nos
três pontos de promoção, com PR próprio pra revisão.
