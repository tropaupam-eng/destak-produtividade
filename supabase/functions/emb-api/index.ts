import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Achado em auditoria de seguranca 2026-09-28: esta funcao e uma copia
// paralela de pedidos-embalagem-admin, mas a acao "limpar" (apaga TODAS as
// reservas de TODAS as lojas) nao tinha NENHUMA verificacao aqui, enquanto
// a funcao irma exige x-admin-key. Mesma chave EMB_ADMIN_KEY, mesmo
// comportamento fail-closed: sem a secret configurada, a acao fica
// bloqueada (nao vira acesso livre por engano).
const ADMIN_KEY = Deno.env.get("EMB_ADMIN_KEY") ?? "";
// Achado em auditoria de seguranca 2026-09-29: a acao "reservar" desta
// copia (emb-api) continuava sem NENHUMA verificacao mesmo depois da
// correcao de 28/09 (que só cobriu "limpar") — qualquer pessoa com a URL
// alterava reserva de estoque de qualquer loja sem senha. Agora exige a
// mesma chave que pedidos-embalagem/index.ts já usa (EMB_ACCESS_KEY),
// fail-closed.
const ACCESS_KEY = Deno.env.get("EMB_ACCESS_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-key, x-emb-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rpc(nome: string, corpo: unknown) {
  const r = await fetch(URL_SB + "/rest/v1/rpc/" + nome, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CHAVE,
      Authorization: "Bearer " + CHAVE,
    },
    body: JSON.stringify(corpo ?? {}),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(texto);
  return texto ? JSON.parse(texto) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const acao = url.searchParams.get("acao") ?? "estado";

  try {
    if (acao === "estado") {
      return json(await rpc("emb_estado", {}));
    }

    if (acao === "dados") {
      const [itens, lojas] = await Promise.all([
        rpc("emb_estado", {}),
        rpc("emb_resumo_lojas", {}),
      ]);
      return json({ itens, lojas });
    }

    if (acao === "reservar" && req.method === "POST") {
      if (!ACCESS_KEY || req.headers.get("x-emb-key") !== ACCESS_KEY) {
        return json({ erro: "Não autorizado" }, 401);
      }
      const corpo = await req.json();
      const loja = String(corpo.loja ?? "").trim().slice(0, 40);
      const codigo = String(corpo.codigo ?? "").trim();
      const qtd = Math.max(0, parseInt(String(corpo.quantidade ?? "0"), 10) || 0);
      if (!loja || !codigo) return json({ erro: "Dados incompletos" }, 400);
      const r = await rpc("emb_reservar", {
        p_loja: loja,
        p_codigo: codigo,
        p_quantidade: qtd,
      });
      return json(Array.isArray(r) ? r[0] : r);
    }

    if (acao === "limpar" && req.method === "POST") {
      if (!ADMIN_KEY || req.headers.get("x-admin-key") !== ADMIN_KEY) {
        return json({ erro: "Não autorizado" }, 401);
      }
      const corpo = await req.json().catch(() => ({}));
      const loja = corpo.loja ? String(corpo.loja).trim().slice(0, 40) : null;
      return json(await rpc("emb_admin_limpar", { p_loja: loja }));
    }

    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
