-- ════════════════════════════════════════════════════════════════════════════════
-- ERP v2.0: SCHEMA PARA LOGGING E HISTÓRICO
-- ════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────
-- 1. TABELA: base_data_erp_teste (ADICIONAR COLUNAS DE RASTREAMENTO)
-- ─────────────────────────────────────────────────────────────────────────────────

ALTER TABLE base_data_erp_teste ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW();
ALTER TABLE base_data_erp_teste ADD COLUMN IF NOT EXISTS acao_ultima TEXT DEFAULT 'NOVO';
ALTER TABLE base_data_erp_teste ADD COLUMN IF NOT EXISTS promovido_em TIMESTAMP;
ALTER TABLE base_data_erp_teste ADD COLUMN IF NOT EXISTS versao_erp INTEGER DEFAULT 1;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 2. TABELA: erp_historico (NOVO - RASTREIA TODAS AS MUDANÇAS)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_historico (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL,
  numero_pedido_erp INTEGER,
  acao TEXT NOT NULL,
  detalhes JSONB,
  timestamp_acao TIMESTAMP DEFAULT NOW(),
  criado_em TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_pedido FOREIGN KEY (pedido_id)
    REFERENCES base_data_erp_teste(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_historico_pedido ON erp_historico(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historico_numero_pedido ON erp_historico(numero_pedido_erp);
CREATE INDEX IF NOT EXISTS idx_historico_acao ON erp_historico(acao);
CREATE INDEX IF NOT EXISTS idx_historico_timestamp ON erp_historico(timestamp_acao DESC);

-- ─────────────────────────────────────────────────────────────────────────────────
-- 3. TABELA: erp_resumo_diario (NOVO - RELATÓRIO DE SINCRONIZAÇÕES)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_resumo_diario (
  id BIGSERIAL PRIMARY KEY,
  data DATE DEFAULT CURRENT_DATE,
  total_recebidos INTEGER DEFAULT 0,
  total_novos INTEGER DEFAULT 0,
  total_atualizados INTEGER DEFAULT 0,
  total_promovidos INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  timestamp TIMESTAMP DEFAULT NOW(),

  CONSTRAINT uk_data UNIQUE(data)
);

CREATE INDEX IF NOT EXISTS idx_resumo_data ON erp_resumo_diario(data DESC);

-- ─────────────────────────────────────────────────────────────────────────────────
-- 4. VIEW: vw_erp_ultimas_acoes (NOVO - ÚLTIMAS 50 AÇÕES)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_erp_ultimas_acoes AS
SELECT
  h.id,
  h.pedido_id,
  h.numero_pedido_erp,
  h.acao,
  h.detalhes,
  h.timestamp_acao,
  b.carga_erp,
  b.valor_liquido,
  b.status,
  EXTRACT(EPOCH FROM (NOW() - h.timestamp_acao))::INTEGER AS segundos_atras
FROM erp_historico h
LEFT JOIN base_data_erp_teste b ON h.pedido_id = b.id
ORDER BY h.timestamp_acao DESC
LIMIT 50;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 5. VIEW: vw_erp_resumo_hoje (NOVO - RESUMO DO DIA)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_erp_resumo_hoje AS
SELECT
  COUNT(*) FILTER (WHERE acao = 'NOVO') as novos_hoje,
  COUNT(*) FILTER (WHERE acao = 'ATUALIZADO') as atualizados_hoje,
  COUNT(*) FILTER (WHERE acao = 'PROMOVIDO') as promovidos_hoje,
  COUNT(*) FILTER (WHERE acao = 'ERRO') as erros_hoje,
  COUNT(*) as total_acoes,
  MAX(timestamp_acao) as ultima_acao
FROM erp_historico
WHERE DATE(timestamp_acao) = CURRENT_DATE;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 6. FUNÇÃO: atualizar_resumo_diario (NOVO - AUTO-UPDATE DO RESUMO)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION atualizar_resumo_diario()
RETURNS VOID AS $$
BEGIN
  INSERT INTO erp_resumo_diario (data, total_novos, total_atualizados, total_promovidos, total_erros)
  SELECT
    CURRENT_DATE,
    COUNT(*) FILTER (WHERE acao = 'NOVO'),
    COUNT(*) FILTER (WHERE acao = 'ATUALIZADO'),
    COUNT(*) FILTER (WHERE acao = 'PROMOVIDO'),
    COUNT(*) FILTER (WHERE acao = 'ERRO')
  FROM erp_historico
  WHERE DATE(timestamp_acao) = CURRENT_DATE
  ON CONFLICT (data) DO UPDATE SET
    total_novos = EXCLUDED.total_novos,
    total_atualizados = EXCLUDED.total_atualizados,
    total_promovidos = EXCLUDED.total_promovidos,
    total_erros = EXCLUDED.total_erros;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────────
-- 7. TRIGGER: auto_atualizar_resumo (NOVO - CHAMA FUNÇÃO AO INSERIR HISTÓRICO)
-- ─────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE TRIGGER trigger_atualizar_resumo
AFTER INSERT ON erp_historico
FOR EACH STATEMENT
EXECUTE FUNCTION atualizar_resumo_diario();
