import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  gravarEmLotes, apagarPorPedido, apagarPedidosSemCarga,
  calcularMesAno, calcularSemanaMes, sincronizarDemandasRota,
  buscarRotasRI, calcularRire, buscarLancamentosPorCarga,
  removerCanceladosDeBaseData,
} from '../_shared/erp-comum.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// CORRIGIDO 2026-09-19: removido o fallback hardcoded ('destak-erp-2026')
// — estava num repo PÚBLICO protegendo um endpoint que usa service_role.
// Segredo ausente deve derrubar a função, nunca virar um default público.
//    supabase secrets set ERP_API_KEY=<valor novo e aleatório>
const API_KEY = Deno.env.get('ERP_API_KEY');
if (!API_KEY) {
  throw new Error('ERP_API_KEY não configurada. Defina com: supabase secrets set ERP_API_KEY=<valor>');
}

const CAMPOS_OBRIGATORIOS = [
  'id','numero_pedido_erp','cliente_id','unidade_erp',
  'data_pedido','nome_destinatario','fantasia',
  'valor_liquido','valor_bruto','peso_bruto','peso_liquido','volumes'
];

const MAX_PEDIDOS_POR_REQUISICAO = 500;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const LOTE = 200;

function temCarga(p: Record<string, unknown>): boolean {
  return p.carga_erp != null && p.carga_erp !== '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, erro: 'Método não permitido. Use POST.' }, 405);
  }

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== API_KEY) {
    return json({ ok: false, erro: 'Não autorizado. Header x-api-key inválido ou ausente.' }, 401);
  }

  let pedidos: Record<string, unknown>[];
  try {
    const body = await req.json();
    pedidos = Array.isArray(body) ? body : [body];
  } catch {
    return json({ ok: false, erro: 'Body inválido. Envie um array JSON de pedidos.' }, 400);
  }

  if (pedidos.length === 0) {
    return json({ ok: false, erro: 'Nenhum pedido no payload.' }, 400);
  }

  if (pedidos.length > MAX_PEDIDOS_POR_REQUISICAO) {
    return json({
      ok: false,
      erro: `Máximo de ${MAX_PEDIDOS_POR_REQUISICAO} pedidos por requisição excedido (recebidos: ${pedidos.length}).`,
    }, 400);
  }

  for (let idx = 0; idx < pedidos.length; idx++) {
    const p = pedidos[idx];

    const faltando = CAMPOS_OBRIGATORIOS.find(c => p[c] == null || p[c] === '');
    if (faltando) {
      return json({
        ok: false,
        erro: `Campo obrigatório faltando no pedido ${idx}: ${faltando}`,
        indice: idx,
      }, 400);
    }

    if (typeof p.id !== 'number' || typeof p.numero_pedido_erp !== 'number') {
      return json({
        ok: false,
        erro: `Tipos inválidos no pedido ${idx}: id e numero_pedido_erp devem ser numbers`,
      }, 400);
    }

    if (typeof p.data_pedido !== 'string' || !REGEX_DATA.test(p.data_pedido)) {
      return json({
        ok: false,
        erro: `Data inválida no pedido ${idx}: use YYYY-MM-DD`,
      }, 400);
    }

    if (p.data_entrega != null && p.data_entrega !== '' && (typeof p.data_entrega !== 'string' || !REGEX_DATA.test(p.data_entrega))) {
      return json({
        ok: false,
        erro: `data_entrega inválida no pedido ${idx}: use YYYY-MM-DD`,
      }, 400);
    }
  }

  const registrosAuditoria = pedidos.map(p => ({
    id:                p.id,
    cliente_id:        p.cliente_id,
    id_erp_externo:    p.id_erp_externo    ?? null,
    unidade_erp:       p.unidade_erp,
    numero_pedido_erp: p.numero_pedido_erp,
    numero_documento:  p.numero_documento  != null ? String(p.numero_documento) : null,
    tipo_pedido:       p.tipo_pedido       ?? null,
    data_pedido:       p.data_pedido,
    data_documento:    p.data_documento    ?? null,
    valor_liquido:     Number(p.valor_liquido),
    valor_bruto:       Number(p.valor_bruto),
    peso_bruto:        Number(p.peso_bruto),
    peso_liquido:      Number(p.peso_liquido),
    volumes:           Number(p.volumes),
    codigo_cliente:    p.codigo_cliente    != null ? String(p.codigo_cliente) : null,
    nome_destinatario: p.nome_destinatario,
    fantasia:          p.fantasia,
    endereco_texto:    p.endereco_texto    ?? null,
    bairro:            p.bairro            ?? null,
    cep:               p.cep               != null ? String(p.cep) : null,
    rota_erp:          p.rota_erp          ?? null,
    carga_erp:         temCarga(p) ? String(p.carga_erp) : null,
    lat:               p.lat               != null ? Number(p.lat) : null,
    lng:               p.lng               != null ? Number(p.lng) : null,
    status:            p.status            ?? 'pendente',
    data_entrega:      p.data_entrega != null && p.data_entrega !== '' ? String(p.data_entrega) : null,
    criado_em:         p.criado_em         ?? null,
  }));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let resultadoAuditoria: { total: number; erros: string[] };
  try {
    resultadoAuditoria = await gravarEmLotes(supabase, 'base_data_erp_teste', registrosAuditoria, 'id', LOTE);
  } catch (e) {
    console.error('[receber-pedidos-erp] Falha ao gravar em base_data_erp_teste:', (e as Error)?.message ?? e);
    return json({
      ok: false,
      erro: 'Falha ao gravar em base_data_erp_teste',
      total_recebidos: pedidos.length,
      total_gravados: 0,
      ignorados: pedidos.length,
    }, 500);
  }

  if (resultadoAuditoria.erros.length > 0) {
    console.error('[receber-pedidos-erp] Erros ao gravar em base_data_erp_teste:', resultadoAuditoria.erros.join(' | '));
    return json({
      ok: false,
      erro: 'Falha ao gravar em base_data_erp_teste',
      total_recebidos: pedidos.length,
      total_gravados: 0,
      ignorados: pedidos.length,
    }, 500);
  }

  const numerosRecebidos = [...new Set(
    pedidos.map(p => Math.round(Number(p.numero_pedido_erp))).filter(Number.isFinite)
  )];
  const { canceladosSet, pedidosCanceladosRemovidos } = await removerCanceladosDeBaseData(supabase, numerosRecebidos, LOTE);

  const pedidosSemCarga = pedidos.filter(p => !temCarga(p) && !canceladosSet.has(Math.round(Number(p.numero_pedido_erp))));
  const registrosSemCarga = pedidosSemCarga.map(p => ({
    pedido: Math.round(Number(p.numero_pedido_erp)),
    cliente: String(p.nome_destinatario ?? '').trim().slice(0, 200) || null,
    data_pedido: p.data_pedido,
    valor: Number(p.valor_liquido) || 0,
    peso_bruto: Number(p.peso_bruto) || 0,
    volumes: Math.max(0, Number(p.volumes) || 0) || null,
    bairro: String(p.bairro ?? '').trim().slice(0, 100) || null,
    unidade_erp: p.unidade_erp,
    atualizado_em: new Date().toISOString(),
  }));
  if (registrosSemCarga.length) {
    const resultadoSemCarga = await gravarEmLotes(supabase, 'pedidos_sem_carga', registrosSemCarga, 'pedido', LOTE);
    if (resultadoSemCarga.erros.length > 0) {
      console.error('[receber-pedidos-erp] Erros ao gravar em pedidos_sem_carga:', resultadoSemCarga.erros.join(' | '));
    }
  }

  const pedidosComCarga = pedidos.filter(p => temCarga(p) && !canceladosSet.has(Math.round(Number(p.numero_pedido_erp))));
  const cargasUnicas = [...new Set(
    pedidosComCarga.map(p => Math.round(Number(p.carga_erp))).filter(Number.isFinite)
  )];
  const pedidosUnicosComCarga = [...new Set(
    pedidosComCarga.map(p => Math.round(Number(p.numero_pedido_erp))).filter(Number.isFinite)
  )];
  const pedidosUnicos = [...new Set(
    pedidos.map(p => Math.round(Number(p.numero_pedido_erp))).filter(Number.isFinite)
  )];
  const semCarga = pedidosSemCarga.length;

  const lancMapPorCarga = await buscarLancamentosPorCarga(supabase, cargasUnicas);
  const ROTAS_RI = await buscarRotasRI(supabase);

  const baseDataExistenteMap = new Map<number, { cliente: string | null; mes_ano: string | null; vendedor_cod: number | null }>();
  if (pedidosUnicos.length) {
    const { data: existentesRows } = await supabase
      .from('base_data')
      .select('pedido,cliente,mes_ano,vendedor_cod')
      .in('pedido', pedidosUnicos);
    for (const r of existentesRows ?? []) {
      const row = r as Record<string, unknown>;
      baseDataExistenteMap.set(Math.round(Number(row.pedido)), {
        cliente: (row.cliente as string) ?? null,
        mes_ano: (row.mes_ano as string) ?? null,
        vendedor_cod: row.vendedor_cod != null ? Number(row.vendedor_cod) : null,
      });
    }
  }

  const vendedorPorPedido = new Map<number, number>();
  if (pedidosUnicosComCarga.length) {
    const { data: infoRows } = await supabase
      .from('pedidos_info_erp')
      .select('pedido,vendedor')
      .in('pedido', pedidosUnicosComCarga);
    for (const row of (infoRows ?? []) as Record<string, unknown>[]) {
      const v = row.vendedor;
      if (v != null && v !== '' && Number.isFinite(Number(v))) {
        vendedorPorPedido.set(Math.round(Number(row.pedido)), Math.round(Number(v)));
      }
    }
  }

  const registrosProducao: Record<string, unknown>[] = [];
  const mesAnoPorPedido = new Map<number, string>();
  for (const p of pedidosComCarga) {
    const carga = Math.round(Number(p.carga_erp));
    const pedido = Math.round(Number(p.numero_pedido_erp));
    if (!Number.isFinite(carga) || !Number.isFinite(pedido)) continue;

    const dataPedido = String(p.data_pedido);
    const mesAno = calcularMesAno(dataPedido);
    if (!/^\d{4}-\d{2}$/.test(mesAno)) continue;
    mesAnoPorPedido.set(pedido, mesAno);

    const lanc = lancMapPorCarga.get(carga);
    const rota = String(lanc?.rota ?? '').trim().slice(0, 50);
    const valor = Math.max(0, Number(p.valor_liquido) || 0);
    const pesoKg = Math.max(0, Number(p.peso_bruto) || 0);

    registrosProducao.push({
      carga,
      pedido,
      valor,
      peso_kg: pesoKg,
      und: String(lanc?.und ?? '').trim().slice(0, 50),
      rota,
      placa: String(lanc?.veiculo ?? '').trim().toUpperCase().slice(0, 20),
      condutor: String(lanc?.motorista ?? '').trim().toUpperCase().slice(0, 100),
      ajudante: String(lanc?.ajudante ?? '').trim().slice(0, 100),
      rire: calcularRire(lanc, rota, ROTAS_RI),
      ocorrencia: 0,
      mes_ano: mesAno,
      semana_mes: calcularSemanaMes(dataPedido),
      data_pedido: dataPedido,
      cod_forn: null,
      cliente: String(p.nome_destinatario ?? '').trim().slice(0, 200) || null,
      bairro: String(p.bairro ?? '').trim().slice(0, 100) || null,
      volume: Math.max(0, Number(p.volumes) || 0) || null,
      nota_origem: p.numero_documento != null ? String(p.numero_documento).trim().slice(0, 500) || null : null,
      vendedor_cod: vendedorPorPedido.get(pedido) ?? baseDataExistenteMap.get(pedido)?.vendedor_cod ?? null,
    });
  }

  if (pedidosUnicosComCarga.length) {
    await apagarPorPedido(supabase, pedidosUnicosComCarga, LOTE);
    await apagarPedidosSemCarga(supabase, pedidosUnicosComCarga, LOTE);
  }
  const resultadoProducao = await gravarEmLotes(supabase, 'base_data', registrosProducao, 'carga,pedido', LOTE);

  if (cargasUnicas.length) {
    await sincronizarDemandasRota(supabase, cargasUnicas);
  }

  if (resultadoProducao.erros.length > 0) {
    console.error('[receber-pedidos-erp] Erros ao gravar em base_data:', resultadoProducao.erros.join(' | '));
    return json({
      ok: false,
      erro: 'Erro ao gravar na base de produção: ' + resultadoProducao.erros.join('; '),
      total_recebidos: pedidos.length,
      total_gravados: resultadoProducao.total,
      ignorados: pedidos.length - resultadoProducao.total,
    }, 500);
  }

  const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();
  const registrosEntregaDatas: Record<string, unknown>[] = [];
  const conflitosDataEntrega: Record<string, unknown>[] = [];
  for (const p of pedidos) {
    if (typeof p.data_entrega !== 'string' || !REGEX_DATA.test(p.data_entrega)) continue;
    if (String(p.status ?? '').trim().toLowerCase() === 'cancelado') continue;

    const pedido = Math.round(Number(p.numero_pedido_erp));
    if (!Number.isFinite(pedido)) continue;

    const existente = baseDataExistenteMap.get(pedido);
    const clienteBase = norm(existente?.cliente);
    const clienteErp  = norm(p.nome_destinatario);
    if (clienteBase && clienteErp && clienteBase !== clienteErp) {
      conflitosDataEntrega.push({ pedido, cliente_base_data: existente?.cliente ?? null, cliente_erp: p.nome_destinatario });
      continue;
    }

    const mesAno = mesAnoPorPedido.get(pedido) || existente?.mes_ano;
    if (!mesAno) continue;
    registrosEntregaDatas.push({ mes_ano: mesAno, pedido: String(pedido), data_entrega: p.data_entrega });
  }

  let datasEntregaGravadas = 0;
  if (registrosEntregaDatas.length) {
    const resultadoEntregaDatas = await gravarEmLotes(supabase, 'entrega_datas', registrosEntregaDatas, 'mes_ano,pedido', LOTE);
    datasEntregaGravadas = resultadoEntregaDatas.total;
    if (resultadoEntregaDatas.erros.length > 0) {
      console.error('[receber-pedidos-erp] Erros ao gravar entrega_datas:', resultadoEntregaDatas.erros.join(' | '));
    }
  }

  if (conflitosDataEntrega.length) {
    await supabase.from('erros_sistema').insert({
      usuario_nome: 'Integração ERP',
      pagina: 'erp-teste',
      tipo: 'erp_conflito_data_entrega',
      mensagem: `Integração ERP: ${conflitosDataEntrega.length} pedido(s) com data de entrega bloqueada(s) por conflito de cliente`,
      contexto: { conflitos: conflitosDataEntrega },
      resolvido: false,
    }).then(() => {}, () => {});
  }

  return json({
    ok: true,
    total_recebidos: pedidos.length,
    total_gravados: resultadoProducao.total,
    ignorados: pedidos.length - resultadoProducao.total - semCarga,
    mensagem: `${resultadoProducao.total} pedido(s) gravados com sucesso.`,
    timestamp: new Date().toISOString(),
    semCarga,
    datasEntregaGravadas,
    conflitosDataEntrega: conflitosDataEntrega.length,
    pedidosCancelados: canceladosSet.size,
    pedidosCanceladosRemovidos,
  }, 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
