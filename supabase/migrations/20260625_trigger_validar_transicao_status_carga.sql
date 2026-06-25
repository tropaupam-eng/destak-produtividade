-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: trigger_validar_transicao_status_carga
-- Data: 2026-06-25
-- Objetivo: Validar transições de status em demandas_rota diretamente no banco,
--           bloqueando qualquer pulo de etapa independente da origem da requisição.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validar_transicao_status_carga()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) IN (
    -- Fluxo normal (avanço obrigatório)
    ('pendente',             'separacao'),
    ('separacao',            'carregamento'),
    ('carregamento',         'aguardando_nf'),
    ('aguardando_nf',        'aguardando_manifesto'),
    ('aguardando_manifesto', 'pronto_viagem'),
    ('pronto_viagem',        'saiu'),
    ('saiu',                 'fim_viagem'),
    ('fim_viagem',           'concluido'),
    -- Cancelamento
    ('pendente',             'cancelado'),
    ('separacao',            'cancelado'),
    ('carregamento',         'cancelado'),
    ('aguardando_nf',        'cancelado'),
    ('aguardando_manifesto', 'cancelado'),
    ('pronto_viagem',        'cancelado'),
    -- Retrocessos administrativos intencionais
    ('separacao',            'pendente'),
    ('carregamento',         'pendente'),
    ('aguardando_nf',        'carregamento'),
    ('aguardando_manifesto', 'carregamento'),
    ('aguardando_manifesto', 'aguardando_nf'),
    ('pronto_viagem',        'carregamento'),
    ('pronto_viagem',        'aguardando_nf'),
    ('saiu',                 'carregamento'),
    ('fim_viagem',           'carregamento')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Transição de status inválida em demandas_rota (id=%): "%" → "%". Respeite o fluxo obrigatório.',
    OLD.id, OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_status_carga ON demandas_rota;

CREATE TRIGGER trg_validar_status_carga
  BEFORE UPDATE OF status ON demandas_rota
  FOR EACH ROW
  EXECUTE FUNCTION validar_transicao_status_carga();
