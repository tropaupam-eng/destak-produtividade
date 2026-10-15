// api-crm-cargas — leitura de cargas + pedidos (com CÓDIGO do cliente) para sistemas de fora do Cronos
// (CRM comercial / Gestor de Tarefas do Rafael). SOMENTE LEITURA, só GET.
//
// Por que existe: antes esses sistemas liam as tabelas pela chave pública (anon) do app, que não
// identifica ninguém e dá acesso a tudo. Aqui há uma chave própria (secret CRM_API_KEY), os campos são
// fixos e limitados, e dá para revogar só este acesso sem tocar no resto.
//
// Falha fechada: sem o secret CRM_API_KEY configurado a função responde 503 e não devolve nada.
// Nada de CPF, e-mail, senha, vendedor, telefone ou dado de pagamento sai por aqui.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const API_KEY = Deno.env.get('CRM_API_KEY') ?? '';

const JANELA_PADRAO_DIAS = 30;
const JANELA_MAX_DIAS = 92;
const MAX_CARGAS_POR_PAGINA = 200;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres da chave acertou)
function chaveConfere(recebida: string, esperada: string): boolean {
  const a = new TextEncoder().encode(recebida);
  const b = new TextEncoder().encode(esperada);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function dataIso(d: Date): string { return d.toISOString().slice(0, 10); }

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return json({ ok: false, erro: 'Use GET.' }, 405);

  // Fecha por padrão: sem chave configurada no servidor, ninguém lê nada.
  if (!API_KEY) return json({ ok: false, erro: 'Acesso ainda não configurado (falta o secret CRM_API_KEY).' }, 503);
  const recebida = req.headers.get('x-api-key') ?? '';
  if (!recebida || !chaveConfere(recebida, API_KEY)) return json({ ok: false, erro: 'Não autorizado. Header x-api-key inválido ou ausente.' }, 401);

  const url = new URL(req.url);
  const p = url.searchParams;
  const hoje = dataIso(new Date());

  // Filtros: cargas=15921,15941  OU  desde/ate (data de saída). Padrão: últimos 30 dias.
  const cargasParam = (p.get('cargas') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (cargasParam.length > MAX_CARGAS_POR_PAGINA) return json({ ok: false, erro: `Máximo ${MAX_CARGAS_POR_PAGINA} cargas em 'cargas'.` }, 400);
  if (cargasParam.some(c => !/^\d{1,9}$/.test(c))) return json({ ok: false, erro: "'cargas' deve ter só números separados por vírgula." }, 400);

  let desde = p.get('desde') ?? '';
  let ate = p.get('ate') ?? '';
  if ((desde && !REGEX_DATA.test(desde)) || (ate && !REGEX_DATA.test(ate))) return json({ ok: false, erro: "'desde' e 'ate' usam o formato AAAA-MM-DD." }, 400);
  if (!cargasParam.length) {
    if (!ate) ate = hoje;
    if (!desde) desde = dataIso(new Date(Date.parse(ate + 'T12:00:00Z') - JANELA_PADRAO_DIAS * 86400000));
    const dias = (Date.parse(ate + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86400000;
    if (dias < 0) return json({ ok: false, erro: "'desde' não pode ser depois de 'ate'." }, 400);
    if (dias > JANELA_MAX_DIAS) return json({ ok: false, erro: `Janela máxima de ${JANELA_MAX_DIAS} dias entre 'desde' e 'ate'.` }, 400);
  }
  const pagina = Math.max(1, Number(p.get('pagina') ?? '1') || 1);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) Cargas (board da Expedição). Campos fixos; cancelada fica de fora.
  let q = supabase.from('demandas_rota')
    .select('carga,rota,status,data_saida,unidade,quantidade_pedidos,valor_total', { count: 'exact' })
    .not('carga', 'is', null).neq('status', 'cancelado')
    .order('data_saida', { ascending: false }).order('carga', { ascending: false });
  if (cargasParam.length) q = q.in('carga', cargasParam.map(Number));
  else q = q.gte('data_saida', desde).lte('data_saida', ate);
  const ini = (pagina - 1) * MAX_CARGAS_POR_PAGINA;
  const { data: cargas, count, error: erroCargas } = await q.range(ini, ini + MAX_CARGAS_POR_PAGINA - 1);
  if (erroCargas) { console.error('[api-crm-cargas] erro cargas:', erroCargas.message); return json({ ok: false, erro: 'Falha ao ler cargas.' }, 500); }

  // 2) Pedidos dessas cargas, com o CÓDIGO do cliente e o nome completo (do ERP).
  const numeros = [...new Set((cargas ?? []).map(c => String(c.carga)))];
  const pedidosPorCarga = new Map<string, Record<string, unknown>[]>();
  for (let i = 0; i < numeros.length; i += 100) {
    const lote = numeros.slice(i, i + 100);
    const { data: peds, error: erroPeds } = await supabase.from('pedidos_info_erp')
      .select('pedido,codigo_cliente,cliente,valor,situacao,data_pedido,unidade_erp,carga_erp')
      .in('carga_erp', lote).neq('situacao', 'CA').limit(5000);
    if (erroPeds) { console.error('[api-crm-cargas] erro pedidos:', erroPeds.message); return json({ ok: false, erro: 'Falha ao ler pedidos.' }, 500); }
    for (const pd of peds ?? []) {
      const k = String(pd.carga_erp);
      if (!pedidosPorCarga.has(k)) pedidosPorCarga.set(k, []);
      pedidosPorCarga.get(k)!.push(pd as Record<string, unknown>);
    }
  }

  // O número da carga é por unidade: se a carga tem unidade ("1 - CD"), só entram pedidos dessa unidade.
  const resultado = (cargas ?? []).map(c => {
    const undNum = c.unidade ? parseInt(String(c.unidade), 10) : NaN;
    const peds = (pedidosPorCarga.get(String(c.carga)) ?? [])
      .filter(pd => Number.isNaN(undNum) || pd.unidade_erp == null || Number(pd.unidade_erp) === undNum)
      .map(pd => ({
        pedido: pd.pedido, codigo_cliente: pd.codigo_cliente, cliente: pd.cliente,
        valor: pd.valor, situacao: pd.situacao, data_pedido: pd.data_pedido,
      }));
    return {
      carga: c.carga, rota: c.rota, status: c.status, data_saida: c.data_saida, unidade: c.unidade,
      quantidade_pedidos: c.quantidade_pedidos, valor_total: c.valor_total, pedidos: peds,
    };
  });

  console.log(`[api-crm-cargas] ok cargas=${resultado.length} pagina=${pagina}`);
  return json({
    ok: true,
    gerado_em: new Date().toISOString(),
    filtro: cargasParam.length ? { cargas: cargasParam } : { desde, ate },
    pagina, por_pagina: MAX_CARGAS_POR_PAGINA, total_cargas: count ?? resultado.length,
    cargas: resultado,
  });
});
