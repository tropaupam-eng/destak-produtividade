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
