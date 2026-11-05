-- Tabela do "Histórico — Crédito Manual" (Distribuição). Hoje a tela abre e mostra
-- "A tabela credito_manual_historico ainda não existe no banco"; salvar também falha.
-- Pedido do Gabriel, 2026-11-05. Só o Daniel (ou quem tem acesso ao SQL Editor do Supabase) cria.
--
-- Colunas = exatamente o que o index.html grava (cmSalvar) e lê (carregarCreditoManual / renderCreditoManual).
-- Seguro rodar mais de uma vez (IF NOT EXISTS). Não apaga nem altera dado nenhum.
--
-- RLS: NÃO é ativado, de propósito. O app inteiro usa a mesma chave anon (ver AUDITORIA-SEGURANCA-2026-10-27.md);
-- ligar RLS já "zerou" os dados duas vezes em produção (15/09 e 18/09). NÃO marque "Enable RLS" nesta tabela.
-- Dinheiro: guarda só o registro (histórico) de créditos dados a clientes; não faz pagamento nem cálculo financeiro.

CREATE TABLE IF NOT EXISTS public.credito_manual_historico (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_cliente  text,
  pedido          text          NOT NULL,
  valor_credito   numeric(12,2) NOT NULL,
  valor_pedido    numeric(12,2),
  data_emissao    date,
  numero_nota     text,
  peso_faltante   numeric(12,3),
  evidencia_foto  boolean,
  criado_em       timestamptz   NOT NULL DEFAULT now(),
  criado_por      text
);

-- Caso a tabela já exista de uma versão anterior sem a última coluna:
ALTER TABLE public.credito_manual_historico ADD COLUMN IF NOT EXISTS evidencia_foto boolean;

-- A lista da tela ordena por criado_em (mais recente primeiro) e o pedido é a busca natural.
CREATE INDEX IF NOT EXISTS credito_manual_historico_criado_em_idx ON public.credito_manual_historico (criado_em DESC);
CREATE INDEX IF NOT EXISTS credito_manual_historico_pedido_idx    ON public.credito_manual_historico (pedido);

-- Faz a API REST enxergar a tabela na hora (o Supabase costuma recarregar sozinho; isto só garante).
NOTIFY pgrst, 'reload schema';
