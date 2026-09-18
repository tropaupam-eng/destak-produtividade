// Edge Function: login-jwt
//
// Objetivo: dar ao app uma sessão de verdade do Supabase Auth (JWT
// "authenticated" válido) SEM mudar como as pessoas fazem login hoje —
// mesmo e-mail/CPF + senha, mesma tabela (usuarios/motoristas/ajudantes/
// conferentes), mesmo hash bcrypt. Isso é o que permite ligar RLS depois
// sem trocar credencial de ninguém: hoje toda requisição usa a mesma
// chave anon pública; com isso, cada requisição passa a carregar a
// identidade real da pessoa (id, perfil, unidade), que as políticas de
// RLS conseguem checar.
//
// Por que e-mail sintético: ~metade dos motoristas/ajudantes não tem
// e-mail cadastrado (login é por CPF). O Supabase Auth exige um e-mail
// único por usuário só como identificador interno — nunca enviamos nada
// pra esse endereço, ele nunca é mostrado a ninguém.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let body: { email?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }

  const email = (body.email || "").trim();
  const senha = body.senha || "";
  if (!email || !senha) return json({ error: "E-mail/usuário e senha são obrigatórios" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Mesma checagem de sempre — reaproveita verificar_login (bcrypt via
  //    crypt()), sem duplicar nem reimplementar a lógica de senha.
  const { data: perfilRows, error: rpcErr } = await admin.rpc("verificar_login", {
    p_email: email,
    p_senha: senha,
  });
  if (rpcErr) {
    return json({ error: "Erro ao verificar login", detalhe: rpcErr.message }, 500);
  }
  // verificar_login retorna um objeto (jsonb) ou null — não um array.
  const perfil = perfilRows as Record<string, unknown> | null;
  if (!perfil || !perfil.id) {
    return json({ error: "Credenciais inválidas" }, 401);
  }

  const userId = String(perfil.id);
  const syntheticEmail = `${userId}@interno.destak.app`;
  const appMetadata = {
    perfil: perfil.perfil ?? null,
    unidade: perfil.unidade ?? null,
  };

  // 2) Garante o espelho em auth.users com o MESMO id (uuid) já usado nas
  //    tabelas de origem — id estável, nunca duplica identidade.
  const { data: existing } = await admin.auth.admin.getUserById(userId);
  if (!existing?.user) {
    const { error: createErr } = await admin.auth.admin.createUser({
      id: userId,
      email: syntheticEmail,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { nome: perfil.nome ?? null },
    });
    if (createErr) {
      return json({ error: "Erro ao provisionar sessão", detalhe: createErr.message }, 500);
    }
  } else {
    await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  }

  // 3) Gera um link mágico (não é enviado a ninguém) e resgata o token na
  //    hora, pelo próprio backend, devolvendo uma sessão real (access_token
  //    + refresh_token) pro cliente.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: syntheticEmail,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return json({ error: "Erro ao gerar sessão", detalhe: linkErr?.message }, 500);
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr || !verifyData?.session) {
    return json({ error: "Erro ao confirmar sessão", detalhe: verifyErr?.message }, 500);
  }

  // Devolve a sessão (pro cliente guardar e usar como Authorization: Bearer)
  // e o mesmo formato de perfil que verificar_login já devolvia, sem
  // "senha" (já vem sem, de fábrica).
  return json({
    perfil,
    session: {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      expires_at: verifyData.session.expires_at,
    },
  });
});
