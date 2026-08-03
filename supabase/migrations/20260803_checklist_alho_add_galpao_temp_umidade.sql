-- ════════════════════════════════════════════════════════════════════════════════
-- CHECKLIST ALHO: TEMPERATURA E UMIDADE DO GALPÃO
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE checklist_alho ADD COLUMN IF NOT EXISTS temp_galpao NUMERIC;
ALTER TABLE checklist_alho ADD COLUMN IF NOT EXISTS umid_galpao NUMERIC;
