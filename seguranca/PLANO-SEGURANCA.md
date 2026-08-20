# Plano de Segurança — Cronos (rollout coordenado, para o dono do Supabase)

> **Para:** o dono do projeto Supabase `hiydkyslgiomdyginfdx`.
> **Contexto:** ver `../AUDITORIA-SEGURANCA-2026-08-20.md`, Parte 1.
> **Por que não é um SQL "drop-in":** hoje o app **não tem identidade** — todo request usa a mesma chave `anon`, o login compara senha no navegador, e a sessão é um JSON no `localStorage`. Ligar RLS ou revogar escrita do `anon` **derruba o app na hora**. Por isso o conserto é **faseado e coordenado** (banco + `index.html` na mesma janela), e **cada fase deve ser testada num branch do Supabase antes de ir pra produção** (Supabase → Branches).
>
> ⚠️ **Todo SQL abaixo é TEMPLATE.** Ajuste nomes de coluna ao seu schema real e teste num branch. Um erro aqui pode **trancar todo mundo pra fora**.

---

## Fase 0 — Chave do ERP (rápido, já preparado no código)

O fallback hardcoded `'destak-erp-2026'` foi removido de `supabase/functions/receber-pedidos-erp/index.ts` (agora falha se o secret faltar). **Antes de redeployar a função:**

```bash
supabase secrets set ERP_API_KEY=<gere um valor novo e aleatório>
# e avise o time do ERP do novo valor
supabase functions deploy receber-pedidos-erp
```

Se redeployar sem setar o secret, o ERP para de autenticar (é de propósito — melhor parar do que rodar com chave pública).

---

## Fase 1 — Tirar a senha do texto puro (banco + login juntos)

Hoje `usuarios.senha` é texto puro, o `SELECT *` traz a senha pro navegador e o JS compara. Esta fase move a comparação pro servidor com hash. **Roda o SQL primeiro, deploya o client junto.**

**1.1 — SQL (testar num branch):**
```sql
create extension if not exists pgcrypto;

-- Hash bcrypt das senhas ainda em texto puro (não re-hasheia o que já é bcrypt).
-- ⚠️ Faça backup da tabela antes. Confirme o nome da coluna de senha.
update usuarios
   set senha = crypt(senha, gen_salt('bf'))
 where senha is not null and senha !~ '^\$2[aby]\$';

-- RPC de login: compara no servidor, NUNCA devolve a senha.
-- Ajuste as colunas retornadas ao que o app usa (perfil, und, etc.).
create or replace function verificar_login(p_email text, p_senha text)
returns table (id bigint, email text, nome text, perfil text, und text, ativo boolean)
language sql
security definer
set search_path = public
as $$
  select id, email, nome, perfil, und, ativo
    from usuarios
   where lower(email) = lower(p_email)
     and ativo = true
     and senha = crypt(p_senha, senha)
$$;
revoke all on function verificar_login(text, text) from public;
grant execute on function verificar_login(text, text) to anon;
```

**1.2 — Client (`index.html`, na função de login ~L8746):** trocar o `SELECT *` + `u.senha === senha` por:
```js
const rows = await supaFetch(`rpc/verificar_login`, {method:'POST', body:JSON.stringify({p_email:e2, p_senha:senha})}) || [];
const u = rows[0];
if(u){ /* logado */ }
```
> O login checa 4 tabelas em cascata (`usuarios`→`motoristas`→`ajudantes`→`conferentes`) e o 1º acesso de motorista/ajudante é por CPF+data de nascimento. **Replique a RPC pras 4 tabelas** (ou uma RPC que faça a cascata) antes de trocar o client, senão motorista/ajudante não loga.

**Ganho:** senha deixa de trafegar e de ser comparada no cliente. **Limite:** ainda não impede o `anon` de ler as outras colunas nem de escrever — isso é Fase 3. Mas tira o pior (246 senhas legíveis em texto puro).

---

## Fase 2 — Supabase Auth (a fundação; é o projeto grande)

Migrar os ~246 usuários pra `auth.users`, login via `supabase.auth.signInWithPassword`, sessão vira **JWT assinado** (mata a sessão forjável do `localStorage`), com o `perfil` em `app_metadata`. Todo `supaFetch` passa a mandar o JWT do usuário em vez da `anon` fixa. É o que habilita a Fase 3 — sem isso, RLS não tem identidade pra avaliar.

## Fase 3 — RLS (só DEPOIS da Fase 2)

Com JWT real, aí sim `alter table ... enable row level security` + policies por `auth.jwt()`. **Não rode antes da Fase 2** — sem identidade, RLS bloqueia o app inteiro. Ordem sugerida: cadastros (`usuarios`/`motoristas`/`ajudantes`/`conferentes`) primeiro (own-row + admin), depois operacionais (`base_data`/`lancamentos`/`demandas_rota`) escopados por unidade/perfil.

---

## Mitigação que NÃO dá pra fazer sem quebrar

A auditoria sugeriu `REVOKE DELETE, UPDATE ON usuarios,... FROM anon` como paliativo. **Verifiquei: quebra o app** — as telas de cadastro (editar/desativar motorista, apagar usuário, transferir setor) fazem PATCH/DELETE nessas tabelas **como anon**, e o fallback de login faz PATCH em `ajudantes`. Sem Auth (Fase 2), o banco não distingue "admin editando" de "atacante apagando" — os dois são `anon`. Então **não há paliativo seguro**; o caminho é Fase 2 → Fase 3.

---
*Preparado pelo Claude a pedido do Rafael. Os fixes de CÓDIGO da auditoria já foram aplicados (ver o "Status de correção" no relatório). Este pacote de banco é do dono, coordenado e testado em branch.*
