-- Trigger: propagar mudança de número de carga para tabelas relacionadas
-- Quando o campo "carga" em demandas_rota é alterado, o novo número é
-- propagado automaticamente para atribuicoes_armazem, atribuicoes_fiscal,
-- conferencia_pedidos e notas_fiscais — evitando dessincronia de chave.

CREATE OR REPLACE FUNCTION propagar_carga_atualizada()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.carga IS NOT DISTINCT FROM NEW.carga THEN RETURN NEW; END IF;
  IF OLD.carga IS NULL OR NEW.carga IS NULL THEN RETURN NEW; END IF;

  UPDATE atribuicoes_armazem
     SET carga = NEW.carga
   WHERE demanda_id = OLD.id OR carga = OLD.carga;

  UPDATE atribuicoes_fiscal
     SET carga = NEW.carga
   WHERE carga = OLD.carga;

  UPDATE conferencia_pedidos
     SET carga = NEW.carga
   WHERE carga = OLD.carga;

  UPDATE notas_fiscais
     SET carga = NEW.carga
   WHERE carga = OLD.carga;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagar_carga_atualizada ON demandas_rota;

CREATE TRIGGER trg_propagar_carga_atualizada
  AFTER UPDATE OF carga ON demandas_rota
  FOR EACH ROW
  EXECUTE FUNCTION propagar_carga_atualizada();
