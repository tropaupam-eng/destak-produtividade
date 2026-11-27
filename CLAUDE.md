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

> 🔵 **Painel de Indicadores → Pedidos & Rotas, visão R.E. (externa) vem de Expedição (`demandas_rota`), não de `lancamentos`** (pedido do usuário, 2026-10-05: valor por rota estava subcontado — Salvador R$ 2,99 mi no card contra R$ 4,11 mi lançados em Expedição). Código: `_carregarExpedicaoRE` / `_agregarExpedicaoRE` (index.html). Regras: 1 linha por carga (a mais recente), sem `cancelado`/`formacao`, mês = mês de `data_saida` (regra do usuário: data de saída dentro do mês conta no mês; `ts_saiu` só se faltar a data), só rotas fora de `ROTAS_RI`. Rota interna (Ceasa/Petrolina/Juazeiro/Retira) segue vindo de `lancamentos`. "Entrega" = pedido (regra do usuário, 2026-11-03: cada pedido conta como uma entrega, mesmo do mesmo cliente; antes era parada de cliente). A lista "Valor por Rota" mostra TODAS as rotas (antes só as 10 maiores em pedidos, e a soma não fechava).

> 🔴 **`lancamentos` ≠ `demandas_rota` — NUNCA criar uma a partir da outra:** achado em auditoria 2026-09-28, depois de duas tentativas erradas (Claude criou 31 cards fantasma na Expedição — CEASA/PETROLINA/RETIRA/JUAZEIRO — tentando "auto-criar" `demandas_rota` a partir de `lancamentos`, primeiro sem checar `vinculado`, depois checando `vinculado=true`; nenhuma das duas bastava). `lancamentos` = registro de motorista/veículo pra produtividade/pagamento; `demandas_rota` = board de Expedição, criado **SOMENTE** por ação humana explícita (botão "Adicionar à Pré-Carga" em `acaoRotaUnificada('lancar',...)`, ou o formulário manual de lançamento). Uma carga pode ter `lancamentos` (até com `vinculado=true`) sem nunca ter passado pela Expedição — isso é normal, não é bug. `sincronizarDemandasRota()` em `_shared/erp-comum.ts` (Edge Functions do ERP) faz **só UPDATE, nunca INSERT** — não mexer nisso sem confirmar com o usuário antes. Há um trigger (`trg_log_criacao_demandas_rota` → tabela `demandas_rota_log_criacao`) que registra automaticamente toda criação de linha com o `role` de quem criou (`service_role` = veio de automação/Edge Function, suspeito; `anon`/`authenticated` = veio de clique real de usuário) — consultar essa tabela antes de mexer em qualquer coisa relacionada a criação de carga.

> 🟢 **Cargas do ERP (v4.89.308, pedido do usuário 2026-11-24 — o pessoal esquecia de lançar cargas):** a view `v_cargas_erp` (derivada de `base_data`, `security_invoker`, nada copiado) lista toda carga gerada no ERP com `situacao` = `lancada` (existe `demandas_rota` não cancelada) | `ignorada` (linha em `cargas_erp_ctl`) | `interna` (`fn_rota_eh_interna(rota_erp)`, vai por Lançamento) | `pendente` (precisa ser lançada na Expedição). Usos: Histórico › "Cargas do ERP" (`carregarCargasErp`), faixa de aviso na Expedição (`renderAvisoCargasErp`, só cargas dos últimos 7 dias com mais de 3 h, ou já mexidas por conferente), prévia/sugestões no "Vincular carga" e "Nova pré-carga" (`cerpPreviewEm`). Ao vincular/criar com número de carga, `_cerpCasarCarga` traz os clientes e aproveita a conferência já feita (`_casarConferenciaAntecipada`: religa `atribuicoes_armazem.demanda_id` vazio e, se já havia conferência, leva a carga a Carregamento e fecha se estiver 100%; também roda quando a pré-carga sai de `formacao` para `pendente`). **O conferente não espera o lançamento:** carga `pendente`/`ignorada` (ou em `formacao`) abre no Portal do Conferente como "carga virtual" (`_cfDemVirtual`, `semExp:true`) — confere normalmente nas tabelas por número de carga (`conferencia_pedidos`, `carga_pedidos_conferente`, `atribuicoes_armazem` com `demanda_id` nulo), **sem criar nem alterar `demandas_rota`** (regra `lancamentos` ≠ `demandas_rota` mantida: só ação humana cria carga na Expedição).
> 🟢 **Aba Fiscal › soltar carga toda e cor por dono (v4.89.361, 2026-11-26):** cada grupo de carga do quadro ganha botão "Soltar carga (N)" (`fiscalSoltarCarga`: solta todos os pedidos da carga que estão com o fiscal logado, com confirmação) e, para ADM Fiscal, "Soltar carga (ADM · N)" (`fiscalSoltarCargaADM`: solta os de qualquer fiscal). O cabeçalho do grupo fica verde (`.fb-grph.mine`) quando há pedido com você e laranja (`.other`) quando só há pedidos com outro fiscal, com chips "Você (n)" e "Nome do fiscal (n)". Soltar = `atribuicoes_fiscal.status=liberado` (nada é apagado).
> 🟢 **Aba Fiscal › voltou às 4 colunas + aba Prioridade (v4.89.367, 2026-11-27):** o usuário não quis o layout em linhas por carga (v4.89.366, desfeito) e pediu "o Fiscal como estava antes" com uma aba **Prioridade**. Quadro = as 4 colunas de antes (Pendente / Pend. NF / Pend. boleto / Concluído), com Soltar carga e cores por dono mantidos. Aba Prioridade = só as cargas da rota CEASA (`_fiscalEhCeasa`); essas cargas NÃO aparecem em Todas/RI/RE (ficam separadas). A aba tem contador vermelho com os pedidos ainda sem resolver nas cargas CEASA, visível em qualquer aba. Se "Prioridade" deveria cobrir outras rotas ou ser marcada carga a carga, ajustar `_fiscalEhCeasa`.
> 🟢 **Aba Fiscal › Prioridade em roxo, primeiro botão e no topo da página (v4.89.370, 2026-11-27):** o usuário não enxergava a aba (vermelha como a "Todas" ativa). Agora é um botão roxo cheio com bandeira e contador sempre visível (0 quando vazio), e a linha de abas Prioridade/Todas/RI/RE ficou no topo da página, logo abaixo do título, antes dos cartões de números. (Tentou-se fixar com sticky, mas não funciona: .app-body tem overflow e não é o elemento que rola.)
> 🟢 **Expedição Interna › Pedido prioritário (v4.89.369, 2026-11-27):** o usuário definiu: Prioridade = rota CEASA + pedido colocado como prioridade, e o pedido é lançado na Expedição Interna NO LUGAR da carga. Botão "Pedido prioritário" (só na Interna, `abrirModalPedidoPrioritario`) reaproveita o modal Nova Pré-Carga em outro modo (`_expModoPedidoPrior`; `criarPedidoPrioritario`): pede nº do pedido, rota R.I., data, motorista/veículo opcionais; confere o pedido (`_expPedidoPriorBuscar`: tem que estar em `pedidos_sem_carga`, fora de qualquer carga de `base_data` e sem outro cartão ativo) e cria uma pré-carga SEM nº de carga com `status=pendente`, `prioridade=true`, `pedido_prioridade=<nº>`, 1 pedido e o valor de `pedidos_sem_carga` (colunas novas em `demandas_rota`). O cartão mostra o selo vermelho "Prioridade · Pedido N". Quando o ERP gerar a carga, vincula-se o nº ao cartão como em qualquer pré-carga (a marca permanece). Fiscal: `_fiscalEhPrioridade` = `prioridade=true` OU rota CEASA → vai para a aba Prioridade; o pedido prioritário ganha o chip "Prioridade". O Fiscal trabalha por nº de carga, então o cartão só aparece lá depois de receber a carga. NÃO validado em produção com pedido real.
> 🟢 **Aba Fiscal › abas Todas/RI/RE/Prioridade logo acima do quadro (v4.89.368, 2026-11-27):** o usuário não achou a aba Prioridade porque a linha de botões ficava acima dos cartões de números; passou para logo acima de "Só meus chamados", colada nas colunas.
> 🟢 **Expedição Interna sem Ag. NF / Ag. Manifesto na barra (v4.89.365, 2026-11-27):** pedido do usuário. `renderPipelineBar` tira as etapas `aguardando_nf` e `aguardando_manifesto` da barra de status quando `_expModoInterno` (a Externa continua com as 9 etapas). Só a barra muda; nada nos status das cargas.
> 🟢 **Aba Fiscal › rota CEASA separada (v4.89.364, 2026-11-27):** pedido do usuário (CEASA é urgência). O quadro mostra as cargas cuja rota contém "CEASA" (`_fiscalEhCeasa`) num bloco vermelho "URGENTE · ROTA CEASA" em cima, com as mesmas 4 colunas, e as demais rotas embaixo ("Demais rotas"); novo botão de filtro "CEASA · Urgente" mostra só o bloco. KPIs continuam somando tudo.
> 🟢 **Despesas de viagem — tipos (v4.89.362, 2026-11-26):** o usuário esclareceu que a aba é de despesas da viagem da DISTRIBUIÇÃO (descargas, hotéis, etc). Tipo `estadia` virou `hotel` (tabela estava vazia; constraint `despesas_viagem_tipo_check` agora: descarrego, hotel, pedagio, combustivel, outros).
> 🟢 **Distribuição › Despesas de viagem (v4.89.357, 2026-11-25):** nova aba no menu Distribuição (`page-despesas-viagem`, `carregarDespesasViagem`, funções `dv*`). Digita o nº da carga e a tela puxa rota, motorista, ajudante, veículo, datas e valor da rota (de `demandas_rota` não cancelada, com fallback em `lancamentos` e `v_cargas_erp`); lança despesas por linha (descarrego, estadia, pedágio, combustível, outros) na tabela NOVA `despesas_viagem` (carga, tipo, descricao, valor, data_referencia, usuario; sem RLS, igual às outras tabelas de frota). Mostra valor da rota, despesas lançadas, diárias (só leitura, de `diarias_frota` por carga) e gasto da viagem = despesas + diárias, com % do valor da rota. Perfis: admin, ADM Distribuição e Expedição Admin. PENDENTE de confirmação do usuário: se "valor da rota" é a soma dos pedidos (como está) ou frete combinado; se descarrego daqui deve alimentar o Painel de Indicadores (hoje o painel lê `despesas_armazem` categoria Chapas, sem ligação). Testado só em navegador local com gravações bloqueadas.
> 🟢 **CME — fluxograma em caixinhas + evidência (print/foto) por etapa (v4.89.363, 2026-11-26):** o usuário aprovou o checklist do item abaixo mas pediu "o fluxo aparecendo e ficando verde" e um lugar pra anexar o print do erro. `_cmeChecklistHtml` passou a desenhar o caminho já percorrido como caixinhas ligadas por seta (`.cme-flow-box`, verde quando concluída, azul na ativa), com quebra de linha e rótulo "↳ Fluxo de Devolução" quando entra no sub-fluxo (só mostra o caminho realmente seguido, não o fluxograma inteiro do motivo — os outros ramos da decisão não aparecem). `cme_etapas` ganhou a coluna `evidencias` (text[]) + bucket novo no Storage `cme-evidencias` (público, mesmo padrão de `checklist-alho-fotos`): a etapa ativa tem um botão "Anexar print/foto" (`cmeAnexarEvidencia`/`_cmeUploadEvidencia`, várias imagens, com miniatura e botão de remover) e etapas já concluídas mostram as evidências anexadas em "Evidências anexadas" (`_cmeEvidenciasAnterioresHtml`). Testado só em Playwright local (upload mockado); **não validado com a CME de verdade**.
> 🟢 **CME — fluxo fixo do Padrão de Gestão CME, M01-M17 (v4.89.360, 2026-11-26):** o usuário mandou o PDF "Padrão de Gestão CME" (17 motivos de ocorrência, cada um com fluxograma fixo de etapas + matriz RACI) e pediu um layout de "check" por etapa com tempo até a devolutiva, em vez do formulário livre de tentativa/encaminhar do PR anterior. Motivo do chamado agora é M01-M17 (`cme_chamados.motivo_cod`, novo) + "Outro" (motivo_cod null, cai no modo livre antigo — setor/etapas/encaminhar manual, inalterado). Cada motivo é um grafo de etapas fixo em `_CME_FLUXOS` (index.html): `oque`/`quem`/`contato` (papel a acionar, com botão de contato se cadastrado em `cme_setores`)/`next` (ou `opcoes` pra etapa de decisão)/`prazo` (só M11 e M13 têm prazo documentado no PDF — os demais mostram só tempo decorrido, sem alerta de atraso). `cme_etapas` ganhou a coluna `fluxo` (null = segue `motivo_cod`; `'DEV'` = entrou no Fluxo de Devolução, que reinicia a numeração em 1 — por isso a consulta de etapas passou a ordenar por `criado_em`, não mais por `numero_sequencia`, que deixou de ser globalmente crescente). CME confirma cada etapa com um clique ("Concluir esta etapa" ou um botão por opção, se for decisão) + campo opcional de devolutiva; `_cmeAvancarFluxoScript` fecha a etapa atual e abre a próxima (ou entra em `DEV:1`, ou encerra o chamado em `'FIM'`). Setores novos cadastrados em `cme_setores` pra cobrir os papéis do PDF: `financeiro`, `cftv`, `fiscal`, `sup_seguros`, `aux_devolucao`, `vendedor`, `andersson` (sem contato ainda — cadastrar em CME › Setores). Testado só em Playwright local com Supabase mockado (fluxo linear até resolver, decisão que entra no Fluxo de Devolução, e o modo livre "Outro" continua funcionando); **não validado com a CME de verdade**.
> 🟢 **Painel de Indicadores › Descarrego na seção Distribuição (v4.89.359, 2026-11-26):** pedido do usuário — o descarrego vai para Distribuição. O card saiu de "Receitas Armazém" e virou a aba própria **Descarrego** (`aba-descarrego`, seção Distribuição em `PAINEL_IND_SECOES`). `carregarPainelDescarrego` soma duas fontes: "Chapas" de `despesas_armazem` (histórico, desde 10/08/2026) + `despesas_viagem` tipo `descarrego` (lançado por carga; unidade vem de `demandas_rota.unidade`; carga sem unidade fica fora quando há filtro de unidade e a nota do card avisa). Alias antigo `descarrego → receita-armazem` removido.
> 🟢 **Divergências sem cancelados (v4.89.340, 2026-11-25):** a lista de Divergências ERP esconde pedidos com situação CA (cancelado no ERP) — filtro na consulta `v_divergencias_erp?or=(situacao.is.null,situacao.neq.CA)`; a view em si continua completa. Ficam só as divergências reais (cargas divergentes entre as planilhas).
> 🟢 **Histórico — Divergências rápida + cabeçalho enxuto de Pedidos (v4.89.339, 2026-11-25):** Divergências lê a view `v_divergencias_erp` (tipo ausente/semcarga/divergente, cruzamento feito no banco, ~60 ms; antes baixava 10 mil pedidos em lotes, ~14 s). A versão antiga olhava só 10.000 dos 17.284 pedidos com carga_erp, por isso a contagem subiu de 111 para 195 (todos os 178 ausentes são pedidos CANCELADOS CA — esperado; aguarda decisão do usuário se esconde). Pedidos: sem parágrafo nem cartões grandes; barra única (abas + situação + resumo + Atualizar).
> 🟢 **Histórico — Divergências, Cortes e linha de Cargas (v4.89.338, 2026-11-25):** Divergências e Cortes/Trocas usam o mesmo visual (`.cerp-*`, abas com contador por tipo, linhas de duas linhas; os cartões de resumo saíram); bloqueios BC/BG também. Divergências agora mostra cliente e dias do pedido, mais antigo primeiro. Na lista de Cargas do ERP a linha mostra SÓ tempo em aberto (Espera), nº de pedidos e valor — a pedido do usuário saíram cliente, vendedor, unidade, situação ERP e NF da linha (unidade segue como filtro; NF segue como agrupamento Prontas/Aguardando NF; alerta vermelho de conferente só aparece quando há conferência). `_cerpPartes` ficou sem uso na linha.
> 🟢 **Histórico — layout novo de Cargas do ERP e Pedidos (v4.89.337, 2026-11-25):** linhas de duas linhas (classes `.cerp-*` no CSS), abas Sem lançar/Já lançadas/Internas/Ignoradas/Todas (só "Sem lançar" tem contador — o das outras seria total geral e enganaria), botões de unidade e ordem (campos hidden `hist-cerp-sit/und/ordem` + `cerpSeg`), busca por nº de carga OU nome de cliente (via `v_cargas_erp_info.clientes_nomes`), "Sem lançar" agrupado em Prontas para lançar (NF em todos os pedidos) e Aguardando nota fiscal. Pedidos: situação do ERP por extenso (Romaneio, Manifestado, Faturado…) com filtro; pedidos cancelados (CA) NÃO aparecem mais (decisão do usuário; a tabela `pedidos_sem_carga` não foi alterada).
> 🟢 **Histórico — abas Pedidos, Cargas do ERP e Lançamentos (v4.89.336, 2026-11-25):** Pedidos = pedidos sem carga do mais antigo ao mais novo com dias de espera (desde data_pedido, Salvador); separa Pendentes / Cancelados no ERP (situação CA) / Já em carga (acha o pedido em base_data com carga) — dos 109 de hoje só 17 eram pendentes de verdade. Cargas do ERP = só `sem lançar` por padrão (todas as idades, mais antigas primeiro, coluna Espera em dias); ao lançar/associar a rota some (vai p/ "Já lançadas"); KPIs: cargas, pedidos, valor, mais antiga. Lançamentos = cada carga lançada mostra pedidos e valor (v_cargas_erp), clique abre os pedidos (base_data), e Agrupar por motorista/ajudante soma cargas/pedidos/valor. Divergências e Cortes não foram alteradas.
> 🟢 **Cargas do ERP — colunas do ERP (v4.89.333, 2026-11-25):** a aba mostra Unid., situação ERP (MA/RO/DI/VO/CL), NF emitida (pedidos com NF/total + data), código do vendedor e nomes dos clientes, mais filtro de unidade. Vêm da view `v_cargas_erp_info` (security_invoker; une `base_data` + `pedidos_info_erp`; `base_data.und` vem vazio — a unidade REAL é `pedidos_info_erp.unidade_erp`: 1 CD, 3 Petrolina). Só vendedor em CÓDIGO: não há tabela de nomes dos vendedores do ERP. Falha ao ler a view: aviso na aba (com filtro de unidade, erro).
> 🟢 **Portal do Conferente reformulado (v4.89.321, 2026-11-24):** não existe mais a lista "Disponíveis para pegar" — o conferente **pesquisa a carga pelo número** (`buscarCargaConferente` → `cfIr`), vê o resumo (pedidos/clientes/valor, de `v_cargas_erp`) e pega. **Separação** = romaneio inteiro, por produto (inalterada). **Carregamento** (aba antes chamada Conferência) = por pedido OU por romaneio, escolhido ao pegar e guardado em `atribuicoes_armazem.modo_conferencia` (`pedido`|`romaneio`, nulo = não escolheu): por pedido = marcar pedidos (`cfPegar`, vários conferentes dividem); por romaneio = `cfPegarRomaneio` pega TODOS os pedidos (tudo ou nada: se outro já tem algum, ou se alguém pega no mesmo instante, desfaz e avisa) e `cfConferirRomaneio(ok|nok)` grava a conferência de todos os pedidos pendentes de uma vez (NOK exige observação); `cfDesfazerRomaneio` volta a pendente; `cfSoltarTodos` zera o modo. Em ambos os modos os dados são os mesmos (`carga_pedidos_conferente` + `conferencia_pedidos`), então Armazém, ranking e fechamento automático da carga não mudam.
> 🟢 **Expedição: trilhas Operação x Escritório e liberação de "Pronto para viagem" (v4.89.325, 2026-11-24):** o cartão da Expedição (de Separação até Pronto p/ Viagem) mostra duas trilhas — OPERAÇÃO (separação, carregamento, conferida 100%) e ESCRITÓRIO (nota fiscal, boleto, CT-e e manifesto) — com contagem por pedido vinda de `_calcRequisitosViagem` (base_data sem os de `pedidos_cancelados`, `conferencia_pedidos` status ok, `notas_fiscais` só tipo 'nf' conta como NF; boleto só informa). Entrar em `pronto_viagem` exige conferência 100% e NF em todos os pedidos: `_expGateProntoViagem` roda em `atualizarStatusDemanda` (botão/menu da Expedição) e em `_patchStatusDemanda` (Caixa, Seguros e demais portais). Sem pedido na base (total 0) não bloqueia e não aparece como completo; erro de leitura BLOQUEIA (nunca assume que está certo). Perfis admin/gestor/exped_admin/adm_distribuicao podem "liberar assim mesmo" informando o motivo (prompt); fica em `historico_status_carga.origem` como `liberado_admin: <motivo>`. "CT-e e manifesto" não tem campo próprio: é o próprio passo que leva a Pronto p/ viagem. Botão de avanço fica cinza com cadeado quando falta algo (o clique explica). Não altera cargas que já passaram de pronto_viagem. Testado só em navegador local com gravações bloqueadas; NÃO validado com o fiscal/expedição reais.
> 🟢 **Aba Fiscal (v4.89.322, 2026-11-24):** os contadores são por PEDIDO e só documento `tipo='nf'` vale como NF (o banco só tem `nf` e `boleto`; boleto NÃO conta como NF): Pedidos = Com NF + Sem NF; "Prontos para emitir" = conferido OK pelo armazém e sem NF. Helpers `_fiscalSitPedido` (pronto|espera|feito) e `_fiscalResumoCarga`. Cards ordenados (cargas com pedido pronto primeiro, completas por último) e o drawer agrupa os pedidos em Prontos / Aguardando conferência-NOK / Com NF (esmaecidos). Só a página `carregarPaginaFiscal` foi alterada: `carregarPortalFiscal` (portal-fiscal-wrapper) está sem uso e mantém a conta antiga. O avanço de status da Expedição continua NÃO exigindo NF/boleto/manifesto (mockup Operação x Escritório ainda aguarda aprovação do usuário).

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
