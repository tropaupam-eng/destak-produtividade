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

// Resposta sempre com Access-Control-Allow-Origin, inclusive em erro — sem
// isso o navegador bloqueia a leitura da resposta e o fetch() do index.html
// falha com "Failed to fetch" (mascarando o erro real). Achado em produção,
// carga 16145, 2026-10-27: o preflight OPTIONS respondia 200, mas o POST de
// verdade nunca chegava a ser enviado pelo navegador, porque o preflight só
// liberava o header Content-Type e o app sempre manda "apikey" também.
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization',
      },
    });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const carga = Number(body?.carga);
    if (!carga || !Number.isInteger(carga) || carga <= 0) {
      return json({ error: 'Informe "carga" (número inteiro válido)' }, 400);
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
      return json({ error: `Nenhum pedido encontrado pra carga ${carga}` }, 404);
    }

    // Dados da carga que a Unniflex pede em cada item (contrato de 2026-10-27): rota, placa e motorista
    // vêm do card da Expedição (demandas_rota). Se a carga tem mais de um card com esse número, vale o da
    // unidade 1 (ou sem unidade) que não esteja cancelado. Placeholders ("A DEFINIR ...") NÃO são enviados.
    const { data: cards, error: errCard } = await supabase
      .from('demandas_rota')
      .select('rota, veiculo, motorista, status, unidade')
      .eq('carga', carga)
      .neq('status', 'cancelado');
    if (errCard) throw errCard;
    const card = (cards || []).find(c => !String(c.unidade ?? '').trim() || String(c.unidade).trim().startsWith('1')) ?? (cards || [])[0];
    const semPlaceholder = (v: unknown) => {
      const t = String(v ?? '').trim();
      return t && !t.toUpperCase().startsWith('A DEFINIR') ? t : '';
    };
    const rotaCarga = semPlaceholder(card?.rota);
    const placaCarga = semPlaceholder(card?.veiculo);
    const motoristaCarga = semPlaceholder(card?.motorista);

    // Ordem de entrega = ORDEM DE CARREGAMENTO INVERTIDA (decisão do usuário, 2026-10-27): o que foi
    // carregado por último sai primeiro. A ordem de carregamento é a definida pela Expedição/Admin na tela
    // de Carregamento (tabela ordem_carregamento: carga, pedido, ordem 1..N). "ordem" enviada = posição 1..N
    // dos pedidos que vão no pacote, do maior para o menor valor de ordem_carregamento.
    // Pedido sem ordem de carregamento vai depois dos que têm (por número de pedido). Carga sem NENHUMA ordem
    // de carregamento definida cai na regra provisória (número do pedido crescente) e a resposta avisa em
    // "ordem_origem" — nunca é apresentada como se fosse a ordem real.
    const { data: ordensCarregamento, error: errOrdem } = await supabase
      .from('ordem_carregamento')
      .select('pedido, ordem')
      .eq('carga', carga);
    if (errOrdem) throw errOrdem;
    const ordemCarregamento = new Map<number, number>();
    (ordensCarregamento || []).forEach(r => ordemCarregamento.set(Number(r.pedido), Number(r.ordem)));
    const pedidosComOrdemCarregamento = pedidos.filter(p => ordemCarregamento.has(Number(p.pedido))).length;
    const ordemOrigem = pedidosComOrdemCarregamento === 0
      ? 'provisoria_por_numero_do_pedido'
      : (pedidosComOrdemCarregamento === pedidos.length ? 'carregamento_invertida' : 'carregamento_invertida_parcial');
    pedidos.sort((a, b) => {
      const oa = ordemCarregamento.get(Number(a.pedido));
      const ob = ordemCarregamento.get(Number(b.pedido));
      if (oa != null && ob != null) return ob - oa;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return Number(a.pedido) - Number(b.pedido);
    });

    // Coordenadas do cliente: primeiro pelo CÓDIGO do cliente (pedidos_info_erp.codigo_cliente ->
    // geolocalizacao_clientes.codigo_cliente) e só depois, como reserva, pelo NOME (maiúsculo/trim).
    // Pelo nome sozinho falhava quando o nome do pedido não era idêntico ao cadastrado (achado na
    // carga 16145, 2026-10-27: ISRRAEL DO TEMPERO DA SILVA GONÇALVES tinha coordenada pelo código
    // e foi pulado). Filtros .in() só são aplicados quando há valores — lista vazia gera "in.()",
    // sintaxe inválida no PostgREST — e em lotes, pra não estourar o tamanho da URL.
    const LOTE_IN = 150;

    // pedido -> código do cliente
    const codigoPorPedido = new Map<number, string>();
    const numerosPedido = [...new Set(pedidos.map(p => Number(p.pedido)).filter(Number.isFinite))];
    for (let i = 0; i < numerosPedido.length; i += LOTE_IN) {
      const { data: infos, error: errInfo } = await supabase
        .from('pedidos_info_erp')
        .select('pedido, codigo_cliente')
        .in('pedido', numerosPedido.slice(i, i + LOTE_IN));
      if (errInfo) throw errInfo;
      (infos || []).forEach(r => {
        const cod = String(r.codigo_cliente ?? '').trim();
        if (cod) codigoPorPedido.set(Number(r.pedido), cod);
      });
    }

    // coordenadas por código
    const geoPorCodigo = new Map<string, { lat: number; lng: number }>();
    const codigos = [...new Set([...codigoPorPedido.values()])];
    for (let i = 0; i < codigos.length; i += LOTE_IN) {
      const { data: geoCod, error: errGeoCod } = await supabase
        .from('geolocalizacao_clientes')
        .select('codigo_cliente, latitude, longitude')
        .in('codigo_cliente', codigos.slice(i, i + LOTE_IN));
      if (errGeoCod) throw errGeoCod;
      (geoCod || []).forEach(g => {
        const cod = String(g.codigo_cliente ?? '').trim();
        if (cod && g.latitude != null && g.longitude != null) {
          geoPorCodigo.set(cod, { lat: Number(g.latitude), lng: Number(g.longitude) });
        }
      });
    }

    // reserva: coordenadas por nome
    const nomesClientes = [...new Set(pedidos.map(p => (p.cliente || '').trim().toUpperCase()).filter(Boolean))];
    const geoPorNome = new Map<string, { lat: number; lng: number }>();
    for (let i = 0; i < nomesClientes.length; i += LOTE_IN) {
      const { data: geo, error: errGeo } = await supabase
        .from('geolocalizacao_clientes')
        .select('nome_cliente, latitude, longitude')
        .in('nome_cliente', nomesClientes.slice(i, i + LOTE_IN));
      if (errGeo) throw errGeo;
      (geo || []).forEach(g => {
        const nome = (g.nome_cliente || '').trim().toUpperCase();
        if (nome && g.latitude != null && g.longitude != null) {
          geoPorNome.set(nome, { lat: Number(g.latitude), lng: Number(g.longitude) });
        }
      });
    }

    const enviar: Array<Record<string, unknown>> = [];
    const pulados: Array<{ pedido: number; cliente: string }> = [];
    let casadosPorCodigo = 0;
    let casadosPorNome = 0;
    pedidos.forEach(p => {
      const nome = (p.cliente || '').trim().toUpperCase();
      const cod = codigoPorPedido.get(Number(p.pedido));
      let coord = cod ? geoPorCodigo.get(cod) : undefined;
      if (coord) {
        casadosPorCodigo++;
      } else {
        coord = geoPorNome.get(nome);
        if (coord) casadosPorNome++;
      }
      if (!coord) {
        pulados.push({ pedido: p.pedido, cliente: p.cliente || '' });
        return;
      }
      // destino_nome (endereço por extenso) e telefone_destinatario NÃO
      // existem em nenhuma tabela deste sistema hoje — omitidos de
      // propósito (campos opcionais no contrato da Unniflex) em vez de
      // inventar um valor falso.
      const item: Record<string, unknown> = {
        numero_pedido: String(p.pedido),
        carga: String(carga),
      };
      if (rotaCarga) item.rota = rotaCarga;
      if (placaCarga) item.placa = placaCarga;
      if (motoristaCarga) item.motorista = motoristaCarga;
      item.ordem = enviar.length + 1;
      item.tipo = 'entrega';
      item.nome_destinatario = p.cliente || '';
      item.destino_lat = coord.lat;
      item.destino_lng = coord.lng;
      enviar.push(item);
    });

    // body.simular === true: monta o payload e devolve SEM chamar a Unniflex (conferência do formato).
    const simular = body?.simular === true;

    let statusUnniflex: number | null = null;
    let corpoResposta: string | null = null;
    if (enviar.length && !simular) {
      const resp = await fetch(UNNIFLEX_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enviar),
      });
      statusUnniflex = resp.status;
      corpoResposta = (await resp.text().catch(() => '')).slice(0, 2000);
    }

    return json({
      carga,
      total_pedidos: pedidos.length,
      enviados: simular ? 0 : enviar.length,
      pulados_sem_coordenada: pulados,
      casados_por_codigo: casadosPorCodigo,
      casados_por_nome: casadosPorNome,
      ordem_origem: ordemOrigem,
      pedidos_sem_ordem_carregamento: pedidos.length - pedidosComOrdemCarregamento,
      status_unniflex: statusUnniflex,
      resposta_unniflex: corpoResposta,
      ...(simular ? { simulacao: true, payload: enviar } : {}),
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
