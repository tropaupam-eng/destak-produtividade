# Mudanças feitas pelo Rafael neste repo — registro para quem (ou qual IA) vier depois

> **Para o Daniel e para a IA do Daniel.** O Rafael é colaborador aqui e mexe no código.
> Este arquivo existe para que nenhuma mudança dele chegue sem explicação: o que foi tocado,
> por quê, e o que ficou pendente do lado de vocês. **Regra que o Rafael pediu (10/09/2026):
> toda mudança que sair do lado dele passa a ser anotada aqui, no mesmo commit.**
>
> Ordem: mais recente no topo. `git log --author=rnloliveira1@gmail.com` traz o mesmo em bruto.

---

## O que o Rafael precisa do Cronos (pedido em aberto)

**1. Mandar o CÓDIGO do cliente junto do nome nas cargas.** Hoje a carga sai daqui só com o
nome, e o nome vem **truncado em 40 caracteres**. Do lado do CRM comercial isso obriga a casar
cliente por prefixo de nome, e o prefixo colide: `SENDAS DISTRIBUIDORA S/A - FILIAL ...` são 17
lojas diferentes que viram uma só, `ASSAI ATACADISTA ...` são 35. Com o código (o mesmo do ERP,
que já está no pedido) o casamento passa a ser exato e o problema some na origem.
Não precisa mudar tela nenhuma — basta o campo vir junto no dado da carga.

---

## 2026-10-29 — Cargas Pendentes: liberar o valor em R$ para usuário específico, sem virar admin (v4.89.95)

Até aqui o R$ da tela Comercial › Cargas Pendentes (KPI de valor e botão "Ver Valor") só aparecia para `admin`. O Rafael pediu
para o MATHUES TUPINA (`matheustupina2@gmail.com`, perfil `comercial_indicadores`) ver os valores das cargas, e promover ele a admin
abriria cadastro, pagamento e perfis. Agora `_cargPendPodeVerValor()` aceita admin **ou** e-mail presente na lista
`configuracoes.chave='cargas_pendentes_ver_valor'` (array JSON de e-mails, lida ao abrir a página). Linha criada com o e-mail dele.
Para liberar outra pessoa: acrescentar o e-mail nesse array; para tirar, remover. Admin continua igual.
Junto: o modo inicial (valor ou %) passou a ser decidido no primeiro carregamento da página, quando o usuário já é conhecido
(antes era calculado no carregamento do script, possivelmente antes do login).

---

## 2026-10-28 — Dashboard Devolução: tocar no vendedor filtra o painel só para ele (`7d73d90`)

Na aba Dashboard › Devoluções, a tabela "Erros por vendedor" passou a ser clicável: tocar num vendedor mostra só os números
dele no dashboard inteiro; tocar de novo volta para todos. Só tela, sem mudança de banco nem de cálculo. Pedido do Rafael.

**Leitura pelo CRM (para a IA do Daniel saber):** desde 28–29/10 o CRM do Rafael lê com a chave anon, uma vez por dia, as tabelas
`ocorrencias_distribuicao`, `motivos_devolucao`, `pedidos_info_erp`, `base_data` (só `vendedor_cod`) e `pedidos_alteracoes_erp`.
Só leitura, nada é escrito aqui. Se alguma dessas tabelas mudar de nome ou de coluna, ou ganhar RLS, o CRM para de mostrar as
devoluções com motivo e os avisos de item cortado (ele registra o erro e não grava nada). Proposta em aberto: uma edge function
irmã da `api-crm-cargas` para essas leituras.

## 2026-10-13 — painel MFV: o que agrega valor, NF medida, caso à parte (4.89.47)

Decisões do Rafael, só na aba MFV:
- **Bipagem não agrega valor** (inspeção): continua no fluxo e no lead time, sai do "agrega valor" e fica dourada.
- **NF medida**: da lista (romaneio) até a emissão no ERP (`nf`, coluna nova da planilha; aceita `ref_emissao_nf`).
  Não agrega valor e corre em paralelo ao armazém (`paralelo:true`): fica fora da cadeia de esperas e do lead time.
- **Caso à parte**: coluna `fora` (preenchida = fora da conta, aparece apagado na tabela). O pedido 67423
  (15.355 volumes) está marcado.
- Sem estatística: caixa de dados só com média e número de pedidos (saíram desvio e as funções sem uso).
- Só a regra do corte do carregamento (16 h) aparece; o 36 h do cadastro ficou na explicação. Jornada 480 min (8 h, pausa de 2 h).

---

## 2026-10-13 — painel MFV: média no lugar da mediana (4.89.46)

Pedido do Rafael. T/C, esperas, marcos e indicadores passam a usar MÉDIA, com desvio-padrão na caixa de dados
(saiu o P25–75). A média é aditiva: a soma das médias das etapas é igual à média do lead de cada pedido
(10,2 h nos 41 pedidos), o que a soma de medianas não garantia (mostrava 3,8 h). "Digitado → carregado" fica
sempre em horas. Só a aba MFV.

---

## 2026-10-13 — painel MFV: novo desenho em 3 faixas, letras maiores, explicação no "?"

Só na aba Fluxo do Pedido (MFV); a conta (`_mfv2Cadeia`, importação, KPIs) não mudou.
- **Faixa de informação (azul):** cliente (ícone de fábrica) → seta eletrônica → quadro "ERP Próton
  + Cronos" com a ordem **crédito → lista → NF** (a NF sai depois do romaneio no ERP); crédito e NF
  tracejados porque não têm carimbo.
- **Fluxo do pedido:** marcos (digitado, lista) em pílula, processos com caixa de dados (T/C grande,
  P25–75, n), triângulo de espera, seta empurrada listrada, caminhão no fim; estrela kaizen na maior
  espera do armazém. Caixa que entra na conta = verde sutil.
- **Linha do tempo no mesmo grid**, degrau embaixo de cada caixa/espera, com resumo no fim.
- Indicadores numa faixa só com número grande; textos explicativos saíram da tela e foram para
  `data-tip` (janelinha no hover/toque, `_mfv2Tips`). Números com vírgula decimal.
- Dado carregado: 41 pedidos de 21, 23 e 25/09 (planilha do Rafael). `version.json` 4.89.44.
- 4.89.45: botões Importar/Modelo/Limpar ganham estilo (o app não define `.btn`; caíam no branco do navegador).

---

## 2026-10-13 — painel MFV: caixas medidas em verde e rótulo de dado simulado

Só na aba Fluxo do Pedido (MFV). Caixa de processo que entra no cálculo ganha classe `med` e
fundo verde sutil (`rgba(52,211,153,.12)`, o mesmo verde das mensagens de sucesso); as que não
têm carimbo continuam tracejadas como estavam. Se alguma linha importada traz "SIMULADO" na
coluna `obs`, o cabeçalho do mapa mostra **DADOS SIMULADOS · não é medição de campo** (o rótulo
sai do próprio dado e some quando entrar a coleta real). As três chaves antigas citadas abaixo
**foram apagadas** em 13/10 (backup no PC do Rafael). `version.json` 4.89.43.

---

## 2026-10-13 — painel MFV reescrito do zero (v2): mapa clássico, só rota interna, fonte única

Só na aba Fluxo do Pedido (MFV). Todo o bloco anterior saiu (`MFV_ETAPAS_RE/RI`, `MFV_CAMPOS`,
fila, pedido a pedido do banco, bloco do ERP, POP × sistema, cenário ajustado): o `index.html`
perdeu ~800 linhas. Entrou um mapa só, no desenho clássico de MFV (Rother & Shook): fluxo de
informação em cima (vendedor → ERP+Cronos → cliente), caixas de processo com caixa de dados
(T/C mediana, P25–75, n, lote), triângulo ▲ de espera entre etapas, escada do tempo embaixo
(espera em cima, trabalho embaixo) e totais (lead armazém, trabalho, espera, eficiência do ciclo).
KPIs: demanda/dia, takt (jornada ÷ demanda), lead armazém, lead desde a digitação contra a
promessa de 36 h e **regra do corte** (digitado até 16 h tem que estar carregado no mesmo dia;
depois, no dia seguinte).

Mostra as 10 etapas do pedido, mas **computa só as que têm carimbo na planilha**: pedido
digitado, lista de separação, separação, conferência, montagem e carregamento. Crédito, NF,
transporte e entrega aparecem tracejados ("sem carimbo") até existir medição.

**Fonte única: `configuracoes.chave = 'mfv_v2'`**, gravada pelo botão "Importar planilha" (XLSX
ou CSV, um pedido por linha; botão "Modelo" baixa o cabeçalho esperado; "Limpar" apaga a chave).
Não lê mais `base_data`, `lancamentos`, `historico_status_carga` nem as chaves antigas
`mfv_campos`, `mfv_campo_pedidos` e `mfv_pedidos_erp` — **essas três ficaram órfãs no banco**,
pendente apagar (decisão do Rafael: desconsiderar a medição anterior). Nenhuma outra tela
tocada; `carregarMFV()` continua sendo o ponto de entrada em `showPage`. Hora é hora de parede
(BRT), sem conversão de fuso. `version.json` 4.89.42.

---

## 2026-10-06 — painel MFV: cenário ajustado ao lado do ERP medido

Só na aba Fluxo do Pedido (MFV), bloco "O que o sistema já mede". Entrou uma segunda linha de
cards, tracejada e rotulada **"Cenário ajustado"**, com os mesmos 30 pedidos de setembro mas com NF,
carga lançada e entrega alteradas por hipótese (corte de faturamento às 16h, esperas e trânsito
maiores; planilha `MFV-30-pedidos-rota-interna-set2026-Ajustado.xlsx`). A linha do ERP medido não
mudou. O cenário fica dentro da mesma chave `configuracoes.mfv_pedidos_erp`, no campo `cenario`
(uma linha atualizada; nada mais no banco). Aviso que o painel já reflete: em 18 dos 30 pedidos do
cenário a NF ficou antes do romaneio, então o trecho romaneio → NF do cenário descarta esses e
mostra n=12. Nenhuma outra tela foi tocada. `version.json` 4.89.18.

---

## 2026-10-06 — painel MFV: linha única passa a ser calculada da medição de campo

Só na aba Fluxo do Pedido (MFV). A linha do topo deixou de ser HTML escrito à mão: agora
`renderMFVLinha()` calcula os 9 cards (mediana e P25–P75) a partir de
**`configuracoes.chave = 'mfv_campo_pedidos'`**, um pedido por linha com P0 (digitado), E1/E2
(separação), E3/E4 (bipagem), E5/E6 (carregamento e saída) e P1 (entrega). Sem a chave, os cards
mostram "—" como antes. Hoje a chave tem os 30 pedidos da coleta de 23/09/2026 (17 Petrolina + 13
Juazeiro, 6 viagens), identificados só por ordem (P01…), sem cliente. Abaixo da linha, tabela dos
30 em `<details>`. A chave **`mfv_campos`** (caixa de dados do mapa completo) foi preenchida a
partir dessas mesmas linhas: espera = média, tempo de ciclo = menor tempo entre pedidos de volume
típico, `fora` marcado em financeiro, conferência/NF, reorganização e carga 0 (fora do escopo do
estudo, decisão de 21/09). Duas linhas em `configuracoes` (uma nova, uma atualizada); nada mais no
banco. Nenhuma outra tela foi tocada. `version.json` 4.89.17.

---

## 2026-10-06 — painel MFV: bloco "O que o sistema já mede" (30 pedidos do ERP)

Só na aba Fluxo do Pedido (MFV). Abaixo da linha de campo (que continua vazia, "—") entrou um bloco
com o que o ERP Próton e o Cronos já carimbam sozinhos, para 30 pedidos da rota interna (24 Petrolina
+ 6 Juazeiro, CD Juazeiro, setembro/2026): digitação, pedido → romaneio, romaneio → NF, NF → carga
lançada e pedido → carga lançada, em mediana com P25–P75, mais a tabela dos 30 (sem cliente nem
vendedor). Os dados vieram do Power BI (tabela `TPED_HISTORICO_VENDA`, modelo Estoque) cruzados com
`base_data` e `lancamentos` daqui, e ficaram em **`configuracoes.chave = 'mfv_pedidos_erp'`** (JSON,
12 KB, uma linha nova; nada mais no banco). Funções novas: `_mfvCarregarErp`, `renderMFVErp`,
constante `MFV_ERP_TRECHOS`. Duas armadilhas do ERP que o bloco explica na tela: romaneio, separação
e volumes têm o MESMO carimbo (um clique), e o lançamento da carga é feito no fim do dia (vale como
dia, não hora). Nenhuma outra tela foi tocada. `version.json` 4.89.16.

---

## 2026-10-06 — painel MFV: sai tudo que era simulado

Só na aba Fluxo do Pedido (MFV). Removido o dia simulado inteiro: o botão "Ver dia simulado
(teste)", o aviso vermelho, a constante `MFV_SIMULADO` e a função `mfvAlternarSimulado`, e os
rótulos "SIMULADO" dos cards e caixas. A linha única do topo ficou com os 9 cards vazios ("—")
esperando a medição de campo do Rafael. O resto do painel (filtros, caixas de dados, fila, pedido
a pedido, linha do tempo) não mudou. Nenhuma outra tela foi tocada; nada no banco.

---

## 2026-09-30 — painel MFV: linha única no topo, resto recolhido

Só na aba Fluxo do Pedido (MFV). O topo virou UMA linha: espera para separar, separação, bipagem,
espera do caminhão, carregamento, rota total, e à direita agrega valor, não agrega e total. Os
números são a MÉDIA DE 30 DIAS SIMULADOS (420 pedidos, Petrolina + Juazeiro), escritos direto no
HTML, e a tela diz que é simulado. Todo o painel anterior (filtros, caixas de dados, fila, pedido a
pedido, linha do tempo) continua igual, dentro de "Mapa completo", fechado por padrão. Nenhuma
função JS mudou e nenhuma outra tela foi tocada.

---

## 2026-09-29 — painel MFV: botão "Ver dia simulado (teste)"

Só na aba Fluxo do Pedido (MFV). O botão carrega nas caixas de dados um dia GERADO por script
(14 pedidos, calibrado pelos agregados de julho/2026) para testar o modelo do mapa. Fica em
memória: **não grava nada no banco** (`salvarMFVCampos` recusa enquanto a simulação está ligada)
e um aviso vermelho diz que não é medição. Desligado, o painel é o mesmo de antes. Nenhuma
outra tela foi tocada.

---

## 2026-08-31 e 2026-09-01 — painel MFV (Mapeamento do Fluxo de Valor)

`7fc604f` `8441e0f` `70acf5d` `771580d` `b7c4072` `a54ce82` `a375515` `da21836` `8182303` `a7b85fe`

Painel novo (Fluxo do Pedido) que mede lead time real por etapa, estoque entre etapas e gargalo,
pedido a pedido. Quatro erros de medição foram achados e corrigidos no caminho — o mais relevante
para vocês: **`PETROLINA` e `Petrolina` são valores distintos no cadastro de rotas**, e sem
normalizar caixa/acento 38% do que o painel chamava de "externa" era interna. Prazo e
classificação passaram a vir do cadastro `rotas`, não mais chumbados no código.

`6c06c12` deixou **7 perguntas de verificação** em `PERGUNTAS-RAFAEL-MFV.md`. Nenhuma pede
implementação — pedem conferência no código e resposta escrita no próprio arquivo.

## 2026-08-20 a 2026-08-22 — auditoria de 5 agentes e 13 correções em produção

`dec55ee` `cee3f76` `6b60e98` `305ac52` (documentação) + as correções:

- `b454701` **carga 100% devolvida pagava integral** e havia **pagamento em duplicidade**.
- `d75aae5` **rota externa (R.E.) pagava R$ 0** — `lancar()` passou a derivar a rota.
- `97eb667` guardas contra perda de dado no loop de promoção de 5s.
- `b23129a` **chave da API do ERP estava literal no repo** (que é público) — virou fail-fast por env.
- `6ebacc3` **guarda de sanidade antes do deploy**: o deploy não tinha verificação nenhuma e já
  derrubou a produção uma vez (`7005a8f`, truncamento do `index.html`).
- `31c6af6` não deslogar no deploy, confirmação antes de apagar mês de OTIF, contraste no tema escuro.
- `0a5e054` `0ca8aa8` `6852705` performance de startup e limpeza.

O relatório inteiro, com `arquivo:linha` e o que é código × o que é banco, está em
`AUDITORIA-SEGURANCA-2026-08-20.md`. **O achado que continua aberto e é do dono decidir:** o app
não tem controle de acesso server-side (sem RLS, sem Supabase Auth, senha em texto puro).
⚠️ Não marcar "Enable RLS" no Supabase antes de migrar a autenticação — derruba o app inteiro,
porque todo request usa a mesma chave `anon` e não existe identidade para a policy avaliar.

`305ac52` é uma **retratação**: uma das conclusões da auditoria (Q7, truncamento) estava errada e
foi corrigida no próprio documento.

## 2026-06-16 e 2026-06-17 — atalho para o Gestor de Tarefas

`0bb7a34` `55b1d78` `c7c3cad` — botão e tile no topo, ligando o Cronos ao Gestor de Tarefas.
Mudança visual, sem efeito em dado.
