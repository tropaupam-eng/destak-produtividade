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
