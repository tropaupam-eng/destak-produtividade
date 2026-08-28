-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: motoristas_add_telefone
-- Data: 2026-08-28
-- Objetivo: Guardar o telefone/WhatsApp do motorista já no cadastro, pra não
--           depender de anotar em outro lugar (ex: ferramenta de chat externa)
--           toda vez que precisar enviar acesso/instrução pra ele.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS telefone text;
