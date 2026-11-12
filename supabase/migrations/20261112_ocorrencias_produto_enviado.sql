-- "Produto que foi" na ocorrência de Inversão no Carregamento (Distribuição › Ocorrências).
-- Pedido do Gabriel, 2026-11-12. Quem cria é o Daniel (ou quem tem acesso ao SQL Editor do Supabase).
--
-- Duas colunas NOVAS e OPCIONAIS na tabela que já existe. NÃO apaga nem altera nenhum dado, é seguro rodar mais de uma vez (IF NOT EXISTS)
-- e as ocorrências antigas continuam iguais (as colunas ficam vazias nelas).
--   produto_enviado_codigo    : código do produto que foi carregado no lugar do que devia ir (o mesmo código de pedidos_itens_erp.mercadoria, ex.: '794.0')
--   produto_enviado_descricao : descrição desse produto no ERP (vazio se o código não foi achado nos pedidos)
-- O produto que DEVIA ter ido continua nos itens da ocorrência (ocorrencias_distribuicao_itens), como sempre.
--
-- RLS: NÃO é ativado (a tabela segue como as demais; ligar RLS já zerou dados duas vezes em produção).
-- Enquanto as colunas não existirem, o formulário NÃO quebra: grava a informação na observação e avisa o operador.

ALTER TABLE public.ocorrencias_distribuicao
  ADD COLUMN IF NOT EXISTS produto_enviado_codigo    text,
  ADD COLUMN IF NOT EXISTS produto_enviado_descricao text;

-- Faz a API REST enxergar as colunas na hora (o Supabase costuma recarregar sozinho; isto só garante).
NOTIFY pgrst, 'reload schema';
