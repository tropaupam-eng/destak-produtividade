// Edge Function: backfill-auth-users (uso único, administrativo)
//
// Objetivo: provisionar em auth.users todas as contas ATIVAS das 4 tabelas
// (usuarios/motoristas/ajudantes/conferentes) de uma vez só, sem esperar
// cada pessoa logar organicamente. Mesma logica exata que login-jwt ja usa
// por-login (mesmo id/uuid, mesmo e-mail sintetico {id}@interno.destak.app,
// mesmo mapeamento de perfil por tabela, extraido de verificar_login()).
// Idempotente: pula quem ja existe em auth.users (getUserById antes de criar).
//
// Protegida por header x-admin-key (nao e endpoint publico de uso continuo).
//
// CORRIGIDO 2026-09-19: removido o fallback hardcoded
// ('destak-backfill-2026-09-18') do valor do secret — estava num repo
// PÚBLICO protegendo um endpoint que usa service_role (pode criar contas em
// auth.users com app_metadata.perfil arbitrário). Segredo ausente agora
// derruba a função (fail closed), nunca vira um default público.
//    supabase secrets set BACKFILL_ADMIN_KEY=<valor novo e aleatório>
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_KEY = Deno.env.get("BACKFILL_ADMIN_KEY");
if (!ADMIN_KEY) {
  throw new Error("BACKFILL_ADMIN_KEY não configurada. Defina com: supabase secrets set BACKFILL_ADMIN_KEY=<valor>");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

interface Conta {
  id: string;
  nome: string | null;
  unidade: string | null;
  perfil: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-admin-key" } });
  }
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const key = req.headers.get("x-admin-key");
  if (key !== ADMIN_KEY) return json({ error: "Não autorizado" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const contas: Conta[] = [];
  const erros: string[] = [];

  try {
    // usuarios: perfil = coluna própria
    const { data: usuarios, error: e1 } = await admin.from("usuarios").select("id,nome,unidade,perfil").eq("ativo", true);
    if (e1) throw e1;
    (usuarios ?? []).forEach((r: any) => contas.push({ id: r.id, nome: r.nome, unidade: r.unidade, perfil: r.perfil ?? "usuario" }));

    // motoristas: perfil sempre 'motorista' (mesma regra de verificar_login)
    const { data: motoristas, error: e2 } = await admin.from("motoristas").select("id,nome,unidade").eq("ativo", true).is("data_demissao", null);
    if (e2) throw e2;
    (motoristas ?? []).forEach((r: any) => contas.push({ id: r.id, nome: r.nome, unidade: r.unidade, perfil: "motorista" }));

    // ajudantes: perfil sempre 'ajudante'
    const { data: ajudantes, error: e3 } = await admin.from("ajudantes").select("id,nome,unidade").eq("ativo", true).is("data_demissao", null);
    if (e3) throw e3;
    (ajudantes ?? []).forEach((r: any) => contas.push({ id: r.id, nome: r.nome, unidade: r.unidade, perfil: "ajudante" }));

    // conferentes: perfil = coluna própria, fallback 'conferente'
    const { data: conferentes, error: e4 } = await admin.from("conferentes").select("id,nome,unidade,perfil").eq("ativo", true);
    if (e4) throw e4;
    (conferentes ?? []).forEach((r: any) => contas.push({ id: r.id, nome: r.nome, unidade: r.unidade, perfil: r.perfil ?? "conferente" }));
  } catch (e) {
    return json({ error: "Erro ao buscar contas", detalhe: (e as Error).message }, 500);
  }

  let criados = 0, jaExistiam = 0;
  const CONCORRENCIA = 5;
  for (let i = 0; i < contas.length; i += CONCORRENCIA) {
    const grupo = contas.slice(i, i + CONCORRENCIA);
    await Promise.all(grupo.map(async (conta) => {
      try {
        const { data: existing } = await admin.auth.admin.getUserById(conta.id);
        if (existing?.user) { jaExistiam++; return; }
        const syntheticEmail = `${conta.id}@interno.destak.app`;
        const { error: createErr } = await admin.auth.admin.createUser({
          id: conta.id,
          email: syntheticEmail,
          email_confirm: true,
          app_metadata: { perfil: conta.perfil, unidade: conta.unidade ?? null },
          user_metadata: { nome: conta.nome ?? null },
        });
        if (createErr) { erros.push(`${conta.id} (${conta.perfil}): ${createErr.message}`); return; }
        criados++;
      } catch (e) {
        erros.push(`${conta.id} (${conta.perfil}): ${(e as Error).message}`);
      }
    }));
  }

  return json({ ok: erros.length === 0, total_contas_ativas: contas.length, criados, ja_existiam: jaExistiam, erros });
});
