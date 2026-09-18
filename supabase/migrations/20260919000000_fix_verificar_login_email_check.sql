-- Função verificar_login — checagem de credencial server-side (SECURITY DEFINER)
-- Dono: postgres (bypassa RLS por definição de papel, RLS não interfere aqui)
-- search_path fixado: public, extensions (mitiga hijack via search_path)
-- EXECUTE liberado pra anon e authenticated (precisa ser assim — roda ANTES do login)
--
-- HISTÓRICO: corrigido em 2026-09-18 nesta sessão — o último bloco de fallback
-- (ativação de ajudante recém-aprovado no 1º login) checava só a senha, sem
-- comparar o e-mail. Bug real explorado ao vivo: qualquer e-mail + a senha
-- certa de QUALQUER ajudante com status='aprovado' logava como esse ajudante,
-- ignorando o e-mail digitado. Corrigido adicionando "email = p_email" nesse
-- bloco também (já existia nos outros 4 blocos).

CREATE OR REPLACE FUNCTION public.verificar_login(p_email text, p_senha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
begin
  select * into r from usuarios
    where email = p_email and ativo = true and senha = crypt(p_senha, senha) limit 1;
  if found then
    return to_jsonb(r) - 'senha';
  end if;

  select * into r from motoristas
    where email = p_email and ativo = true and senha = crypt(p_senha, senha) limit 1;
  if found then
    return (to_jsonb(r) - 'senha') || jsonb_build_object('perfil','motorista');
  end if;

  select * into r from ajudantes
    where email = p_email and senha = crypt(p_senha, senha) and ativo is distinct from false
    limit 1;
  if found then
    return (to_jsonb(r) - 'senha') || jsonb_build_object('perfil','ajudante');
  end if;

  select * into r from conferentes
    where email = p_email and ativo = true and senha = crypt(p_senha, senha) limit 1;
  if found then
    return (to_jsonb(r) - 'senha') || jsonb_build_object('perfil', coalesce(r.perfil,'conferente'));
  end if;

  -- Ativação de ajudante recém-aprovado no 1º login após aprovação do admin
  -- (ativo ainda false). BUG CORRIGIDO 2026-09-18: faltava "email = p_email"
  -- aqui — sem isso, QUALQUER e-mail digitado junto com a senha certa de
  -- QUALQUER ajudante com status='aprovado' logava como esse ajudante,
  -- ignorando o e-mail completamente (falha de autenticação real, achada
  -- ao vivo pelo usuário).
  select * into r from ajudantes
    where status = 'aprovado' and email = p_email and senha = crypt(p_senha, senha) limit 1;
  if found then
    update ajudantes set ativo = true where id = r.id;
    return (to_jsonb(r) - 'senha') || jsonb_build_object('perfil','ajudante','ativo', true);
  end if;

  return null;
end;
$function$;
