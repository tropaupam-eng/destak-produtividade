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

## 2026-11-12, Gabriel: Ocorrências › Inversão no Carregamento: campos "Produto que foi (código)" e "Quantidade que foi" — v4.89.283
Onde: `index.html`, Distribuição › Ocorrências › Registrar Ocorrência. Quando o motivo é "Inversão no Carregamento" (por nome, sem acento) aparece um bloco com "Produto que foi (código) *" e "Quantidade que foi *"
onde o operador digita o código e a quantidade do produto carregado no lugar; o produto que DEVIA ter ido continua sendo escolhido na lista da devolução. A descrição é buscada em
`pedidos_itens_erp.mercadoria` (código do ERP, ex.: "794.0" = SACOLA PTP REC VD 40X50 M; digitar "794" também acha) e mostrada em verde; código não achado grava só o código (aviso âmbar); caracteres fora de
letras/números/ponto/hífen são recusados. Código E quantidade (> 0, vírgula aceita) são obrigatórios SÓ nesse motivo. SUBITENS: existem 516 códigos com subitem e "913.0" e "913.1" são produtos DIFERENTES
(HAMBURGUEIRA ULTRA H03 100UN × BR 200UN); digitar "913" usa o ".0", mas AVISA em âmbar que também existe o ".1"; se só existir um "913.x" usa esse; se houver vários e nenhum ".0", NÃO escolhe e pede o código completo.
Funções novas: `_ocorrEhInversaoCarregamento`, `_ocorrMotivoMudou`, `_ocorrProdEnviadoDigitou`, `_ocorrBuscarProdEnviado`, `_ocorrLimparProdEnviado`, `_ocorrQtdProdEnviado`; alterados `salvarOcorrenciaLanc` e o card da
lista (`_renderOcorrenciasGeneric`: linha "Foi: <código> · <descrição> × <qtd>"). `APP_VERSION`/`version.json` 4.89.281 → 4.89.283.
BASE DE PRODUTOS: não existe cadastro de produtos no banco; a fonte é `pedidos_itens_erp` (itens dos pedidos do ERP desde 17/08/2026: 236.065 linhas, 5.525 códigos distintos, todos com descrição). Produto que nunca
apareceu em pedido desde agosto não é achado (grava só o código).
ESTRUTURA DE BANCO (quem cria é o Daniel ou quem tem acesso ao SQL Editor): arquivo `supabase/migrations/20261112_ocorrencias_produto_enviado.sql` adiciona 3 colunas opcionais em
`ocorrencias_distribuicao`: `produto_enviado_codigo`, `produto_enviado_descricao` e `produto_enviado_quantidade numeric(12,3)` (IF NOT EXISTS, sem RLS, não altera dado existente; quem já rodou a versão de 2 colunas roda de novo
e só cria a que falta). Conferido por leitura em 12/11: as colunas AINDA NÃO existiam.
Salvaguarda: outros motivos NÃO enviam as colunas novas (cadastro igual ao de sempre, independe da coluna); se a coluna não existir quando o motivo for Inversão, o formulário NÃO trava: registra e grava a
informação na observação ("Produto que foi: 794.0 - ... (qtd 3)"), avisando o operador. Não foi gravado nenhum dado de teste no banco.
Não feito (não pedido): mostrar o "produto que foi" no modal Editar da ocorrência e nos gráficos do Erro Conferente/Devolução.
Como desfazer: `git revert` do commit desta entrada; se as colunas forem criadas e precisarem sair: ALTER TABLE ... DROP COLUMN (só se vazias).
Pendente/risco: Daniel/o Gabriel rodar o SQL antes de publicar; avisar o Daniel (estrutura de banco).

## 2026-11-11, Gabriel: Erro Conferente: produtos, tipo do erro e por dia contam TODAS as ocorrências de Armazém — v4.89.277
Onde: `index.html`, `_errconfPassa(r, f, ign, todos)` (4º parâmetro novo) e `_errconfRender`. Os gráficos "Produtos com mais erros", "Tipo do erro" e "Erros por dia" (e a rosca de motivos) passam a incluir, por padrão,
também as ocorrências SEM conferência vinculada (antes só as atribuídas a conferente, com OK dele). Motivo: pedido do Gabriel ("a Frutas Cristalizada tem duas ocorrências e quando o gráfico fica normal não aparece";
"a ordem do maior para o menor é pela frequência de ocorrências"): uma das 2 era sem conferência e sumia no estado normal. A ordem dos produtos segue frequência de ocorrências (maior para menor), com quantidade devolvida
e nome só como desempate. Com os dados reais (01/10 a hoje, 36 ocorrências de Armazém): Filme Lusafilm 2, Frutas Cristalizada 2, Sacola Sopack 2, depois os de 1.
Filtros: escolher "sem conferência" (rosca ou barra cinza) mostra só as sem vínculo; escolher uma pessoa mostra só as dela; sem escolher nada mostra todas. NÃO mudam: os cartões do topo (Erros Atribuídos, Conferente com Mais Erros, Sem Conferência
Vinculada) e a lista de cartões por conferente (seguem só atribuídas por padrão). `APP_VERSION`/`version.json` 4.89.276 → 4.89.277. Só leitura/apresentação; sem mudança de dado nem de estrutura de banco.
Como desfazer: `git revert` do commit desta entrada.

## 2026-11-11, Gabriel: Erro Conferente: Data inicial e Data final — v4.89.276
Onde: `index.html`, página Armazém › Erro Conferente. Cabeçalho ganha "Data inicial" / "Data final" (`#errconf-ini`/`#errconf-fim`, classes `devol-data cm-data`: ícone claro + linha) e o botão
"Mês atual" (só aparece com período diferente do mês). Funções novas `_errconfPeriodo`, `errconfPeriodoMudou`, `errconfLimparPeriodo` (reaproveita `_devolMesAtual`); `carregarErroConferente` agora
busca só o período (`criado_em` do dia 1 00:00 ao último dia 23:59:59.999, fuso -03:00; antes buscava as 1.000 últimas de todo o histórico, sem datas; limite agora 5.000).
Regras (modelo do Dashboard Devolução): PADRÃO = MÊS ATUAL (antes mostrava todo o histórico: 8 atribuídas + 29 sem conferência = 37); campo vazio é preenchido, nunca busca "tudo"; só uma data
completa a outra pelo mês dela; inicial maior que final avisa e não consulta. O período vale pela DATA DA OCORRÊNCIA (`criado_em`), não pelo dia da conferência; a atribuição (OK em `conferencia_pedidos`,
mesma carga/pedido) não mudou. Mensagem sem dados: "...registrada neste período". `APP_VERSION`/`version.json` 4.89.275 → 4.89.276.
Valores com os dados reais de 11/11 (erros de Armazém / atribuídos / sem conferência): mês atual 13 / Jaqueline 2, Jacson 1 / 10; outubro 23 / Jaqueline 3, Pedro 1 / 19; 01/10 a 30/11 e ano 2026: 36 / Jaqueline 5,
Jacson 1, Pedro 1 / 29. ATENÇÃO: a ocorrência do pedido 67809 tem `criado_em` com ano 0026 (digitado errado na "Data da ocorrência") e por isso NÃO entra em nenhum período de 2026 (antes entrava na soma sem filtro: Jaqueline 6, total 37).
Só leitura; sem mudança de dado nem de estrutura de banco. Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: corrigir o `criado_em` do pedido 67809 (dado de produção, não alterado por mim).

## 2026-11-10, Gabriel: Erro Conferente: gráfico "Erros por conferente" ganha a barra cinza "Sem conferência vinculada" — v4.89.275
Onde: `index.html`, página Armazém › Erro Conferente, `_errconfRender` (gráfico por conferente) e subtítulo do cartão. O gráfico agora ignora também o filtro de cobertura
(`['conf','cob']`): mostra SEMPRE as pessoas (com OK dele no pedido) e, por último, uma barra cinza "Sem conferência vinculada" (ocorrências de Armazém sem registro de conferência
no pedido), então a soma das barras fecha com o total de erros de conferência (hoje 8 + 29 = 37). Clicar na barra cinza filtra os outros gráficos por "sem conferência" (clicar de novo limpa);
clicar numa pessoa filtra por ela, como antes. Com "sem conferência" ativo as pessoas ficam apagadas e a cinza destacada (antes o gráfico virava uma barra cinza só).
Subtítulo: "Ocorrências de Armazém por conferente (pedidos que ele deu como OK) · cinza = sem conferência vinculada · clique numa barra para filtrar".
NÃO mudam: os cartões do topo (Erros Atribuídos, Conferente com Mais Erros, Sem Conferência Vinculada), a regra de atribuição (OK em `conferencia_pedidos` na mesma carga/pedido) e os
outros gráficos (produtos, tipo do erro, por dia), que seguem só com as atribuídas até se escolher "sem conferência" na rosca ou na barra cinza. `APP_VERSION`/`version.json` 4.89.274 → 4.89.275.
Motivo: pedido do Gabriel ("o que for devolução por motivo do Armazém é o indicador Erro de conferência"; "por que o gráfico não mostra os sem conferente vinculado").
Só leitura/apresentação; sem mudança de dado nem de estrutura de banco. Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: o gráfico por conferente (37) e os de produto/tipo (8, por padrão) passam a ter totais diferentes até alguém escolher "sem conferência"; avaliar alinhar.

## 2026-11-10, Gabriel: Armazém › Aderência à conferência: pedido com ocorrência de motivo Armazém fica laranja — v4.89.274
Onde: `index.html`, `_aderDetalhe` (lista de pedidos de cada carga, ao clicar num dia do gráfico). Para os pedidos do dia busca em `ocorrencias_distribuicao`
(pedido, motivo_id, motivo_nome) e em `motivos_devolucao` (setor); se o motivo é do setor Armazém (por id, ou pelo nome quando a ocorrência não tem id; sem
diferenciar acento/maiúscula), o chip do pedido fica LARANJA (`#f97316`) em vez de verde/vermelho/cinza e mantém o ✔/✖/○ da conferência. A dica do chip mostra
"ocorrência de devolução (Armazém): <motivo>"; a legenda ganha "laranja = pedido com ocorrência de devolução de motivo Armazém". Outro setor não pinta. Se a consulta
das ocorrências falhar, os chips ficam como antes. Não muda a contagem "X de Y pedidos conferidos" nem os números do indicador. `APP_VERSION`/`version.json` 4.89.273 → 4.89.274.
Só leitura; sem mudança de dado nem de estrutura de banco.
Conferido em 10/11 nos dados reais: 12 ocorrências de Armazém desde 01/11 (motivos Falta no Carregamento, Inversão no Carregamento, Sobra de Produto); nenhuma cai nas cargas de
08/11 do print do Gabriel (por isso o 70429 ainda não fica laranja: não existe ocorrência dele). Dias para ver o laranja: 04/11 (carga 16017: pedidos 69004 e 68970) e 02/11 (carga 16185: pedido 69499).
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: nenhum conhecido; só aparece na rota externa (a tela só lista cargas de rota externa).

## 2026-11-09, Gabriel: Painel de Indicadores › Erro de conferência: Data inicial e Data final — v4.89.256
Onde: `index.html`. Acima do cartão (fora dele, então não vai na imagem baixada) entram "Data inicial" e "Data final" (`#pn-erroconf-ini`/`#pn-erroconf-fim`,
classes `devol-data cm-data`: ícone claro + linha) e o botão "Mês selecionado" (só aparece com período personalizado). Funções novas: `_pnPeriodoIntervalo`,
`_pnErroConfPeriodoAtual`, `_pnErroConfSincronizarUI`, `pnErroConfPeriodoMudou`, `pnErroConfLimparPeriodo`; alterados `_pnHtmlErroConferencia(mes, periodo)` e
`_pnCarregarCardDados` (caso `erroConferencia`). `APP_VERSION`/`version.json` 4.89.255 → 4.89.256.
Regras: padrão continua o mês do filtro do Painel (dia 1 até hoje); escolher datas busca só esse intervalo (dia inteiro, fuso -03:00) e muda o cabeçalho
("03/11 A 05/11/2026"; atravessando o ano mostra os dois anos). O período vale só para o mês do filtro em que foi escolhido: trocar o mês volta ao padrão. Só uma data
preenchida completa a outra (inicial → fim do mês dela; final → dia 1 do mês dela). Inicial maior que final avisa e não busca. O limite de 5.000 ocorrências agora é avisado
na nota do cartão. "Gerar Apresentação" (slide 7) NÃO muda: continua usando o mês inteiro.
Só leitura, sem mudança de dado nem de estrutura de banco.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: nenhum conhecido; teste visual do Gabriel em localhost (com login, o que eu não faço).

## 2026-11-09, Gabriel: Aderência — nome passa para "Aderência à conferência" — v4.89.246
Onde: `index.html`: rótulo do item no menu Armazém (`data-page="aderencia"`) e título da página (`<h2>` de `page-aderencia`). `APP_VERSION`/`version.json` 4.89.242 → 4.89.243.
Por quê: pedido do Gabriel: trocar "Aderência conferente" por "Aderência à conferência". Só texto: página, regras de acesso (admin e adm_armazem), funções e dados iguais. O título do topo da tela segue o
rótulo do menu. Entradas antigas deste registro mantêm o nome antigo (histórico). Empilhada na mudança da Aderência (4.89.242, ainda não publicada): vão juntas.
Testes: `node check.js` ok; conferido por leitura que os dois textos mudaram e que não sobrou o nome antigo no menu nem no título.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: baixo; teste visual do Gabriel.
## 2026-11-09, Gabriel: Aderência — só conta cargas que saíram, mostra rotas distintas e as previstas que não saíram — v4.89.246
Onde: `index.html`, Armazém › Aderência (conferente): `renderArmAderencia` (busca traz `ts_saiu` e separa as cargas que saíram das que não), `_aderPintar` (KPIs) e o
texto do filtro de datas. `APP_VERSION`/`version.json` 4.89.241 → 4.89.242.
Por quê: pedido do Gabriel: a quantidade de rotas da Aderência não batia com o real; conferir com o que é lançado em Distribuição › Expedição. Conferência (só leitura):
Aderência e Expedição usam a MESMA tabela (`demandas_rota`); sem duplicidade e sem carga faltando (outubro 63, novembro 27 com carga e não canceladas; a Expedição só mostra as
não concluídas, as concluídas vão para o Histórico). O que não batia: (1) o cartão "Cargas com saída no período" contava também cargas que ainda NÃO saíram (5 em novembro: em
formação, separação, carregamento ou pronto para viagem); (2) cargas ≠ rotas: 27 cargas de novembro eram 23 combinações de rota+dia (a mesma rota saiu em duas cargas no mesmo dia).
ORIGEM DA DATA: a previsão (`data_saida`) é lançada na Expedição ao criar a pré-carga; na saída, o modal "Registrar saída" grava `ts_saiu` (horário do clique) e SOBRESCREVE
`data_saida` com a data digitada no modal (desde 01/10). Das saídas desde 05/10, 37 ainda têm o dia do clique diferente de data_saida: todas pelo modal (Emerson/Administrador), em
geral data_saida 1 dia ANTES (registro no dia seguinte informando a data real da saída). Por isso NÃO foi usado ts_saiu como "dia real": contaria no dia do registro e não no da saída.
Antes de 01/10 data_saida era a data prevista (41 de 68 cargas de setembro diferiam do dia da saída).
O que mudou: (a) só entram nas contas as cargas que SAÍRAM (status saiu/fim_viagem/concluído, ou com `ts_saiu`) e o período filtra por `data_saida` (dia informado pela Expedição);
(b) novo cartão "Rotas (rota + dia)" ao lado de "Cargas que saíram no período"; (c) novo cartão "Previstas, ainda não saíram" com as cargas previstas para o período que não
saíram (primeiras 3 na legenda); some quando se escolhe um dia no gráfico; (d) percentuais e gráficos passam a considerar só as que saíram; (e) vínculo e conferência só são
buscados para as que saíram. Com os dados de 01 a 09/11: 22 saíram, 5 ainda não saíram (= 27 previstas), 19 rotas distintas. Só LÊ o banco; nada é gravado.
Testes: `node check.js` ok; 14 testes (saíram x pendentes, rotas distintas, percentuais, dia escolhido, listas vazias, buscas) + conferência com os dados reais.
Como desfazer: `git revert` do commit desta entrada (volta a contar também as que não saíram).
Pendente/risco: se algum dia a Expedição registrar a saída sem informar a data certa no modal, o dia fica errado (a tela confia nesse campo). Teste visual do Gabriel.
## 2026-11-07, Gabriel: Ocorrências (Distribuição) — rota aparece ao digitar o pedido, mesmo com base_data sem rota — v4.89.234
Onde: `index.html`, `_ocorrAutoFillCompleto` (campo "Rota" do formulário Registrar Ocorrência). `APP_VERSION`/`version.json` 4.89.233 → 4.89.234.
Causa: a rota vinha só de `base_data.rota` pelo pedido, e essa coluna está VAZIA em 40-60% dos pedidos (lido em 07/11: ago 777 de 3.131; set 1.527 de 3.382;
out 1.086 de 2.657; nov 319 de 532). Ex.: pedido 68204 (carga 16057) existe, trouxe cliente/carga, mas sem rota, e a tela dizia "(pedido não encontrado)".
O que muda: se o `base_data` não tem rota, usa a rota da CARGA: primeiro `lancamentos.rota`, depois `demandas_rota.rota` (Expedição). Mensagens: "(rota da carga #N,
preenchida automaticamente)"; "(pedido encontrado, mas sem rota no sistema — escolha a rota)" (antes dizia "pedido não encontrado" mesmo achando o pedido); "(pedido não
encontrado)" só quando o pedido não existe. Rota que não está no cadastro (RN, CASA NOVA, BOM JESUS...) agora é criada como opção no campo em vez de ficar em branco.
Se a pessoa digita outro pedido durante a busca, a resposta antiga não sobrescreve mais o campo.
Alcance medido (out/nov, amostra de 272 cargas com pedido sem rota): 80 resolvem por lancamentos/demandas_rota; 192 NÃO têm rota em tabela nenhuma (base_data,
lancamentos, demandas_rota, agendamentos_rotas); `pedidos_info_erp.rota_codigo_erp` é só um código numérico do ERP ("001" serve a rotas diferentes), não dá para virar nome.
Para esses 192, a pessoa escolhe a rota à mão (a mensagem agora diz isso).
Sem mudança de dado nem de estrutura de banco; só leitura.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco (Daniel/ERP): a CAUSA RAIZ é a importação/integração que grava `base_data` sem `rota` (e sem `und`/`rire`) em quase metade dos pedidos desde agosto.
Isso também afeta indicadores que usam `base_data.rota`. Vale investigar a origem (planilha ou Edge Function do ERP).

## 2026-11-06, Gabriel: Dashboard Devolução — período padrão = mês atual e carga só do período — v4.89.231
Onde: `index.html`, Análise › Dashboard Devolução: campos de data (agora `onchange="devolPeriodoMudou()"`), botão "Mês atual" (era "Limpar datas"), funções novas `_devolMesAtual`,
`_devolPeriodoNormalizado`, `devolPeriodoMudou` e ajustes em `carregarDashDevolucao`, `devolLimparDatas` e `renderDashDevolucao` (visibilidade do botão).
`APP_VERSION`/`version.json` 4.89.229 → 4.89.231 (nasceu como 4.89.230; a main já estava na 4.89.230 com outra mudança, então subiu mais uma).
Por quê: pedido do Gabriel: abrir já no mês atual, porque do jeito que estava podia ficar muito dado e pesar o banco. A tela buscava TODAS as ocorrências (até 5000) e TODOS os
itens da tabela (até 5000) a cada abertura, e isso só cresce. Agora: (1) data inicial e final já vêm com o mês atual (dia 1 ao último dia, fuso de Brasília; vira o mês só à
meia-noite de Brasília); (2) só o período escolhido é buscado no banco (`criado_em` >= início 00:00 e <= fim 23:59:59,999 em -03:00); (3) os itens vêm só das ocorrências do período,
em lotes de 80 (antes, a tabela inteira); (4) mudar uma data recarrega depois de 300 ms de pausa (uma busca, não uma por clique); (5) campo de data vazio é preenchido
(só a final: inicial = dia 1 do mês dela; só a inicial: final = último dia do mês dela), então nunca busca "tudo"; (6) o botão "Mês atual" volta ao padrão e só aparece quando o
período é outro; intervalo invertido continua avisando e não busca. Ocorrência com data impossível (ano 0026) fica fora, como já ficava quando havia filtro de data.
Medido com os dados de hoje (só leitura): novembro 26 ocorrências de 173 no total (143 em outubro), e a contagem do filtro no banco bate com a do filtro no navegador;
itens do lote de outubro 199 contra 382 da tabela inteira. O que sai da tela (setor, motivos, barras, vendedor, tipo de unidade) continua igual para o período escolhido.
Dados: só LÊ o banco; nada é gravado.
Testes: `node check.js` ok; 21 testes de lógica (mês atual e viradas de mês/fuso/bissexto, busca só do período, itens em lote, campo vazio, invertido, debounce, botão) +
conferência da consulta com os dados reais.
Como desfazer: `git revert` do commit desta entrada (volta a carregar tudo, sem período padrão).
Pendente/risco: quem quiser ver tudo escolhe um intervalo grande à mão (o limite de 5000 linhas continua). Teste visual do Gabriel.
## 2026-11-05, Gabriel: Erro Conferente — filtro cruzado nos gráficos (menos no de dia) — v4.89.222
Onde: `index.html`, página Armazém › Erro Conferente: JS reescrito (`_errconfRender`, `_errconfPassa`, `errconfFiltrar`, `errconfLimparFiltros`,
`_errconfDestruirGraficos`, `carregarErroConferente`) e marcação (faixa de filtros `errconf-filtros` e uma mensagem "sem dados" por gráfico).
`APP_VERSION`/`version.json` 4.89.221 → 4.89.222.
Por quê: pedido do Gabriel: "tirando o gráfico de linha, quero poder filtrar por qualquer um dos outros gráficos". Clicar numa barra (conferente, produto) ou numa
fatia/legenda (tipo do erro, quanto dá para atribuir) filtra os outros gráficos, o gráfico por dia e os cartões; clicar de novo no mesmo item tira o filtro; os
filtros somam (conferente + produto + tipo). Cada gráfico continua mostrando tudo da sua própria dimensão, com o item escolhido em destaque e o resto apagado.
Faixa "Filtros:" com um chip por filtro (✕ tira só ele) e "✕ Limpar filtros". Gráfico por dia (renomeado "Ocorrências por dia") não é clicável e segue os filtros.
"Quanto dá para atribuir": clicar em "Sem conferência vinculada" mostra no dashboard e nos cartões as ocorrências de Armazém SEM conferente (hoje 23: Falta 19 e
Inversão 4), com o cartão cinza "Sem conferência vinculada"; escolher um conferente sai desse modo e vice-versa. Para isso passou a buscar os produtos de TODAS as ocorrências
de Armazém (em lotes de 80), não só das atribuídas. KPIs do topo continuam do conjunto todo. Combinação sem ocorrência: cartões avisam com botão de limpar e cada gráfico
mostra "sem dados". Atualizar zera os filtros. O redesenho acontece fora do clique do gráfico (setTimeout), balões e cliques protegidos contra lista vazia (lições do
erro `dataIndex`/`handleEvent`). Só LÊ o banco; nada é gravado.
Testes: `node check.js` ok; 42 testes novos (cada gráfico com e sem filtro, filtros somados, destaque, "sem conferência", sair do modo, combinação vazia, destruir/recriar, falhas,
sem Chart.js, só Armazém) — substituem os de 4.89.220/221 (a estrutura mudou); conferido com mouse real na página de teste com dados reais (clique filtra, chips, barra apagada) e
sem erros de JavaScript.
Como desfazer: `git revert` do commit desta entrada (volta ao dashboard sem filtro, 4.89.221).
Pendente/risco: teste visual do Gabriel em localhost; poucos dados (5 atribuídas) deixam alguns filtros com pouco efeito.
## 2026-11-05, Gabriel: Erro Conferente — dashboard com 5 gráficos e produtos no erro — v4.89.221
Onde: `index.html`, página Armazém › Erro Conferente: bloco novo `errconf-dash` (entre os KPIs e os cartões), função nova `_errconfRenderDash` e
ajustes em `carregarErroConferente` (guarda cada erro atribuído, busca os itens e desenha). `APP_VERSION`/`version.json` 4.89.220 → 4.89.221. Empilhada na
mudança "só setor Armazém" (4.89.220, ainda não publicada): vão juntas.
Por quê: pedido do Gabriel: ver os produtos que foram com erro e criar dashboards com os dados do erro de conferente. Os produtos existem: todas as 28
ocorrências de Armazém têm itens detalhados em `ocorrencias_distribuicao_itens` (produto e quantidade). Usa só os erros ATRIBUÍDOS (mesma regra dos cartões:
motivo do setor Armazém em pedido que o conferente deu como OK). Cinco gráficos: (1) erros por conferente (barras, balão com o tipo); (2) produtos com
mais erros (top 8; barra = nº de ocorrências, balão = quantidade devolvida somada, porque as unidades dos produtos são diferentes); (3) tipo do erro (rosca
por motivo); (4) erros por dia (linha, dias sem erro entram com zero; data impossível, como ano 0026, fica de fora e uma nota avisa); (5) quanto dá para
atribuir (rosca: atribuídas x sem conferência vinculada). Os cartões por conferente também passam a mostrar o produto e a quantidade de cada ocorrência.
Cores da paleta validada do Dashboard Devolução (vermelho para erro); gráficos sem clique, balões protegidos contra lista vazia (lição do erro `dataIndex`).
Com os dados de hoje são 5 erros: Jaqueline 4 e Pedro Victor 1; produtos: sacolas, kit marmita, noz moscada. Só LÊ o banco; nada é gravado. Falha ao buscar os
produtos não derruba a tela (o gráfico de produtos avisa). Sem Chart.js, o bloco some e os cartões seguem.
Testes: `node check.js` ok; 18 testes novos (dados de cada gráfico, produtos, dia sem erro, data inválida, destruir/recriar, falhas, balões) + 12 da regra de
Armazém; página de teste com os dados reais e Chart.js verdadeiro conferida visualmente (rótulos dos eixos corrigidos para não cortar nomes).
Como desfazer: `git revert` do commit desta entrada (some o dashboard; a regra "só Armazém" fica).
Pendente/risco: poucos dados (5 erros) deixam alguns gráficos simples; teste visual do Gabriel em localhost.
## 2026-11-05, Gabriel: Erro Conferente — só ocorrências com motivo do setor Armazém — v4.89.220
Onde: `index.html`, página Armazém › Erro Conferente: `carregarErroConferente` (busca `motivos_devolucao` e filtra por setor `armazem`; a busca de
ocorrências passa a trazer `motivo_id,motivo_nome`), subtítulo da tela e mensagem de lista vazia. `APP_VERSION`/`version.json` 4.89.218 → 4.89.220 (a main andou).
Por quê: pedido do Gabriel ("só setor Armazém"). A tela contava como erro do conferente toda ocorrência de pedido que ele tinha dado OK, de qualquer setor de
motivo (só excluía os tipos erro_pedido e corte). Dos 23 erros que aparecia, só 5 eram de motivo Armazém (Falta no Carregamento); 12 eram Desistência do Cliente
(Mercado), 3 Produto Avariado (Logística), 2 de Distribuição e 1 sem motivo. Agora entram só os motivos do setor Armazém (Falta/Inversão no Carregamento e Sobra
de Produto), mantendo as exclusões de erro_pedido e corte e a regra "conferente deu OK". O setor vem de `motivos_devolucao` por id; ocorrência antiga só com o
nome do motivo casa pelo nome; ocorrência sem motivo não entra. O KPI "sem conferência vinculada" passa a contar só entre as ocorrências de Armazém. Com os dados
de hoje: 5 erros atribuídos, 23 sem conferência vinculada, mais erros Jaqueline Lopes da Silva (4).
Se a busca dos motivos falhar, a tela mostra o erro (não volta a contar tudo). Só LÊ o banco; nada é gravado.
Testes: `node check.js` ok; 12 testes (função real com dados falsos: só Armazém, antigo pelo nome, sem motivo fora, NOK/sem conferência/sem carga como "sem vínculo",
lista vazia, falha nos motivos) + conferência com os dados reais (5 erros, igual à análise feita antes da mudança).
Como desfazer: `git revert` do commit desta entrada (volta a contar todos os setores).
Pendente/risco: se depois quiserem incluir Produto Avariado (Logística), é só ampliar o filtro; teste visual do Gabriel.
## 2026-11-05, Gabriel: Menu — "Aderência conferente" passa de Distribuição para Armazém — v4.89.218
Onde: `index.html`, menu lateral: o item `data-page="aderencia"` saiu da seção Distribuição (ficava depois de Ocorrências) e foi para o fim da seção
Armazém, depois de "Erro Conferente". `APP_VERSION`/`version.json` 4.89.217 → 4.89.218.
Por quê: pedido do Gabriel. Só mudou o lugar do item no menu; página, regras de acesso (`data-perfil="admin,adm_armazem"`), funções e dados continuam
exatamente iguais. Conferido por leitura do HTML: o item aparece 1 vez só, e as duas seções ficaram com a ordem esperada.
Observação (não mexida): "aderencia" não está em `PAGINAS`/`PAGINAS_GRUPOS`, então perfis personalizados não conseguem receber essa página pela tela de
Perfis (só admin e adm_armazem a veem). Se quiser liberar a outros perfis, é uma mudança à parte.
Testes: `node check.js` ok. Nenhum dado tocado.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: baixo (só o lugar do item); teste visual do Gabriel.
## 2026-11-05, Gabriel: Crédito Manual — Editar e Excluir lançamentos no histórico (admin e perfil Devolução) — v4.89.217
Onde: `index.html`, página Distribuição › Histórico — Crédito Manual: `renderCreditoManual` (coluna "Ações" com ✏️ Editar e 🗑 Excluir) e funções novas
`cmEditar`, `cmFecharEditar`, `cmSalvarEdicao`, `cmExcluir` (logo depois de `renderCreditoManual`). `APP_VERSION`/`version.json` 4.89.208 → 4.89.217 (nasceu como 4.89.209 e foi mesclada com a main, que andou até 4.89.216).
Por quê: pedido do Gabriel: quem é admin ou tem o perfil "Devolução" (chave `devolu__o`, mesma regra do Editar das ocorrências, `_podeEditarOcorrencia`)
pode editar ou excluir lançamentos do histórico. Os outros perfis não veem a coluna nem os botões. A permissão é só da tela (tabelas sem RLS).
Editar: janela com pedido, código do cliente, valor do pedido, valor do crédito, emissão da nota (calendário claro), nota, peso faltante e evidência
(Sim/Não); mesmas validações do lançamento (pedido só números, crédito > 0, peso >= 0, evidência obrigatória). Só o que mudou vai ao banco
(`PATCH credito_manual_historico?id=eq.<id>`); campo apagado vira null. Excluir: pergunta antes (mostra pedido e valor, "não pode ser desfeita") e faz
`DELETE` só da linha escolhida (`credito_manual_historico?id=eq.<id>`).
Dados em produção: altera/apaga linhas da tabela nova `credito_manual_historico` SOMENTE por ação de um usuário permitido na tela. NÃO guarda o valor
anterior nem quem editou/excluiu (exigiria coluna/tabela nova de histórico: estrutura de banco, não feito). Excluir não tem volta.
Testes: `node check.js` ok; 29 testes de lógica (permissões por perfil, só-mudou-vai-ao-banco, validações, erro ao salvar, excluir confirmado/cancelado/
com erro) + 27 do preenchimento automático, todos passando. Sem teste com a tabela real e login (precisa de teste do Gabriel).
Como desfazer: `git revert` do commit desta entrada (some a coluna Ações; linhas já editadas/excluídas ficam como estão no banco).
Pendente/risco: decidir se vale guardar histórico de edição/exclusão (quem e quando; precisaria de coluna ou tabela nova); teste visual do Gabriel.
## 2026-11-04, Gabriel: nova página "Aderência conferente" no menu lateral, abaixo de Ocorrências (vínculo do conferente e check de conferência por dia) — v4.89.215 (PUBLICADO em 05/11/2026, commit c0acd1b)
Onde: `index.html`: item de menu `data-page="aderencia"` (visível para `admin` e `adm_armazem`) logo após "Ocorrências", página `page-aderencia`, gancho em `showPage`, funções novas `_aderCalcular` e `renderArmAderencia`. `version.json` e `APP_VERSION` 4.89.214 → 4.89.215. (Primeiro foi feita como aba dentro do Armazém; o Gabriel pediu uma seção abaixo de Ocorrências e a aba foi removida.)
Por quê: pedido do Gabriel: acompanhar diariamente se o conferente vincula a carga e faz o check de conferência no Cronos e identificar quem não está preenchendo. Escopo escolhido: só rotas externas (cargas de `demandas_rota`); as internas (Ceasa, Petrolina, Juazeiro) são conferidas no FDSAS. Só leitura: não grava nada e não cria tabela. Vínculo = linha em `atribuicoes_armazem` da demanda; check = pedidos distintos em `conferencia_pedidos` (ok/nok) contra `quantidade_pedidos`; dia = `data_saida`; cargas canceladas ficam de fora. Mostra KPIs do mês, tabela dia a dia (cargas sem conferente e quem vinculou) e tabela por conferente (do que menos preencheu ao que mais). Teste com outubro/2026: 63 cargas, 24 vinculadas, 14 com check completo, 39 saíram sem vínculo.
Como desfazer: `git revert` do commit desta entrada.
Atualização 2026-11-05 (mesma entrada): a página ganhou filtro de data inicial/final (com atalhos Este mês, Mês passado e 7 dias) ligado a tudo, gráfico de pedidos vinculados x conferidos por conferente, gráfico de pedidos conferidos por conferente (OK e Não OK) e gráfico de cargas do dia x conferidas. Só leitura, nada gravado. Pedidos vinculados = soma dos pedidos previstos das cargas vinculadas ao conferente (o vínculo é por carga); se outra pessoa conferiu no lugar, o primeiro aparece com sobra. Quando dois conferentes marcam o mesmo pedido, ele conta para os dois.
Atualização 2026-11-05 (2): clicar numa coluna do gráfico "Cargas do dia" abre embaixo as cargas do dia e cada pedido, conferido (OK), Não OK ou não conferido; os pedidos vêm de `base_data` e o check de `conferencia_pedidos`. Só leitura.
Atualização 2026-11-05 (3): o dia clicado no gráfico "Cargas do dia" passa a filtrar a página inteira (KPIs, os dois gráficos por conferente e as tabelas); clicar de novo ou em "Limpar filtro" volta ao período todo. Só leitura.
Atualização 2026-11-05 (4): removida a opção "Ocultar quem não registrou nada" (a tabela Por conferente mostra sempre todos).
Pendente/risco: conferentes que só atuam em rota interna (FDSAS) aparecem com zero; há a opção "Ocultar quem não registrou nada". Cargas de coleta não são separadas das demais.

## 2026-11-05, Gabriel: Crédito Manual — só código do cliente e valor do pedido são automáticos — v4.89.208
Onde: `index.html`, página Distribuição › Histórico — Crédito Manual (`page-credito-manual`): campo do pedido (busca ao digitar e ao sair do
campo), aviso embaixo do pedido, CSS `.cm-auto` e funções `cmAutoPreencher`, `cmPedidoMudou`, `_cmTravar`, `_cmDestravarAuto`, `cmLimparForm`.
`APP_VERSION`/`version.json` 4.89.207 → 4.89.208.
Por quê: pedido do Gabriel, ajustando a v4.89.202 (que tinha deixado tudo manual): pelo Nº do pedido o ERP (`pedidos_info_erp`: codigo_cliente, valor,
cliente, situacao; se faltar o valor, `base_data`) preenche SÓ o código do cliente e o valor do pedido. Emissão da nota, número da nota, valor do
crédito, peso faltante e evidência por foto continuam manuais (destacados). Campo preenchido pelo ERP fica travado e escuro (`.cm-auto`); se o ERP não
trouxe o dado (pedido não encontrado), o campo fica livre e destacado para digitar. Embaixo do pedido aparece o nome do cliente e, em pedido
cancelado (situação CA), um aviso vermelho que NÃO bloqueia. Trocar o pedido apaga na hora os dados travados do anterior; sair do campo sem mudar o
pedido não refaz a busca nem apaga o que foi digitado; "Limpar" destrava tudo. Salvar grava os valores como estão no campo (cópia do momento). Só LÊ
o banco (duas consultas por pedido); nada é gravado por esta mudança. Dado sobre emissão/nota deixou de ser consultado.
Testes: `node check.js` ok; 27 testes de lógica (preenche/trava, cancelado, fallback, não encontrado, trocar pedido, corrida de buscas, Limpar, erro e
nova tentativa, salvar, marcação da tela) passando. Sem teste com a tabela real se ela ainda não existir; teste visual do Gabriel pendente.
Como desfazer: `git revert` do commit desta entrada (volta ao 4.89.207, tudo manual).
Pendente/risco: tabela `credito_manual_historico` ainda precisa existir para salvar (ver entrada de 05/11 anterior); valor do pedido é o do ERP
(soma dos itens), que pode diferir do valor impresso na nota.
## 2026-11-05, Gabriel: Campos de data com ícone do calendário claro (Crédito Manual e Ocorrências) — v4.89.203
Onde: `index.html`: `#cm-emissao` (Histórico — Crédito Manual › Data de emissão da nota) passa de `.cm-semcal` (sem ícone) para `.cm-data` (ícone do
calendário claro + linha separadora); `#l-ocorr-data` (Distribuição › Ocorrências › Data da ocorrência) ganha a classe `.cm-data` (o ícone saía escuro,
quase invisível no tema escuro). Removido o CSS `.cm-semcal`, que não é mais usado (a emissão não vem mais do ERP). `APP_VERSION`/`version.json` 4.89.202 → 4.89.203.
Por quê: pedido do Gabriel: "crie o ícone de selecionar a data, como em Distribuição_Ocorrências" e "deixe o ícone BRANCO, como os outros".
Conferido em página de teste com o mesmo CSS, tema escuro e claro (ícone claro no escuro, escuro no claro). Não mexe em dado nem em estrutura de banco.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: nenhum conhecido; teste visual do Gabriel em localhost.

## 2026-11-04, Gabriel: Ocorrências (Distribuição) — mostra quem conferiu a carga e quem separou o pedido (FDSAS) — v4.89.193 (PUBLICADO em 04/11/2026, commit 136b11a)
Onde: `index.html`: variável `_ocorrFdsas` e função `_ocorrFdsasInfo` (novas), `carregarOcorrenciasDistrib` (lê uma
linha de `configuracoes`) e `_renderOcorrenciasGeneric` (chips "Conferiu (FDSAS)", "Separou (FDSAS)" e aviso de situação).
`version.json` e `APP_VERSION` 4.89.192 → 4.89.193.
Por quê: acompanhamento de devolução da expedição interna do CD, para chegar à causa raiz (treinamento etc.). O FDSAS
guarda quem conferiu cada carga e quem separou cada pedido; a tela já mostrava "sem conferente registrado" para a rota interna.
Como funciona: o Apps Script da planilha de integração (conta logisticadestak.emb) cruza as ocorrências de rota interna da
unidade `1 - CD` com as abas do FDSAS e grava o resultado, por id de ocorrência, em UMA linha da tabela `configuracoes`
(chave `fdsas_responsaveis`, mesmo padrão do MFV `mfv_v2`). A tela só LÊ essa linha. O campo `conferente` da ocorrência
NÃO é alterado. Sem a linha, ou para ocorrência fora do CD, a lista fica exatamente como antes.
Dado no Supabase: tabela `configuracoes`, chave `fdsas_responsaveis`, valor anterior: não existia (criada pelo script).
Sem tabela nem coluna novas, sem dinheiro. É a ponte provisória: a versão definitiva, com tabelas próprias no Cronos, será
pedida ao Daniel.
Como desfazer: `git revert` do commit desta entrada (a tela volta ao normal) e, se quiser, apagar a linha
(`delete from configuracoes where chave = 'fdsas_responsaveis'`) e desativar o gatilho `gerarRelatorio` no Apps Script.
Pendente/risco: o nome de quem separou/conferiu fica numa linha de configuracoes legível com a chave pública do Cronos (o
banco não tem controle de acesso, como a auditoria já aponta); levar ao Daniel. Teste visual do Gabriel em localhost antes de publicar.

## 2026-11-04, Gabriel: Ocorrências (Distribuição): valor TOTAL do produto na devolução parcial (troca do unitário) — v4.89.186
Onde: `index.html`: formulário Registrar Ocorrência: coluna "Valor do produto (R$) *" no lugar de "Valor unit." (nome pedido pelo Gabriel: "valor do produto", não "valor total"); `_ocorrValorTotalItem` (era `_ocorrPrecoItem`), `_ocorrQtdMudou` (nova), `_ocorrMarcarPrecoVazio`, `_ocorrRecalcValorDevolvido`, `salvarOcorrenciaLanc`.
Por quê: pedido do Gabriel ("aqui não é valor unitário, substitua para valor total do produto"). O valor digitado é o total do produto na devolução, SEM multiplicar pela quantidade; "Valor a devolver" = soma dos totais. Quando o ERP tem o preço, o total vem preenchido (preço × qtd) e acompanha a quantidade até a pessoa digitar. Obrigatório (> 0) em todo produto marcado. Gravação: `ocorrencias_distribuicao_itens.valor_total` = total digitado; `valor_unitario` = total ÷ quantidade (a edição de ocorrência recalcula em cima dele); `ocorrencias_distribuicao.valor_devolvido` = soma. Colunas que já existiam; sem mudança de estrutura. Registros feitos com a v4.89.183 (unitário × qtd) não mudam.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: se a intenção era o total da LINHA DA NOTA (proporcional à quantidade devolvida), o cálculo muda; confirmar com o Gabriel no teste.

## 2026-11-04, Gabriel: Ocorrências (Distribuição) — valor unitário obrigatório na devolução parcial — v4.89.183
Onde: `index.html`: formulário "Registrar Ocorrência": `_ocorrAtualizarItensUI` (coluna nova "Valor unit. (R$) *"
em cada produto), `_ocorrToggleItemQtd`, `_ocorrRecalcValorDevolvido`, `salvarOcorrenciaLanc`; helpers novos
`_ocorrPrecoItem` e `_ocorrMarcarPrecoVazio`. `version.json` e `APP_VERSION` 4.89.182 → 4.89.183 (trabalho feito em 22/10 e parado; atualizado com a main em 04/11, conflito só na versão).
Por quê: pedido do Gabriel. Desde 18/09 quase todo item do ERP chega sem preço unitário (100% em outubro), e a
ocorrência acabava mostrando "(valor do pedido)", que superestima a devolução parcial. Agora, na devolução
PARCIAL, cada produto marcado tem um campo de valor unitário OBRIGATÓRIO: vem pré-preenchido quando o ERP tem o
preço e vazio quando não tem. Sem valor (ou valor 0) o sistema não registra, destaca o campo em vermelho e avisa
qual produto falta. O "Valor a devolver" do formulário atualiza ao digitar. O valor digitado é gravado em
`ocorrencias_distribuicao_itens.valor_unitario` e o total em `ocorrencias_distribuicao.valor_devolvido`
(colunas que já existiam; nenhuma coluna nova). Valores gravados em centavos (arredondados).
Devolução TOTAL não mudou. As 41 ocorrências parciais antigas sem valor NÃO mudam sozinhas.
Sem mudança de estrutura de banco. Causa raiz (preço não chega do ERP) segue pendente com o Daniel.
Rótulo no histórico (pedido do Gabriel, 04/11): parcial registrada a partir de 04/11/2026 com valor devolvido mostra
"R$ X (valor da nota)" em vez de "R$ X devolvido" (`_renderOcorrenciasGeneric`, variável `valorDaNota`, corte por `criado_em`).
As anteriores seguem como estavam ("devolvido" ou "(valor do pedido)").
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel em localhost antes de publicar. O valor depende de digitação.

## 2026-11-05, Gabriel: Histórico — Crédito Manual: todos os campos manuais + SQL da tabela — v4.89.202
Onde: `index.html`, página Distribuição › Histórico — Crédito Manual (`page-credito-manual`). Tirado o preenchimento automático: o pedido não consulta mais
`pedidos_info_erp`/`base_data`; código do cliente, valor do pedido, emissão e nota ficam em branco, editáveis e destacados como os outros.
Removidos `cmAutoPreencher`, `cmPedidoMudou`, `_cmTravar`, `_cmDestravarAuto` e o CSS `.cm-auto`; texto da tela agora diz que é tudo manual.
Obrigatórios continuam: pedido, valor do crédito e evidência por foto (Sim/Não); os demais são opcionais como antes.
`APP_VERSION`/`version.json` 4.89.201 → 4.89.202 (a main andou para 4.89.201 com outra mudança; sem conflito de texto, só o número).
TABELA (ESTRUTURA DE BANCO, quem cria é o Daniel): arquivo novo `supabase/migrations/20261105_credito_manual_historico.sql` (IF NOT EXISTS, sem RLS, não
mexe em dado nenhum) com as colunas que o código já usa. Confirmado em 05/11 por leitura que a tabela NÃO existe (PGRST205). Enquanto não for criada, a lista
mostra o aviso e salvar também falha. NÃO foi criada por mim (só tenho a chave anon, que não faz DDL).
Como desfazer: `git revert` do commit desta entrada (volta o preenchimento automático). Se a tabela for criada e precisar sair: drop table public.credito_manual_historico (só se estiver vazia).
Pendente/risco: Daniel criar a tabela (dinheiro + estrutura: avisar antes de publicar); teste visual do Gabriel em localhost.

## 2026-10-30, Gabriel: Carregamento no Prazo (Visão Anual): clique nas barras de EVOLUÇÃO MENSAL filtra o mês — v4.89.126
Onde: `index.html`: `_toggleMesCarregAno` (nova), `carregarPainelCarregamentoPrazoAno` (passa `onMesClick`/`mesSelIdx`/`pctView` ao
`_renderCardVisaoAnualPercentual`, que já existia) e `_calcNoPrazoAno` (devolve também `porMes` {noPrazo, fora}). Mesma regra do
Absenteísmo: clique = só esse mês, clique de novo desmarca, Ctrl+clique soma, Shift+clique intervalo, "✕ Limpar filtros" volta ao ano. Com
mês(es) marcado(s): "RESULTADO DE <MÊS>" e NO PRAZO/FORA DO PRAZO/registros passam a ser só dos meses marcados (vários meses = soma no
prazo ÷ soma total). O número grande segue sendo o acumulado do ano. Clique só troca a seleção, sem recalcular os 12 meses (cache
`window._carregAnoCache`, vale para o mesmo ano/unidade/filtro R.I./R.E.). A seleção usa o mesmo armazenamento do Absenteísmo
(`_absAnoMesSelPorPrefixo['carreg-prazo']`), então zera ao trocar mês/unidade no topo. Não toca em dados do Supabase.
Como desfazer: `git revert` deste commit (volta ao 4.89.125, só sem o clique).
Pendente/risco: baixo; só visual/cliente.

## 2026-10-30, Gabriel: Carregamento no Prazo alimentado pela planilha de Rotas Externas (regra final) — v4.89.125
Onde: `index.html`, Painel de Indicadores › aba Carregamento no Prazo. Funções novas (antes de `abrirModalLancarMotivosPrazo`):
`_parseRotasExternasXlsx`, `_calcCarregPlanilha`, `_dataPlanilha`, `_chaveSemanasCarreg`, `importarPlanilhaMotivosPrazo`,
`_impCarregarAtuais`, `_impMostrarPrevia`, `_impTrocarUnidade`, `_impGravar`, `_impFechar`, `_carregPrazoDaPlanilha`,
`_renderCarregPrazoPlanilha`. Alterados: cabeçalho do cartão "Análise por Motivo" (botão "Importar planilha"; "Baixar Imagem"
deslocado), `carregarPainelCarregamentoPrazo` (mensal), `_calcCarregamentoNoPrazoMes` e `_calcNoPrazoAno` (visão anual) e descrições da
composição anual. `APP_VERSION`/`version.json`: 4.89.117 → 4.89.125 (as 4.89.118 a 4.89.124 nunca foram publicadas; esta entrada as
substitui).
Ajuste (30/10, após teste do Gabriel): na Visão Anual, mês DEPOIS do último mês importado da planilha (ex.: OUT sem planilha) fica em
branco: não mostra 100%, não entra no acumulado do ano nem nos totais (`carregarPainelCarregamentoPrazoAno`, wrapper `calcMesAno`).
Meses antes do último importado seguem pelo sistema. Para desfazer: remover o wrapper e voltar a passar `_calcCarregamentoNoPrazoMes`.
Por quê: pedido do Gabriel: "alimente o Carregamento no Prazo com a planilha Rotas externas -2026". Três versões minhas saíram erradas
(denominador de motivos; tabela SEM 1..5 digitada à mão; Rota Extra fora do OK). REGRA FINAL (Gabriel, 30/10): cada linha da planilha é um
carregamento. Só contam as colunas Data, Dia da Semana, Nome da Rota e "Status de carregamento" (antes chamada "Rota no prazo": os dois
nomes funcionam). Total = linhas com status. OK = "Carregamento ok" E "Rota Extra" (toda rota extra foi carregamento OK). NOK = "Valor
abaixo da meta", "Falta de Veículo", "Atraso no carregamento", "Atraso do motorista" (e qualquer status desconhecido). % = OK ÷ total,
por semana e no mês. Valor expedido, meta, % atingido e a coluna "Status" de meta NÃO são usados. Semana = a do mês pela data (domingo a
sábado; a 1ª vai até o primeiro sábado). Linha sem status não conta. Linha com data de outro mês (provável erro de digitação: 15/9 e
16/9 na aba de outubro; 4/8, 17/8, 26/8 e 31/8 na de setembro) conta no mês da aba, na semana da linha anterior, e a prévia avisa.
Resultado com a planilha atual: Setembro 69 de 85 = 81,2%; Outubro 51 de 63 = 81,0%.
O que faz: 1) "Importar planilha" lê as abas de mês, mostra PRÉVIA (por semana e mês, motivos hoje × planilha, avisos) e só grava ao
clicar em Gravar (unidade: a do filtro do Painel ou "1 - CD"; mês igual ao do sistema vem desmarcado; motivo novo é cadastrado).
2) Grava motivos em `liberacao_prazo_motivos_mes` (upsert, mesma tabela do "Lançar Motivos") e as semanas {sem,total,noPrazo} em
`configuracoes` (JSON, chave `carregamento_prazo_semanas_<ano>_<mes>_<unidade>`; PATCH se existir, senão POST). Sem tabela/coluna nova,
sem DELETE; NÃO guarda o valor anterior (a prévia mostra "hoje no sistema"). Nada gravado por mim.
3) Mês com semanas importadas: cartão mensal "Carregamento no Prazo · Rotas Externas" (acumulado do mês, meta 90%, % por semana com "x de
y", quantidade de carregamentos por semana, no prazo/fora/total) e a Visão Anual usa o % do mês. Mês sem importação, ou com filtro
R.I./R.E. (a planilha não tem), segue o cálculo do sistema como antes (decisão assumida: manter o sistema nos meses sem planilha; hoje
isso mistura dois métodos no acumulado do ano: Jan a Ago 100% pelo sistema contra ~81% da planilha). Sem unidade ("Todas"): soma as
unidades com planilha no mês.
Filtro R.I./R.E. (corrigido na 4.89.122): a planilha é de ROTAS EXTERNAS. Com o filtro R.I. (rota interna) o indicador segue o cálculo do
sistema; com R.E. e com "Todas" os meses importados usam a planilha (antes eu ignorava a planilha em qualquer um dos dois filtros). Achado
no print do Gabriel: filtro R.I. ligado e nada ainda importado no banco, então Set/Out apareciam 100% pelo sistema. Em "Todas" a planilha
(só externas) substitui o número do mês inteiro: confirmar com o Gabriel se prefere só em R.E.Erro ao gravar (4.89.125): no 1º teste real do Gabriel o Gravar falhou com `duplicate key value violates unique constraint
"liberacao_prazo_motivos_mes_mes_ano_unidade_motivo_nome"` (código 23505, chave (2026-09, 1 - CD, Atraso no carregamento)). Causa: o upsert
(`Prefer: resolution=merge-duplicates`) não dizia ao PostgREST em quais colunas está o conflito; sem `?on_conflict=`, ele só considera a chave
primária e tentava INSERIR de novo o mês que já existia (Setembro, lançado em 29/10). Correção: `liberacao_prazo_motivos_mes?on_conflict=mes_ano,unidade,motivo_nome`
na importação (`_impGravar`) e, pelo mesmo motivo, em "Lançar Motivos" (`mlpSalvarTudo`: salvar de novo um mês existente dava o mesmo erro).
Nada foi gravado na tentativa que falhou (o erro veio no 1º passo, antes das semanas). 7 testes novos do fluxo de gravação (upsert com
on_conflict, motivo novo, POST/PATCH da configuração, erro sem efeito colateral). Não consegui testar contra o banco real sem gravar dado;
se o Gravar ainda errar, mandar o print da mensagem.Planilha nova (4.89.124): o Gabriel passou a usar só as colunas Data, Dia Semana, Nome da Rota e "Status de carregamento" (o arquivo
"Rotas externas -2026 (1).xlsx" de 30/10 tem só a aba de Setembro; a de Outubro saiu dele). Conferido com o arquivo real: a aba é lida sem
ajuste (cabeçalho em E3, bloco "Análise por motivo" em Q:V), Setembro = 85 carregamentos, 69 OK = 81,2%; os 4 status são escritos sempre
igual (sem espaço sobrando). "Dia Semana" é fórmula da data, então não serve para achar data errada. Ajustes: (1) data digitada em mês
VIZINHO (4/8, 17/8, 26/8 numa aba de setembro; 15/9 e 16/9 numa de outubro) passa a valer como o MESMO DIA do mês da aba só para definir a
semana (antes herdava a semana da linha anterior, errando por ex. 26/8 → semana 5 em vez de 4); o total do mês não muda e a prévia avisa
"vale corrigir na planilha"; dia inexistente (31/8 → 31/9) e datas muito fora herdam a semana anterior; (2) aba sem o nome do mês no título
passa a usar o mês (e ano) mais frequente das datas, com aviso. Linha em vermelho (L14, Rota Extra 4/8) não é lida (a cor não conta).Aviso com botão nos cartões (4.89.123): depois de dois prints "ainda errado" do Gabriel (Set/Out em 100% pelo sistema), a conferência no
banco mostrou que NADA tinha sido importado (nenhuma chave `carregamento_prazo_semanas_*`, nenhum motivo de Outubro): a tela estava certa
para o que havia no banco, mas não dizia isso. Agora, no topo dos cartões mensal e anual de Carregamento no Prazo (FORA do cartão, não vai
na imagem baixada), há um aviso com o botão "Importar planilha": "Nenhuma planilha de Rotas Externas importada em 2026", "Meses pela
planilha: SET, OUT. Os demais vêm do sistema", "Este mês está pela planilha" / "ainda não tem planilha importada" e, com filtro R.I., "a
planilha só vale em R.E. ou Todas". Auxiliares: `_barraPlanilhaCarreg`, `_mesesComPlanilhaCarreg`. O botão antigo (em "Análise por Motivo",
mais embaixo) continua. 9 testes novos.Observação sobre a planilha (auditoria, 30/10): o bloco "Análise por motivo" é fórmula e continua igual (conta a coluna de status); a
tabela SEM 1..5 é digitada à mão e não é usada.
Testes: `node check.js` ok; 27 testes do leitor/cálculo (cálculo independente por data e por linha sobre os dados reais; layout novo de 4
colunas; nome antigo e novo do cabeçalho; status desconhecido = NOK), 5 de integração mensal/anual, planilha real lida com a biblioteca XLSX
no navegador (prévia) e regressão igual à da main.
Como desfazer: `git revert` do commit desta entrada (dados importados continuam no banco; remover as chaves `carregamento_prazo_semanas_*`
em `configuracoes` volta o indicador ao cálculo do sistema).
Pendente/risco: teste visual do Gabriel em localhost (botão, prévia, Gravar, cartão mensal e visão anual).
## 2026-10-29, Gabriel: Painel de Indicadores — padrão "acumulado do ano + resultado do mês" só nas VISÕES ANUAIS; mensais voltam ao acumulado do mês — v4.89.115
Onde: `index.html`: `renderCustoArmazem` e `renderReceitaArmazem` (mensais), `_renderCardVisaoAnualPercentual` (cartão anual em %:
Absenteísmo Armazém/Expedição/Recebimento/Distribuição, OTIF, prazos, disponibilidade...) e `renderRelatorioAbsenteismo` (mensal).
`APP_VERSION` e `version.json`: 4.89.115 (main estava em 4.89.114; mesclada, conflito só de versão).
Por quê: correção de um erro meu. O pedido do Gabriel tinha sido feito olhando as VISÕES ANUAIS e eu apliquei também nas mensais.
Ele corrigiu: "na visão mensal está acumulado do ano mas é acumulado do mês" e "a visão anual do Absenteísmo ainda está errada".
Agora:
- Visão ANUAL (Custo, Receita, Absenteísmo e os demais cartões em %): número grande = ACUMULADO NO ANO; ao lado "RESULTADO DE
  <MÊS>/<ANO>" (mês clicado nas barras ou, sem clique, o mês do filtro do Painel; "—" se o mês não tem dado) e a META DEFINIDA.
  No cartão em %, o "RESULTADO" que ficava embaixo da composição saiu (virou o bloco ao lado do número grande, com a etiqueta
  DENTRO/FORA DA META do mês). Composição 1, 2, 3 em ordem decrescente (já da v4.89.114).
- Visão MENSAL: número grande = ACUMULADO NO MÊS (ou da semana clicada), como era. Custo e Receita mensais: o antigo "MAIOR
  CATEGORIA" saiu e no lugar fica "ACUMULADO NO ANO" (suposição minha; confirmar com o Gabriel). Absenteísmo mensal: voltou ao
  original (acumulado do mês + meta) e o cálculo do ano em segundo plano que eu tinha incluído SAIU (sem custo extra).
Substitui os itens 2 (mensais) da entrada da v4.89.114 logo abaixo e a entrada de Absenteísmo mensal da v4.89.115 anterior
(nunca publicadas).
Dados: nada gravado; só leitura. Nenhuma coluna nova.
Testes: `node check.js` ok; 20 testes de Custo/Receita (anual e mensal), 11 do cartão em % (resultado do mês, mês clicado, sem
dado, sem meta, invertido) e regressão igual à da main (falhas antigas de ambiente: `_ic` não existe no teste).
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel nas visões anual e mensal de Absenteísmo, Custo e Receita.
## 2026-10-29, Gabriel: Painel de Indicadores — composição 1, 2, 3 em ordem decrescente e cartões de Custo/Receita com acumulado do ano + resultado do mês — v4.89.114
Onde: `index.html`, Painel de Indicadores: `renderCustoArmazem`, `renderCustoArmazemAno`, `renderReceitaArmazem`,
`renderReceitaArmazemAno` (cartões de Custo e Receitas Armazém, mensal e anual); `_renderCardVisaoAnualPercentual`
(cartão em % de OTIF, prazos, disponibilidade, absenteísmo anual etc.) e a lista de composição do Absenteísmo mensal.
`APP_VERSION` e `version.json`: 4.89.113 → 4.89.114 (já em cima da main com a v4.89.113).
Por quê: pedido do Gabriel, "em todos os dashboards do Painel de Indicadores":
1) Composição em ordem decrescente de valor e numerada "1, 2, 3" (antes "01, 02, 03"). Custo/Receita já vinham
   ordenados por valor; nos cartões em % (e Absenteísmo mensal) agora também ordena do maior para o menor (empate
   mantém a ordem original). Atenção: em Disponibilidade os itens ALTA/MÉDIA/BAIXA passam a seguir a quantidade.
2) Custo e Receitas Armazém (mensal e anual): o número grande é SEMPRE o "ACUMULADO NO ANO" (mesma unidade filtrada),
   não muda ao escolher mês ou semana. O bloco "MAIOR CATEGORIA" (nome + valor) saiu e no lugar entra "RESULTADO DE
   <MÊS>/<ANO>" com o total do mês: o mês clicado nas barras (anual) ou, sem clique, o mês do filtro do Painel. Na
   visão mensal é o mês inteiro (a semana clicada continua filtrando só a composição). Em Receita mensal o
   "ACUMULADO NO ANO" pequeno foi removido (virou o número grande). O link "ver ano inteiro/mês inteiro" continua.
Os cartões em % já tinham o acumulado do ano fixo e o bloco "RESULTADO" do mês: só receberam a numeração e a ordem.
Dados: nada gravado; só leitura. Nenhuma coluna nova.
Testes: `node check.js` ok; 19 testes de lógica novos (ano, mês, unidade, mês clicado, semana clicada, mês sem dados,
ordem e numeração nos 4 cartões) + cartão em %; conferido visualmente com dados fictícios. Regressão igual à da main
(falhas antigas de ambiente: `_ic` não existe no teste).
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel em localhost (Custo e Receita, mensal e anual, com e sem mês/semana clicados).
## 2026-10-29, Gabriel: crédito manual — data de emissão da nota sem calendário e sem a linha — v4.89.104
Onde: `index.html`, aba "Histórico - crédito manual": CSS `.cm-semcal` e a classe do campo `cm-emissao` (era `cm-data`).
`APP_VERSION` e `version.json`: 4.89.103 → 4.89.104.
Por quê: pedido do Gabriel: como a data de emissão vem do ERP, tirar o ícone do calendário e a linha branca antes dele. O
campo continua sendo do tipo data: quando o ERP não traz a emissão (pedido sem nota) dá para digitar a data à mão
(dd/mm/aaaa), só não há mais o seletor de calendário. O campo de data da janela "Editar ocorrência" continua com calendário
e linha (classe `cm-data`, inalterada). A regra de calendário claro + linha vale para campos de data que a pessoa preenche;
este é a exceção por ser automático.
Testes: `node check.js` ok; 63 testes de lógica passando; conferido visualmente numa página de teste. Nenhum dado tocado.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel.
## 2026-10-29, Gabriel: crédito manual — campos de preenchimento MANUAL mais claros e destacados — v4.89.103
Onde: `index.html`, aba "Histórico - crédito manual": CSS `.cm-manual` (variáveis `--cm-realce` / `--cm-fundo`), marcação dos
campos pedido, valor do crédito e peso faltante, contorno dos botões Sim/Não, `_cmTravar` e `_cmDestravarAuto`.
`APP_VERSION` e `version.json`: 4.89.102 → 4.89.103.
Por quê: pedido do Gabriel, invertendo a decisão da v4.89.102: os campos que se preenchem à mão ficam mais claros (contorno
e fundo claros no tema escuro; contorno azul com fundo branco no tema claro) e os automáticos continuam como estavam
(escuros e travados). Destacados: Nº do pedido, valor do crédito, peso faltante e os botões Sim/Não. Um campo que o ERP
costuma preencher mas não trouxe (pedido sem nota, não encontrado) também fica destacado, para mostrar que é preciso
digitar. Nada mudou na lógica de gravar nem nos dados.
Testes: `node check.js` ok; 60 testes de lógica passando; conferido visualmente numa página de teste.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel; a main andou (v4.89.102 de outra mudança), então a publicação pede mesclar e
subir a versão.
## 2026-10-29, Gabriel: crédito manual — campos do ERP travados, com contorno escuro, e sem o texto azul — v4.89.102
Onde: `index.html`, aba "Histórico - crédito manual": CSS `.cm-auto`, estado `_cmPedidoBuscado`, ajudantes `_cmTravar` /
`_cmDestravarAuto`, `cmAutoPreencher` e `cmLimparForm`. `APP_VERSION` e `version.json`: 4.89.101 → 4.89.102.
Por quê: pedido do Gabriel: (1) tirar o texto azul "(preenchido automaticamente)"; (2) campos preenchidos pelo ERP com o
contorno mais escuro; (3) esses campos travados. Os 4 campos (código do cliente, valor do pedido, data de emissão, número da
nota) ficam somente leitura e escuros SÓ quando o ERP trouxe o dado; se não trouxe (pedido sem nota, não encontrado), o campo
fica livre para digitar. Ao trocar o pedido, os dados travados do anterior somem na hora (não fica dado de outro pedido
travado); sair do campo do pedido sem mudá-lo não refaz a busca nem apaga o que foi digitado; "Limpar" destrava tudo. Em
tema claro o contorno é cinza-escuro. Mudança de decisão: antes os campos automáticos eram editáveis ("você pode corrigir");
agora só se corrige o que o ERP não trouxe. Se um dado do ERP estiver errado, hoje não dá para corrigir na tela.
Testes: `node check.js` ok; 54 testes de lógica (travamento, troca de pedido, blur, Limpar, erro e nova tentativa) passando;
conferido visualmente o contorno escuro numa página de teste. Nenhum dado do banco foi tocado.
Como desfazer: `git revert` do commit desta entrada.
Pendente/risco: teste visual do Gabriel; decidir se algum campo travado deve poder ser destravado por admin.
## 2026-10-29, Gabriel: nova aba "Histórico - crédito manual" em Distribuição — v4.89.101 (PUBLICADA; tabela ainda pendente)
Onde: `index.html`: item novo no menu Distribuição (`data-page="credito-manual"`, só `admin` por padrão), página
`page-credito-manual` (antes de `page-geral`), rota em `showPage`, entradas em `PAGINAS` e `PAGINAS_GRUPOS` (para liberar
a outros perfis pela tela de Perfis) e o bloco de funções `cm*` / `carregarCreditoManual` / `renderCreditoManual` (antes de
`renderFrotaStatus`). `APP_VERSION` e `version.json`: 4.89.95 → 4.89.101 (97 = aviso de pedido cancelado; 98 = evidência por foto; 99 = ícone do calendário claro; 100 = linha clara antes do ícone; 101 = só a mescla com a main).
Por quê: pedido do Gabriel: aba para lançar crédito manual por pedido. Digitados: pedido, valor do crédito manual e peso
faltante (kg). Preenchidos pelo ERP a partir do pedido, e editáveis: código do cliente, valor do pedido, data de emissão
da nota e número da nota (`pedidos_info_erp`: codigo_cliente, valor, emissao, nota_fiscal; se o pedido não estiver lá,
usa o valor de `base_data`). Pedido sem nota (cancelado, DI...) ou anterior a 01/05/2026 fica para preencher à mão; a tela
avisa. Campo de data com ícone do calendário claro e uma linha clara separando o texto do ícone (classe cm-data, mesmo padrão do devol-data; também no campo de data da janela Editar ocorrência). Campo OBRIGATÓRIO "Evidência enviada por foto? Sim/Não" (dois botões, nada marcado por padrão; grava evidencia_foto true/false; a lista mostra a coluna, — nos lançamentos sem o dado). Pedido CANCELADO no ERP (situação CA) mostra um aviso vermelho junto do nome do cliente, SEM bloquear (no ERP há 447 pedidos CA que já tinham nota emitida: pode haver crédito em pedido faturado e depois cancelado). Lista o histórico (500 mais recentes) com total de crédito.
TABELA NOVA (ESTRUTURA DE BANCO, quem cria é o Daniel; sem RLS): `credito_manual_historico`
  id uuid primary key default gen_random_uuid(), codigo_cliente text, pedido text not null, valor_credito numeric(12,2)
  not null, valor_pedido numeric(12,2), data_emissao date, numero_nota text, peso_faltante numeric(12,3),
  criado_em timestamptz not null default now(), criado_por text, evidencia_foto boolean.
  (se a tabela JÁ foi criada sem a última coluna: alter table public.credito_manual_historico add column evidencia_foto boolean;)
Publicada em 29/10 por decisão do Gabriel, com a tabela ainda NÃO encontrada no banco na hora da publicação (a aba só aparece para admin). Sem a tabela, a aba abre e avisa "tabela ainda não existe"; salvar mostra aviso claro. Nada foi gravado no banco.
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
