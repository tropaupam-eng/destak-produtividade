-- Libera o setor "qualidade" em motivos_devolucao.
-- Pedido do Gabriel, 2026-11-12. Quem roda é o Daniel (ou quem tem acesso ao SQL Editor do Supabase).
--
-- Ao cadastrar o motivo "Qualidade Insuficiente" no setor Qualidade, o banco recusou:
--   code 23514: new row for relation "motivos_devolucao" violates check constraint "motivos_devolucao_setor_check"
-- ou seja, a regra do banco só aceita os 5 setores antigos. O código do app já conhece o setor (v4.89.287); falta liberar no banco.
--
-- O QUE FAZ: troca a regra para aceitar também 'qualidade'. NÃO apaga nem altera nenhum dado. Os 15 motivos de hoje são todos
-- de setores que continuam aceitos (comercial, mercado, distribuicao, armazem, logistica), então a regra nova passa nas linhas existentes.
-- RLS: NÃO é ativado.
--
-- PASSO 0 (opcional, só para guardar a regra antiga): rode e anote o resultado.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'motivos_devolucao_setor_check';
--
-- PARA DESFAZER: repetir os dois comandos sem 'qualidade' na lista (só funciona se nenhum motivo estiver no setor qualidade).

ALTER TABLE public.motivos_devolucao DROP CONSTRAINT IF EXISTS motivos_devolucao_setor_check;

ALTER TABLE public.motivos_devolucao
  ADD CONSTRAINT motivos_devolucao_setor_check
  CHECK (setor IN ('armazem', 'distribuicao', 'comercial', 'mercado', 'logistica', 'qualidade'));
