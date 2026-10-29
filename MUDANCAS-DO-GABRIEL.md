# Mudanças feitas pelo Gabriel neste repo — registro para quem (ou qual IA) vier depois

> O Gabriel é colaborador aqui. Este arquivo existe para que nenhuma mudança dele chegue sem
> explicação: o que foi tocado, por quê, como desfazer e o que ficou pendente.
> **Regra:** toda mudança entra aqui, no mesmo commit, com uma entrada no TOPO.
> Commits do Gabriel começam com "Gabriel:". Autor no Git: Gabriel (armazem@destakprime.com).
> `git log --author=armazem@destakprime.com` traz o mesmo em bruto.
> O registro do Rafael é outro arquivo: `MUDANCAS-DO-RAFAEL.md`.

## Formato de cada entrada

    ## AAAA-MM-DD, Gabriel: <o que mudou, uma linha>
    Onde: arquivo/função/tabela. Por quê.
    Como desfazer: <commit a reverter ou SQL inverso>.
    Pendente/risco: <se houver>.

Mudou dado no Supabase? Registre também: tabela, chave e valor anterior (a linha original
fica salva antes do UPDATE/DELETE).

Se algo quebrar: registrar aqui o erro, a data, o commit culpado e o `git revert` proposto.

---

## 2026-10-29, Gabriel: nova aba "Histórico - crédito manual" em Distribuição — v4.89.99 (NÃO publicar antes da tabela)
Onde: `index.html`: item novo no menu Distribuição (`data-page="credito-manual"`, só `admin` por padrão), página
`page-credito-manual` (antes de `page-geral`), rota em `showPage`, entradas em `PAGINAS` e `PAGINAS_GRUPOS` (para liberar
a outros perfis pela tela de Perfis) e o bloco de funções `cm*` / `carregarCreditoManual` / `renderCreditoManual` (antes de
`renderFrotaStatus`). `APP_VERSION` e `version.json`: 4.89.95 → 4.89.99 (97 = aviso de pedido cancelado; 98 = evidência por foto; 99 = ícone do calendário claro).
Por quê: pedido do Gabriel: aba para lançar crédito manual por pedido. Digitados: pedido, valor do crédito manual e peso
faltante (kg). Preenchidos pelo ERP a partir do pedido, e editáveis: código do cliente, valor do pedido, data de emissão
da nota e número da nota (`pedidos_info_erp`: codigo_cliente, valor, emissao, nota_fiscal; se o pedido não estiver lá,
usa o valor de `base_data`). Pedido sem nota (cancelado, DI...) ou anterior a 01/05/2026 fica para preencher à mão; a tela
avisa. Campo de data com ícone do calendário claro no tema escuro (classe cm-data, mesmo padrão do devol-data; também no campo de data da janela Editar ocorrência). Campo OBRIGATÓRIO "Evidência enviada por foto? Sim/Não" (dois botões, nada marcado por padrão; grava evidencia_foto true/false; a lista mostra a coluna, — nos lançamentos sem o dado). Pedido CANCELADO no ERP (situação CA) mostra um aviso vermelho junto do nome do cliente, SEM bloquear (no ERP há 447 pedidos CA que já tinham nota emitida: pode haver crédito em pedido faturado e depois cancelado). Lista o histórico (500 mais recentes) com total de crédito.
TABELA NOVA (ESTRUTURA DE BANCO, quem cria é o Daniel; sem RLS): `credito_manual_historico`
  id uuid primary key default gen_random_uuid(), codigo_cliente text, pedido text not null, valor_credito numeric(12,2)
  not null, valor_pedido numeric(12,2), data_emissao date, numero_nota text, peso_faltante numeric(12,3),
  criado_em timestamptz not null default now(), criado_por text, evidencia_foto boolean.
  (se a tabela JÁ foi criada sem a última coluna: alter table public.credito_manual_historico add column evidencia_foto boolean;)
Sem a tabela, a aba abre e avisa "tabela ainda não existe"; salvar mostra aviso claro. Nada foi gravado no banco.
Dinheiro: lança valores de crédito (só registro/histórico, sem pagamento nem cálculo financeiro). Avisar o Daniel antes de
publicar (estrutura de banco + valores em R$).
Testes: `node check.js` ok; 43 testes de lógica (parser de valores, preenchimento automático, corrida de buscas, validações,
payload do POST, tabela inexistente, lista, escape de HTML). Testes antigos t3/t4/r/t6 falham igual na main (faltava o
`_ic` no ambiente de teste), não por esta mudança. Sem teste com a tabela real (ainda não existe).
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: Daniel criar a tabela; teste visual do Gabriel em localhost; decidir quem mais vê a aba (hoje só admin).
## 2026-10-26, Gabriel: botão "Editar" nas ocorrências de Distribuição (Lançamento) — v4.89.79
Onde: `index.html`: `renderOcorrenciasLanc` (botão "✏️ Editar" abaixo de "Marcar Resolvida", também nas resolvidas) e
funções novas `_podeEditarOcorrencia`, `editarOcorrenciaLanc`, `salvarEditarOcorrencia`, `fecharEditarOcorrencia`,
`_eoDiaBRT` (logo antes de "ABAS LANÇAMENTO"). `APP_VERSION` e `version.json`: 4.89.78 → 4.89.79.
Por quê: pedido do Gabriel: poder editar ocorrências já lançadas. Quem vê o botão: usuários admin e o perfil
"Devolução" (chave `devolu__o`, hoje 1 usuário). Os outros perfis não veem.
O que edita (janela própria, tema claro/escuro): motivo, rota, observação, data da ocorrência e a QUANTIDADE de cada
produto devolvido. NÃO troca pedido, nem total/parcial, nem produtos (primeira versão, "aos poucos"). Só envia ao banco o
que mudou: motivo novo atualiza `motivo_id`, `motivo_nome` e `tipo` (mesma regra do registro: vem do impacto no OTIF do
motivo); data nova grava meio-dia de Brasília; quantidade nova atualiza o item, a `quantidade` da ocorrência e, só se os
itens tiverem valor unitário, `valor_total`/`valor_devolvido` (os lançados desde 18/09 não têm preço: não mexe). Se
falhar no meio, os itens já alterados voltam à quantidade original.
Dados em produção: faz PATCH em `ocorrencias_distribuicao` e `ocorrencias_distribuicao_itens` (só linhas da ocorrência
aberta; nenhum DELETE, nenhuma coluna/tabela nova). NÃO há histórico do valor anterior (guardar "editado por/em" exigiria
coluna nova: precisa falar com o Daniel antes). A permissão é só da tela (tabelas sem RLS, como o resto do sistema).
Testes: `node check.js` ok; 43 testes de lógica (permissões, botões, só o que mudou vai ao banco, validações, desfazer em
caso de falha) e regressão passando. Não testado com login real (não tenho acesso): teste visual do Gabriel.
Como desfazer: `git revert` do commit desta entrada (edições já salvas pelo botão ficam como estão no banco).
Pendente/risco: teste visual em localhost (como admin e, se possível, com o usuário do perfil Devolução); decidir se
entra edição de pedido/total-parcial/produtos e se o Daniel aprova guardar quem editou e quando.
## 2026-10-26, Gabriel: gráfico de linhas por tipo de unidade volta ao Dashboard Devolução, com balão protegido — v4.89.78
Onde: `index.html` e `version.json` (4.89.77 → 4.89.78). Mescla a branch `gabriel/dashboard-devolucao-filtro-setor`
(commits 7d36f5b, e1338b1, 7bd77c5: gráfico "Devoluções por tipo de unidade", 4 linhas + "Outros", botões Dia/Semana,
detalhes na entrada de 27/10 logo abaixo) sobre a main com a proteção dos balões da v4.89.77. Único conflito: este
arquivo de registro (mantidas as duas entradas).
Causa do erro do Log ("Cannot read properties of undefined (reading 'dataIndex')"): ACHADA e REPRODUZIDA com mouse real
no Chart.js 4.4.1. O gráfico de linhas esconde do balão os valores zero (`filter: item.raw > 0`); ao passar o mouse
num dia sem nenhuma devolução, a lista do balão vem VAZIA e `title: c => ...c[0].dataIndex` estoura. Esse era o
gatilho que eu não tinha achado na v4.89.77 (que só protegeu as barras).
Correção: `title`, `afterLabel` e `footer` do gráfico de linhas devolvem texto vazio quando não há item. Testado: o
código sem proteção gera o erro ao passar o mouse nos dias zerados; o protegido não gera nenhum.
Testes: `node check.js` ok; testes de lógica e de dados reais do dashboard (linhas, barras, setor, datas) e de
regressão passando.
Como desfazer: `git revert` do commit desta entrada (volta a v4.89.77, sem o gráfico de linhas).
Pendente/risco: teste visual do Gabriel em localhost (passar o mouse em dias com e sem devolução, Dia/Semana, trocar
datas, clicar na rosca) e conferir o Log de Erros antes de publicar.
## 2026-10-26, Gabriel: proteção dos balões (tooltip) dos gráficos de barras contra lista vazia — v4.89.77
Onde: `index.html`: Dashboard Devolução, função `barras()` (callbacks `title` e `afterLabel` do balão); mesma proteção em
dois balões de outras telas que assumiam `items[0]`: gráfico de pedidos por placa (`title` e `footer`, `totaisPorPlaca`)
e o footer "Atendimento" (`semData`). Só retornam texto vazio quando não há item; nada mais mudou. `APP_VERSION` e
`version.json`: 4.89.76 → 4.89.77.
Por quê: Log de Erros (dash-devolucao, 26/10, 4 ocorrências no localhost): "Cannot read properties of undefined
(reading 'dataIndex')" no `title` do balão, que assumia que a lista do balão nunca vem vazia.
Reprodução: NÃO consegui reproduzir. Numa página isolada (Chart.js 4.4.1, mesmas opções, mouse parado sobre a barra,
gráfico redesenhado com menos itens e com zero itens) o erro não aparece, nem com o código antigo. A linha do erro
(25904) não bate com a main, então o gatilho provável é um rascunho local não enviado. Confirmado só que o callback
antigo estoura com lista vazia e o novo devolve texto vazio. Por isso NÃO adiei o redesenho com `setTimeout` (só se a
reprodução apontasse para isso). Se o erro voltar no site publicado, anotar aqui e investigar o gatilho.
Dados: nada no Supabase foi lido ou alterado; erros do Log não foram marcados como resolvidos.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel em localhost (passar o mouse nas barras, mudar datas, clicar na rosca,
Limpar filtros) e conferir o Log de Erros antes de publicar.
## 2026-10-26, Gabriel: publicação do Dashboard Devolução (setor + barras), SEM os gráficos de linha — v4.89.76
Onde: `index.html` e `version.json` (4.89.75 → 4.89.76; `APP_VERSION` igual). Entram: clique no setor filtra os
motivos, correção do erro no clique da rosca, tabelas removidas de baixo das roscas, barras por conferente (Armazém) e
por vendedor (entradas já registradas abaixo, de 24/10 e 26/10).
Por quê: decisão do Gabriel: os gráficos de linha (por dia e por tipo de unidade) ficam em stand by, precisam de mais
trabalho. Eles continuam só na branch `gabriel/dashboard-devolucao-filtro-setor` (commits 7d36f5b, e1338b1, 7bd77c5) e
as entradas de 27/10 delas NÃO foram publicadas; ao retomar, mesclar essa branch de novo na main.
Método: branch nova `gabriel/devolucao-sem-linhas` a partir da main (já com 4.89.75 do Cargas Pendentes), mesclando o
commit 989b4cc; único conflito foi a versão (resolvido para 4.89.76). `node check.js` ok; conferido que o código das
linhas não está no arquivo.
Como desfazer: `git revert` do commit de mesclagem desta entrada.
Pendente/risco: conferir o site publicado depois do deploy do Pages.
## 2026-10-27, Gabriel: Dashboard Devolução — gráfico de linhas "Devoluções por tipo de unidade"
Onde: `index.html`: no markup, linha `devol-grid3` (largura toda) com o gráfico, legenda própria, botões "Dia / Semana"
e nota; em `carregarDashDevolucao` (busca dos itens devolvidos e da unidade de venda de cada item); em
`renderDashDevolucao` (agrupamento e desenho); estado/funções `_devolItens`, `_devolRefPorPedido`, `_devolPedidosRef`,
`_devolGranul`, `DEVOL_UNID_TRECHO`, `_devolTipoUnidade`, `DEVOL_SERIES_UNID`, `devolGranul`. Mesma versão (4.89.74,
ainda não publicada).
Por quê: pedido do Gabriel: uma linha para cada tipo de unidade (Saco, Caixa, Pacote, Fardo), no lugar do gráfico
"Devoluções por dia". Os demais tipos (Milheiro, Quilo, Unidade, não classificados...) entram numa linha cinza
"Outros"; o balão mostra quais. Cada linha está na unidade do seu tipo (sacos, caixas...), então as alturas não se
comparam entre linhas. Dia = data da ocorrência (fuso de Brasília); "Semana" agrupa de segunda a domingo. Eixo
contínuo (períodos vazios = 0). Respeita o filtro de datas; não depende do setor clicado nas roscas. Só o ponto mais
alto leva o número escrito; o balão mostra o período, as quantidades e o nº de ocorrências.
Classificação: a unidade vem da referência do item no ERP (pedidos_itens_erp.referencia), pelo primeiro trecho
("CX C/16PCT" = Caixa, "SC C/20KG" = Saco, "FD C/2PCT" = Fardo, "PCT..." = Pacote; "P/X" vale X). Mesmas regras da aba
Regras do Excel "Devolucoes_por_tipo_de_unidade" entregue ao Gabriel. Ocorrência sem itens detalhados (as antigas) e
com data impossível (ano 0026) ficam fora; a nota embaixo avisa. Removido o seletor antigo "Caixas / Todos os volumes".
Dados (só leitura): ocorrencias_distribuicao_itens e pedidos_itens_erp (referências em lotes de 60 pedidos, guardadas
na sessão). Nenhuma coluna nova, nenhum dado alterado.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel em localhost antes de publicar. A busca de referências cresce com o nº de
ocorrências (o cache de sessão ajuda).

## 2026-10-26, Gabriel: Dashboard Devolução — barras por conferente (Armazém) e por vendedor
Onde: `index.html`: no markup, nova linha `devol-grid2` com 2 cards; em `carregarDashDevolucao` (colunas novas na
leitura de ocorrências + busca do vendedor dos pedidos); em `renderDashDevolucao` (desenho das barras); estado
novo `_devolPedVend`, `_devolNomeVend`, `DEVOL_MOTIVOS_VENDEDOR`, `_devolEhMotivoVendedor`. Mesma versão (4.89.74,
ainda não publicada).
Por quê: pedido do Gabriel. (1) "Erros por conferente": barras HORIZONTAIS com as ocorrências cujo motivo é do
setor Armazém (Falta no Carregamento, Inversão no Carregamento, Sobra de Produto), por conferente. (2) "Erros por
vendedor": barras VERTICAIS só das ocorrências com os motivos Forma de Pagamento Incorreto, Pedido Digitado com a
Quantidade Incorreta e Pedido Duplicado - Comercial (comparados pelo nome do motivo), por vendedor do pedido.
Ambos respeitam o filtro de datas; clicar num setor nas roscas NÃO mexe neles. Número escrito no fim de cada barra;
o balão do vendedor detalha por motivo. Mais de 15 vendedores: 14 maiores + "Outros (n vendedores)" em cinza.
De onde vêm os dados (só leitura): conferente = coluna `conferente` da própria ocorrência (as buscas de reserva
por pedido em `conferencia_pedidos` e por carga em `atribuicoes_armazem` não acharam nada nas ocorrências do
Armazém); vendedor = `pedidos_info_erp.vendedor` (código; reserva `base_data.vendedor_cod`) e o nome vem de
`usuarios` (perfil vendedor, `codigo_vendedor`). Buscas só dos pedidos dos 3 motivos, em lotes de 150. Nenhuma
coluna nova e nenhum dado alterado.
Atenção aos dados (leitura de 26/10): das 16 ocorrências do Armazém, só 6 têm conferente gravado (3 de Jacson Alves
da S. Lima, 3 de Jaqueline Lopes da Silva); as outras 10 aparecem como "Sem conferente registrado" (barra cinza).
Os 21 pedidos dos 3 motivos têm vendedor (12 vendedores, todos com nome no cadastro).
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel em localhost antes de publicar. Conferido numa tela de teste com o código
real e dados reais.

## 2026-10-24, Gabriel: Dashboard Devolução — clicar num setor filtra os motivos de devolução
Onde: `index.html`: `renderDashDevolucao` reescrita (mesma tela, agora com seleção), funções novas
`devolSelecionarSetor` e `devolLimparSetor`, estado `_devolSetorSel`; no markup, título/subtítulo dinâmicos e o
botão "Limpar filtros" do card "Motivos de devolução". `version.json` e `APP_VERSION` 4.89.73 → 4.89.74.
Por quê: pedido do Gabriel. Clicar numa fatia de "Motivos por setor" (ou na legenda, ou na linha da tabela) mostra
no gráfico "Motivos de devolução" só os motivos daquele setor; o título vira "Motivos de devolução — Comercial",
o subtítulo diz quantas ocorrências são do setor, e as porcentagens passam a ser sobre o total do setor (somam
100%). A rosca de setor continua com todos os setores: a fatia escolhida sai do anel e as outras esmaecem. Clicar
de novo na mesma fatia, ou em "Limpar filtros", volta ao total. "Sem motivo" também seleciona. A seleção convive
com o filtro de datas (se o setor não tem ocorrência no período novo, a seleção é solta) e zera ao reabrir a aba.
Cada motivo mantém a mesma cor com e sem filtro. Só leitura: nenhuma consulta nova, nenhum dado alterado.
Como desfazer: `git revert` do commit desta entrada.
Erro meu, achado no teste local do Gabriel e corrigido antes de publicar (nunca foi pra `main`): o 1º commit desta
entrada (9ac4e33) redesenhava as roscas DENTRO do onClick do próprio gráfico; o Chart.js seguia tratando o clique
num gráfico já destruído e lançava "Cannot read properties of undefined (reading 'handleEvent')", que o Log de Erros
registrou como "Script error." (JS Error, página dash-devolucao, usuário Gabriel, 23/10 10:57 e 10:58, versão
4.89.74, localhost:8080). Correção: o redesenho roda depois do clique (setTimeout 0). Conferido no navegador com
clique de verdade: sem nenhum erro. Esses 2 registros no Log de Erros são do teste; o Gabriel pode marcá-los como
resolvidos pelo botão da própria tela.
Também (pedido do Gabriel, pra aproveitar o espaço): saíram as tabelas com quantidade e % que ficavam embaixo das
duas roscas, e o gráfico ficou mais alto (280 → 340 px). A % continua escrita em cada fatia e a quantidade aparece
no balão ao passar o mouse; a seleção de setor segue pela fatia e pela legenda à direita. Efeito conhecido: os
motivos que ficam dentro de "Outros" deixaram de aparecer listados em algum lugar (antes estavam na tabela).
Pendente/risco: teste visual do Gabriel em localhost antes de publicar. Conferido numa tela de teste com o código
real e dados reais, com clique de verdade na fatia.

## 2026-10-23, Gabriel: nova aba "Dashboard Devolução" em Análise (duas roscas)
Onde: `index.html`: item novo no menu Análise (`data-page="dash-devolucao"`, depois do Gerot); página
`page-dash-devolucao`; `showPage` (rota nova); funções novas `carregarDashDevolucao`, `renderDashDevolucao`,
`_devolSetorDe` e as constantes `DEVOL_*`; permissão: `PAGINAS`, `PAGINAS_GRUPOS` e as listas padrão de
`PERFIS_PADRAO_SISTEMA` de adm_distribuicao, exped_admin e adm_armazem (admin vê tudo). `version.json` e
`APP_VERSION` 4.89.72 → 4.89.73.
Por quê: pedido do Gabriel. Duas roscas com as ocorrências de Distribuição › Ocorrências: (1) motivos por setor
(Armazém, Distribuição, Comercial, Mercado, Logística, mais "Sem motivo") e (2) motivos de devolução (os 5 maiores
+ "Outros"; a tabela embaixo lista todos). Período = campos "Data inicial" e "Data final" (pedido do Gabriel, no
lugar do seletor de período); vazio = sem limite, as duas pontas são inclusivas, a data da ocorrência é a de
Brasília, intervalo invertido mostra aviso, botão "Limpar datas" aparece quando há data. Com data no filtro,
ocorrência de data impossível (ano 0026) fica de fora; sem filtro, conta no total. Tooltip com quantidade e %.
Os campos de data usam `color-scheme` escuro (claro no tema claro) pra o ícone do calendário aparecer branco, e
não preto, no tema escuro. Só nesses dois campos; os outros campos de data do app não foram mexidos.
Formato (pedido do Gabriel, referência de um gráfico do Power BI): rosca grossa, só a PORCENTAGEM (2 casas) de
cada fatia escrita fora do anel com linha de ligação, legenda (bolinha + nome) à direita, sem número no centro
(o total fica no topo); a tabela com quantidades continua abaixo de cada rosca. Rótulos vizinhos são afastados
pra não se sobrepor. Conferido numa tela de teste com o código real e os dados reais, no tema escuro e no claro.
Cores: paleta categórica validada (script de validação passou nos dois temas, nas superfícies reais do app);
cada setor tem sempre a mesma cor; rosca com no máximo 6 fatias.
Só LEITURA: lê `ocorrencias_distribuicao` (id, motivo_id, motivo_nome, criado_em) e `motivos_devolucao` (id, nome,
setor). Nenhuma coluna nova, nenhum dado alterado, sem dinheiro.
Observação de dado: existe uma ocorrência com a data de registro no ano 0026 (erro de digitação); com data no
filtro ela fica de fora, e sem filtro conta no total. Não corrigi (seria alterar dado de produção).
Publicado na `main` em 2026-10-23 (commits ee4a596, b4f7b42, cba7d26, fc55717), versão 4.89.73. Antes: revisão do
diff (só a aba nova, a versão e as 3 listas de perfis; nenhum padrão de risco, todo texto do banco passa por
`escapeHtml`), `node check.js` ok, testes de lógica com dados reais e teste visual do Gabriel em localhost. Depois:
deploy do Pages concluído com sucesso e `index.html` do site idêntico, byte a byte, ao do commit fc55717.
Como desfazer: `git revert fc55717 cba7d26 b4f7b42 ee4a596` (nessa ordem) e subir `version.json`/`APP_VERSION`.
Pendente/risco: perfis com permissão customizada em Cadastro › Perfis podem precisar marcar a página nova.

## 2026-10-21, Gabriel: Ocorrências (Distribuição) — selo em destaque mostra o setor do motivo
Onde: `index.html`: `_renderOcorrenciasGeneric` (selo ao lado de "Pedido #..."), `carregarOcorrenciasDistrib`
(lê `motivos_devolucao` uma vez por carga da lista, só `id,nome,setor`), variável nova `_ocorrSetorPorMotivo`.
`version.json` e `APP_VERSION` 4.89.71 → 4.89.72.
Por quê: pedido do Gabriel. O primeiro selo mostrava o tipo de OTIF (Inversão, Falta, Erro do Vendedor...);
agora mostra o setor do motivo (📦 Armazém, 💼 Comercial, 🏪 Mercado, 🚚 Distribuição, 🚛 Logística), com os
mesmos nomes do select do formulário. O segundo selo (↩️ nome do motivo) continua igual.
Ocorrência sem motivo gravado (ou com motivo que não existe mais) mantém o selo de tipo, pra não ficar sem nada.
Setor vem do cadastro de motivos (por `motivo_id`, e pelo nome quando não há id): nenhuma coluna nova e nenhum
dado alterado. Na leitura de 20/10: 83 das 86 ocorrências resolvem setor; 3 não têm motivo e ficam com o tipo.
O campo `tipo` continua sendo gravado e usado normalmente pelo OTIF; só deixou de aparecer nesse selo.
Sem dinheiro, pagamento nem banco estrutural.
Como desfazer: `git revert` do commit desta entrada.
Publicado na `main` em 2026-10-21 (commit be599cc), versão 4.89.72. Antes: `node check.js` ok, testes de lógica
fora do navegador e teste visual do Gabriel em localhost ("tudo certo"). Depois: deploy do Pages concluído com
sucesso e `index.html` do site idêntico, byte a byte, ao do commit be599cc.
Como desfazer: `git revert be599cc` e subir `version.json`/`APP_VERSION`.
Pendente/risco: nenhum conhecido.

## 2026-10-20, Gabriel: Absenteísmo — botão "Limpar filtros" nas barras semanais e mensais
Onde: `index.html`: `renderRelatorioAbsenteismo` (cabeçalho EVOLUÇÃO SEMANAL), `_renderCardVisaoAnualPercentual`
(cabeçalho EVOLUÇÃO MENSAL), helper novo `_absBtnLimparFiltros`, e `baixarImagemRelatorio` (a linha
`ignoreElements`, para o botão não sair na imagem exportada pra slide). `version.json` e `APP_VERSION`
4.89.70 → 4.89.71.
Por quê: pedido do Gabriel, complemento da seleção múltipla. O botão "✕ Limpar filtros" aparece ao lado de
EVOLUÇÃO SEMANAL/MENSAL só quando há barra selecionada, remove a seleção e volta pro mês/ano inteiro.
Vale em todas as abas de Absenteísmo, inclusive Distribuição. Outras Visões Anuais (Frotas, Custo etc.)
não mudam. O link "✕ ver mês/ano inteiro" do card da direita continua existindo.
Sem mudança em dado do Supabase. Sem dinheiro, pagamento nem banco.
Como desfazer: `git revert` do commit desta entrada.
Publicado na `main` em 2026-10-20 (commit 6fc08c6), versão 4.89.71. Antes: `node check.js` ok, testes de
lógica fora do navegador e teste visual do Gabriel em localhost (o botão só aparece com barra selecionada,
por projeto; o Gabriel chegou a testar sem selecionar e achou que faltava). Depois: deploy do Pages concluído
com sucesso e `index.html` do site idêntico, byte a byte, ao do commit 6fc08c6.
Como desfazer: `git revert 6fc08c6` e subir `version.json`/`APP_VERSION`.
Pendente/risco: nenhum conhecido.

## 2026-10-20, Gabriel: Absenteísmo — seleção de várias semanas e meses nas barras (Ctrl/Shift+clique)
Onde: `index.html`, abas Absenteísmo Expedição, Receb./Armazenagem e Armazém (mesmo código).
Barras semanais: `carregarPainelAbsArea`, `_toggleSemanaAbsInd` (e wrappers `_toggleSemanaAbsInd_abs_*`),
`renderRelatorioAbsenteismo`, `_listarColaboradoresOcorrenciaAbs`, `_calcDiaSemanaMaisOcorrencias`.
Barras mensais (Visão Anual): `_toggleMesAbsAno` (e wrappers), `_renderBarrasMensaisAno`,
`_renderCardVisaoAnualPercentual`, `carregarPainelAbsAreaAno`, `_calcAbsenteismoAno` (porMes ganhou `diasTrab`).
Helpers novos: `_absSelArr`, `_absSelToggle` (regra única), `_absResumoMesesSel`.
`version.json` e `APP_VERSION` (index.html) 4.89.69 → 4.89.70.
Erro meu, corrigido antes de publicar (só existiu na branch, nunca na `main`): o commit 2ecd6c2 apagou
sem querer a linha que inicializa `window._absAnoMesSelPorPrefixo`, e a Visão Anual mostrava "Cannot read
properties of undefined (reading 'abs-exp')"; também faltou subir `APP_VERSION`, e o app mostrava o aviso
"Nova versão 4.89.70 disponível" sem parar. Achado no teste local do Gabriel; correção no commit seguinte.
Por quê: pedido do Gabriel, comportamento parecido com o Power BI. Clique = uma semana (como antes);
Ctrl/Cmd+clique soma ou tira uma semana; Shift+clique pega o intervalo. Barras fora da seleção ficam
esmaecidas. Com 2+ semanas, COMPOSIÇÃO, lista de colaboradores e gráfico por dia da semana somam só
essas semanas; o percentual é ponderado (faltas+atestados ÷ dias trabalhados somados), não a média.
ACUMULADO NO MÊS continua sempre o mês inteiro. Sem botão para tablet/TV, por decisão do Gabriel.
Na Visão Anual, vários meses somam faltas, atestados e dias da semana; o percentual é ponderado pelos
dias trabalhados; ACUMULADO NO ANO continua sempre o ano inteiro.
A aba Distribuição NÃO foi alterada (semana e mês continuam um por vez). Outras Visões Anuais (Frotas etc.) idem.
Sem mudança em dado do Supabase: só leitura, nenhuma tabela ou coluna alterada.
Como desfazer: `git revert` do commit desta entrada.
Publicado na `main` em 2026-10-20 (commits 3b36611, 2ecd6c2, d1aecb4), versão 4.89.70. Antes: `node check.js`
ok, testes de lógica fora do navegador e teste visual do Gabriel em localhost. Depois: deploy do Pages concluído
com sucesso, e o `index.html` do site é idêntico, byte a byte, ao do commit d1aecb4 (versão 4.89.70 no ar).
Como desfazer tudo: `git revert d1aecb4 2ecd6c2 3b36611` (nessa ordem) e subir `version.json`/`APP_VERSION`.
Pendente/risco: nenhum conhecido. A Distribuição ficou de fora de propósito.
Sem dinheiro, pagamento nem banco, então não exige aviso prévio ao Daniel.

## 2026-10-15, Gabriel: regras de publicação definidas pelo Daniel (opção A)
Onde: processo de trabalho, não há mudança de código. Resposta do Daniel, repassada pelo
Gabriel no chat (o texto original não está neste repositório).
Regra: pode publicar direto na `main`, desde que (1) `node check.js` passe antes de cada
publicação, (2) cada mudança seja registrada aqui com commit e motivo, e (3) depois de
publicar, confira que o site abriu e que a tela mexida funciona.
Avisar o Daniel ANTES de publicar se mexer em pagamento, dinheiro, estrutura do banco ou
apagar dados em massa. Edge Functions: avisar antes, ele libera deploy e secrets pelo painel.
Supabase: acesso ao projeto ainda a definir pelo Daniel; até lá, só a chave `anon` do app.
Como desfazer: não se aplica (é regra de processo).
Pendente/risco: `git revert` desfaz código, não dado. Antes de UPDATE/DELETE em produção,
salvar a linha original e anotar aqui.

## 2026-10-15, Gabriel: acesso configurado e este registro criado
Onde: este arquivo e uma linha de aviso no topo do `CLAUDE.md` apontando para ele. Nenhum código nem dado do Supabase foi alterado. Teste de escrita no
GitHub feito com a branch `gabriel/teste-acesso`, já apagada do remoto.
Por quê: abrir o registro de autoria do Gabriel.
Como desfazer: apagar este arquivo.
Pendente/risco: convite ao projeto Supabase `hiydkyslgiomdyginfdx` ainda depende do Daniel.
