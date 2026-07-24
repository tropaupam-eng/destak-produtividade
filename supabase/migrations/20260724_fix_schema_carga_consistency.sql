-- Migration: Fix Supabase Schema - Carga Field Consistency & Unification
-- Date: 2026-07-24
-- Purpose:
--   1. Standardize carga field type (VARCHAR → INTEGER) across all tables
--   2. Add indexes for fast lookups by carga
--   3. Establish proper FK constraints
--   4. Create unified query view for accessing all info by carga

-- ============================================
-- STEP 1: Standardize carga field type to INTEGER
-- ============================================

-- base_data: carga is already INTEGER, add index if missing
CREATE INDEX IF NOT EXISTS idx_base_data_carga ON base_data(carga);

-- demandas_rota: convert carga from VARCHAR to INTEGER
ALTER TABLE demandas_rota
  ALTER COLUMN carga TYPE INTEGER USING carga::INTEGER;

CREATE INDEX IF NOT EXISTS idx_demandas_rota_carga ON demandas_rota(carga);

-- lancamentos: ensure carga is INTEGER with index
ALTER TABLE lancamentos
  ALTER COLUMN carga TYPE INTEGER;

CREATE INDEX IF NOT EXISTS idx_lancamentos_carga ON lancamentos(carga);

-- ============================================
-- STEP 2: Add Foreign Key Constraints
-- ============================================

-- lancamentos → base_data via carga
ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_base_data
  FOREIGN KEY (carga) REFERENCES base_data(carga) ON DELETE CASCADE
  NOT VALID;

-- Validate constraint after adding (for existing data compatibility)
ALTER TABLE lancamentos
  VALIDATE CONSTRAINT fk_lancamentos_base_data;

-- demandas_rota → base_data via carga
ALTER TABLE demandas_rota
  ADD CONSTRAINT fk_demandas_rota_base_data
  FOREIGN KEY (carga) REFERENCES base_data(carga) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE demandas_rota
  VALIDATE CONSTRAINT fk_demandas_rota_base_data;

-- retorno_veiculos → demandas_rota via demanda_id
ALTER TABLE retorno_veiculos
  ADD CONSTRAINT fk_retorno_veiculos_demandas
  FOREIGN KEY (demanda_id) REFERENCES demandas_rota(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE retorno_veiculos
  VALIDATE CONSTRAINT fk_retorno_veiculos_demandas;

-- ============================================
-- STEP 3: Create Unified Carga Query View
-- ============================================

CREATE OR REPLACE VIEW vw_carga_completa AS
SELECT
  bd.carga,
  bd.pedido,
  bd.ocorrencia,
  bd.condutor,
  bd.valor_pedido,
  bd.mes_ano,
  l.motorista,
  l.ajudante,
  l.veiculo,
  l.rota,
  l.und,
  l.rire,
  l.vinculado,
  l.pendente,
  l.ts AS lancamento_ts,
  dr.id AS demanda_id,
  dr.status,
  dr.arm_status,
  dr.status_fiscal,
  dr.data_saida,
  dr.ts_saiu,
  dr.ts_fim_viagem,
  rv.data_retorno_agendado,
  rv.data_retorno_real,
  rv.criado_em AS retorno_criado_em
FROM base_data bd
LEFT JOIN demandas_rota dr ON bd.carga = dr.carga
LEFT JOIN lancamentos l ON bd.carga = l.carga
LEFT JOIN retorno_veiculos rv ON dr.id = rv.demanda_id;

COMMENT ON VIEW vw_carga_completa IS 'Unified view to query all information about a cargo by carga number. Joins base_data, demandas_rota, lancamentos, and retorno_veiculos.';

-- ============================================
-- STEP 4: Add Additional Useful Indexes
-- ============================================

-- For status lookups in demandas_rota
CREATE INDEX IF NOT EXISTS idx_demandas_rota_status ON demandas_rota(status);
CREATE INDEX IF NOT EXISTS idx_demandas_rota_arm_status ON demandas_rota(arm_status);
CREATE INDEX IF NOT EXISTS idx_demandas_rota_status_fiscal ON demandas_rota(status_fiscal);

-- For motorista/ajudante lookups
CREATE INDEX IF NOT EXISTS idx_lancamentos_motorista ON lancamentos(motorista);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ajudante ON lancamentos(ajudante);
CREATE INDEX IF NOT EXISTS idx_demandas_rota_motorista ON demandas_rota(motorista);

-- For temporal queries
CREATE INDEX IF NOT EXISTS idx_demandas_rota_data_saida ON demandas_rota(data_saida);
CREATE INDEX IF NOT EXISTS idx_base_data_mes_ano ON base_data(mes_ano);
CREATE INDEX IF NOT EXISTS idx_retorno_veiculos_data_retorno ON retorno_veiculos(data_retorno_real);

-- ============================================
-- STEP 5: Document Schema in Comments
-- ============================================

COMMENT ON TABLE demandas_rota IS 'Cargas em trânsito na expedição. Linked to base_data via INTEGER carga field.';
COMMENT ON COLUMN demandas_rota.carga IS 'Foreign key to base_data.carga - INTEGER type for consistent joins';

COMMENT ON TABLE lancamentos IS 'Lançamentos de cargas (motorista, ajudante, rota, veículo). Linked to base_data via INTEGER carga field.';
COMMENT ON COLUMN lancamentos.carga IS 'Foreign key to base_data.carga - INTEGER type for consistent joins';

COMMENT ON TABLE retorno_veiculos IS 'Datas de retorno de veículos. Linked to demandas_rota via demanda_id.';
COMMENT ON COLUMN retorno_veiculos.demanda_id IS 'Foreign key to demandas_rota.id';

-- ============================================
-- STEP 6: Create Helper Function for Carga Lookup
-- ============================================

CREATE OR REPLACE FUNCTION buscar_carga(p_numero_carga INTEGER)
RETURNS TABLE (
  carga INTEGER,
  pedido TEXT,
  ocorrencia TEXT,
  motorista TEXT,
  ajudante TEXT,
  veiculo TEXT,
  rota TEXT,
  status TEXT,
  arm_status TEXT,
  status_fiscal TEXT,
  data_saida DATE,
  data_retorno_agendado DATE,
  data_retorno_real DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vc.carga,
    vc.pedido,
    vc.ocorrencia,
    vc.motorista,
    vc.ajudante,
    vc.veiculo,
    vc.rota,
    vc.status,
    vc.arm_status,
    vc.status_fiscal,
    vc.data_saida,
    vc.data_retorno_agendado,
    vc.data_retorno_real
  FROM vw_carga_completa vc
  WHERE vc.carga = p_numero_carga;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION buscar_carga(INTEGER) IS 'Helper function to retrieve all information for a specific cargo by carga number.';
