-- ════════════════════════════════════════════════════════════════════════════════
-- INTEGRAÇÃO ERP: DATA DE ENTREGA
-- ════════════════════════════════════════════════════════════════════════════════
-- Data REAL de entrega do pedido (já aconteceu), enviada pelo ERP num reenvio
-- do mesmo pedido depois que a entrega ocorre. Propagada para entrega_datas
-- (fonte única do OTIF) por erpProcessarDatasEntrega() em index.html.

ALTER TABLE base_data_erp_teste ADD COLUMN IF NOT EXISTS data_entrega DATE;
