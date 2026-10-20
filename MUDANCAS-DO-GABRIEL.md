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
Pendente/risco: teste visual no navegador ainda por fazer (a lógica foi testada fora do navegador).
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
