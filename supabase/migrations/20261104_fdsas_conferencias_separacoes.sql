-- FDSAS -> Cronos: quem conferiu cada carga e quem separou cada pedido (expedição interna do CD).
--
-- Para quê: acompanhamento de devolução. Cada ocorrência de devolução (ocorrencias_distribuicao) passa a poder
-- mostrar QUEM CONFERIU a carga e QUEM SEPAROU o pedido, a partir dos lançamentos do FDSAS (sistema da expedição),
-- e permite painéis por pessoa (por exemplo, erros por conferente no mês, dividido pelas cargas que ele conferiu).
--
-- Origem dos dados: FDSAS (Supabase ecdqaqswzdnluzseaerq), tabelas conference_entries, separation_entries e
-- separator_load_entries. A conferência no FDSAS é por CARGA; a separação é por PEDIDO.
-- Quem alimenta estas tabelas: uma rotina de importação (a definir com o Daniel: função agendada do Supabase ou envio
-- pelo FDSAS). Este arquivo só cria a estrutura; não importa nada.
--
-- ESTE ARQUIVO NÃO É APLICADO SOZINHO (o workflow só publica o Pages). Revisar e rodar no SQL Editor do Supabase.
-- Só CRIA objetos novos: não altera nem apaga nada que já exista. Reversão no fim do arquivo.
--
-- RLS: NÃO é ativado, de propósito. O app inteiro usa a mesma chave anon (ver AUDITORIA-SEGURANCA-2026-08-20.md);
-- ligar RLS aqui quebraria a importação e a tela. ATENÇÃO À PRIVACIDADE: estas tabelas guardam nomes de pessoas ligados
-- a conferências e separações, legíveis com a chave pública, como o resto do banco. Decisão do Daniel antes de aplicar.
--
-- Escopo: as tabelas guardam o que vier do FDSAS (inclusive o setor "Abastecimento de Filiais - Lojas"). O recorte
-- "só CD" é feito na consulta (coluna unidade_carga da view), não aqui.

begin;

-- 1) Pessoas: tradução do código do FDSAS para uma pessoa, ligada ao cadastro do Cronos.
--    O FDSAS só guarda o código (uuid); o nome vem de um retrato gravado pelo próprio FDSAS ou preenchido à mão aqui.
create table if not exists public.fdsas_pessoas (
  fdsas_id       uuid primary key,
  nome           text,
  papel          text not null check (papel in ('conferente', 'separador')),
  cronos_tabela  text check (cronos_tabela in ('conferentes', 'ajudantes')),
  cronos_id      uuid,
  ativo          boolean not null default true,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint ck_fdsas_pessoas_vinculo check ((cronos_tabela is null) = (cronos_id is null))
);
comment on table public.fdsas_pessoas is
  'Código de pessoa do FDSAS -> nome e vínculo com conferentes/ajudantes do Cronos. Preenchida pela importação e corrigida à mão.';
comment on column public.fdsas_pessoas.cronos_id is
  'id do cadastro do Cronos (conferentes.id ou ajudantes.id, conforme cronos_tabela). Confirmado por uma pessoa, nunca só pelo nome.';

-- 2) Conferências: UMA linha por conferência lançada no FDSAS (por carga).
create table if not exists public.fdsas_conferencias (
  id                   uuid primary key,                 -- mesmo id do registro no FDSAS (permite reimportar sem duplicar)
  carga                integer not null,
  conferente_fdsas_id  uuid not null,
  conferente_nome      text,                             -- retrato do nome na hora da importação (pode estar vazio)
  pedidos              integer,                          -- order_count do FDSAS: quantos pedidos a carga tinha
  setor                text,                             -- sector_snapshot do FDSAS (ex.: Expedição - interno)
  lancada_em           timestamptz not null,             -- created_at do FDSAS: horário do LANÇAMENTO
  conferida_em         timestamptz,                      -- horário real da conferência, quando o FDSAS passar a informar
  tipo                 text,                             -- total / parcial / reconferencia, quando o FDSAS passar a informar
  atualizado_fdsas_em  timestamptz,                      -- updated_at do FDSAS (edições posteriores)
  importado_em         timestamptz not null default now(),
  constraint ck_fdsas_conf_pedidos check (pedidos is null or pedidos >= 0)
);
create index if not exists ix_fdsas_conf_carga     on public.fdsas_conferencias (carga);
create index if not exists ix_fdsas_conf_conf      on public.fdsas_conferencias (conferente_fdsas_id);
create index if not exists ix_fdsas_conf_lancada   on public.fdsas_conferencias (lancada_em desc);
comment on table public.fdsas_conferencias is
  'Conferências lançadas no FDSAS, uma por linha, por CARGA. Fonte: conference_entries do FDSAS.';

-- 3) Separações: UMA linha por lançamento de separação no FDSAS (por pedido).
create table if not exists public.fdsas_separacoes (
  id                   uuid primary key,                 -- mesmo id do registro no FDSAS
  pedido               text not null,                    -- texto, igual a ocorrencias_distribuicao.pedido
  separador_fdsas_id   uuid not null,
  separador_nome       text,
  quantidade           numeric,
  situacao             text,                             -- approval_status do FDSAS: approved / pending / rejected
  setor                text,
  lancada_em           timestamptz not null,             -- created_at do FDSAS
  atualizado_fdsas_em  timestamptz,                      -- updated_at do FDSAS
  importado_em         timestamptz not null default now()
);
create index if not exists ix_fdsas_sep_pedido     on public.fdsas_separacoes (pedido);
create index if not exists ix_fdsas_sep_separador  on public.fdsas_separacoes (separador_fdsas_id);
create index if not exists ix_fdsas_sep_lancada    on public.fdsas_separacoes (lancada_em desc);
comment on table public.fdsas_separacoes is
  'Separações lançadas no FDSAS, uma por linha, por PEDIDO. Um pedido pode ter mais de uma pessoa. Fonte: separation_entries do FDSAS.';

-- 4) Consulta pronta: cada ocorrência de devolução com quem conferiu a carga e quem separou o pedido.
--    Não altera ocorrencias_distribuicao. A coluna unidade_carga (lancamentos.und) permite filtrar só o CD ("1 - CD").
--    Separações rejeitadas no FDSAS não entram.
create or replace view public.v_ocorrencias_responsaveis as
select
  o.id                      as ocorrencia_id,
  o.pedido,
  o.carga,
  o.rota,
  o.tipo,
  o.status,
  o.criado_em,
  o.conferente              as conferente_digitado,
  u.und                     as unidade_carga,
  cf.conferentes_fdsas,
  cf.qtd_conferencias,
  cf.primeira_conferencia_em,
  sp.separadores_fdsas
from public.ocorrencias_distribuicao o
left join lateral (
  select l.und
    from public.lancamentos l
   where l.carga = o.carga
   order by l.criado_em
   limit 1
) u on true
left join lateral (
  select string_agg(distinct coalesce(p.nome, fc.conferente_nome, 'ID ' || left(fc.conferente_fdsas_id::text, 8)), ' / ') as conferentes_fdsas,
         count(*)         as qtd_conferencias,
         min(fc.lancada_em) as primeira_conferencia_em
    from public.fdsas_conferencias fc
    left join public.fdsas_pessoas p on p.fdsas_id = fc.conferente_fdsas_id
   where fc.carga = o.carga
) cf on true
left join lateral (
  select string_agg(distinct (coalesce(p.nome, fs.separador_nome, 'ID ' || left(fs.separador_fdsas_id::text, 8))
                              || ' (' || coalesce(fs.quantidade::text, '?') || ')'), '; ') as separadores_fdsas
    from public.fdsas_separacoes fs
    left join public.fdsas_pessoas p on p.fdsas_id = fs.separador_fdsas_id
   where fs.pedido = btrim(o.pedido)
     and fs.situacao is distinct from 'rejected'
) sp on true;
comment on view public.v_ocorrencias_responsaveis is
  'Ocorrências de devolução com quem conferiu a carga e quem separou o pedido (FDSAS). Filtre unidade_carga = ''1 - CD'' para o recorte do CD.';

commit;

-- ---------------------------------------------------------------------------------------------------------------
-- CONFERIR DEPOIS DE APLICAR (só leitura):
--   select count(*) from public.fdsas_conferencias;      -- 0 até a importação rodar
--   select * from public.v_ocorrencias_responsaveis limit 5;   -- deve devolver ocorrências, com os campos do FDSAS vazios
--
-- REVERSÃO (descomente e rode só se for desfazer; nenhum dado de negócio do Cronos é apagado, tudo aqui vem do FDSAS e pode
-- ser reimportado):
--   drop view  if exists public.v_ocorrencias_responsaveis;
--   drop table if exists public.fdsas_separacoes;
--   drop table if exists public.fdsas_conferencias;
--   drop table if exists public.fdsas_pessoas;
-- ---------------------------------------------------------------------------------------------------------------
