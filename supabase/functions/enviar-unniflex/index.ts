import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Integração Cronos → Unniflex (rastreamento de entregas).
//
// Pedido do usuário, 2026-10-27: um botão na Expedição que manda os pedidos
// de uma carga pra Unniflex, com a quantidade de clientes com coordenada
// (os sem latitude/longitude ficam de fora — não existe endereço em texto
// em lugar nenhum do sistema hoje, só lat/lng de geolocalizacao_clientes).
//
// A URL da Unniflex (que carrega um token de acesso embutido no próprio
// caminho) fica SÓ aqui, como secret do servidor — nunca no index.html.
// Colocar essa URL no HTML público do GitHub Pages exporia o token pra
// qualquer um que veja o código-fonte do site (mesma classe de problema já
// documentada em AUDITORIA-SEGURANCA-*.md pra ERP_API_KEY).
//
//    supabase secrets set UNNIFLEX_WEBHOOK_URL=<url completa, com o token>
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const UNNIFLEX_WEBHOOK_URL = Deno.env.get('UNNIFLEX_WEBHOOK_URL');
if (!UNNIFLEX_WEBHOOK_URL) {
  throw new Error('UNNIFLEX_WEBHOOK_URL não configurada. Defina com: supabase secrets set UNNIFLEX_WEBHOOK_URL=<url>');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const carga = Number(body?.carga);
    if (!carga || !Number.isInteger(carga) || carga <= 0) {
      return new Response(JSON.stringify({ error: 'Informe "carga" (número inteiro válido)' }), { status: 400 });
    }

    // Pedidos da carga — um destino por pedido (não por cliente: o mesmo
    // cliente pode ter 2 pedidos na mesma carga, achado real na carga 16049
    // deste sistema — Valeria Silva de Lima apareceu 2x).
    const { data: pedidos, error: errPed } = await supabase
      .from('base_data')
      .select('pedido, cliente')
      .eq('carga', carga);
    if (errPed) throw errPed;
    if (!pedidos || !pedidos.length) {
      return new Response(JSON.stringify({ error: `Nenhum pedido encontrado pra carga ${carga}` }), { status: 404 });
    }

    // Coordenadas por nome de cliente (mesmo critério de match usado em
    // outras telas deste sistema: nome normalizado maiúsculo/trim).
    const nomesClientes = [...new Set(pedidos.map(p => (p.cliente || '').trim().toUpperCase()).filter(Boolean))];
    const { data: geo, error: errGeo } = await supabase
      .from('geolocalizacao_clientes')
      .select('nome_cliente, latitude, longitude')
      .in('nome_cliente', nomesClientes);
    if (errGeo) throw errGeo;
    const geoPorNome = new Map<string, { lat: number; lng: number }>();
    (geo || []).forEach(g => {
      const nome = (g.nome_cliente || '').trim().toUpperCase();
      if (nome && g.latitude != null && g.longitude != null) {
        geoPorNome.set(nome, { lat: Number(g.latitude), lng: Number(g.longitude) });
      }
    });

    const enviar: Array<Record<string, unknown>> = [];
    const pulados: Array<{ pedido: number; cliente: string }> = [];
    pedidos.forEach(p => {
      const nome = (p.cliente || '').trim().toUpperCase();
      const coord = geoPorNome.get(nome);
      if (!coord) {
        pulados.push({ pedido: p.pedido, cliente: p.cliente || '' });
        return;
      }
      // destino_nome (endereço por extenso) e telefone_destinatario NÃO
      // existem em nenhuma tabela deste sistema hoje — omitidos de
      // propósito (campos opcionais no contrato da Unniflex) em vez de
      // inventar um valor falso.
      enviar.push({
        numero_pedido: String(p.pedido),
        tipo: 'entrega',
        nome_destinatario: p.cliente || '',
        destino_lat: coord.lat,
        destino_lng: coord.lng,
      });
    });

    let statusUnniflex: number | null = null;
    let corpoResposta: string | null = null;
    if (enviar.length) {
      const resp = await fetch(UNNIFLEX_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enviar),
      });
      statusUnniflex = resp.status;
      corpoResposta = (await resp.text().catch(() => '')).slice(0, 2000);
    }

    return new Response(JSON.stringify({
      carga,
      total_pedidos: pedidos.length,
      enviados: enviar.length,
      pulados_sem_coordenada: pulados,
      status_unniflex: statusUnniflex,
      resposta_unniflex: corpoResposta,
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
