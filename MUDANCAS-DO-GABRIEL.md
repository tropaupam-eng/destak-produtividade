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
