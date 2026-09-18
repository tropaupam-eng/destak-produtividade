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
// — mesmo problema achado em receber-pedidos-erp: literal num repo PÚBLICO
// protegendo um endpoint com service_role. Segredo ausente deve derrubar a
// função, nunca virar um default público. Usa a MESMA variável ERP_API_KEY
// que as outras 3 funções do ERP (receber/detectar/registrar) — uma única
// rotação cobre todas.
//    supabase secrets set ERP_API_KEY=<valor novo e aleatório>
const API_KEY = Deno.env.get('ERP_API_KEY');
if (!API_KEY) {
  throw new Error('ERP_API_KEY não configurada. Defina com: supabase secrets set ERP_API_KEY=<valor>');
}

const MAX_POR_REQUISICAO = 500;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const LOTE = 200;

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

  let registros: Record<string, unknown>[];
  try {
    const body = await req.json();
    registros = Array.isArray(body) ? body : [body];
  } catch {
    return json({ ok: false, erro: 'Body inválido. Envie um array JSON de registros.' }, 400);
  }

  if (registros.length === 0) {
    return json({ ok: false, erro: 'Nenhum registro no payload.' }, 400);
  }

  if (registros.length > MAX_POR_REQUISICAO) {
    return json({
      ok: false,
      erro: `Máximo de ${MAX_POR_REQUISICAO} registros por requisição excedido (recebidos: ${registros.length}).`,
    }, 400);
  }

  for (let idx = 0; idx < registros.length; idx++) {
    const r = registros[idx];
    if (typeof r.numero_pedido_erp !== 'number') {
      return json({ ok: false, erro: `numero_pedido_erp faltando/inválido no registro ${idx}`, indice: idx }, 400);
    }
    if (r.data_pedido != null && r.data_pedido !== '' && (typeof r.data_pedido !== 'string' || !REGEX_DATA.test(r.data_pedido))) {
      return json({ ok: false, erro: `data_pedido inválida no registro ${idx}: use YYYY-MM-DD`, indice: idx }, 400);
    }
    if (r.emissao != null && r.emissao !== '' && (typeof r.emissao !== 'string' || !REGEX_DATA.test(r.emissao))) {
      return json({ ok: false, erro: `emissao inválida no registro ${idx}: use YYYY-MM-DD`, indice: idx }, 400);
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const paraGravar = registros.map(r => ({
    pedido: Math.round(Number(r.numero_pedido_erp)),
    unidade_erp: typeof r.unidade_erp === 'number' ? r.unidade_erp : null,
    situacao: r.situacao != null ? String(r.situacao) : null,
    conferido: r.conferido != null ? String(r.conferido) : null,
    vendedor: r.vendedor != null ? String(r.vendedor) : null,
    rota_codigo_erp: r.rota_codigo_erp != null ? String(r.rota_codigo_erp) : null,
    carga_erp: r.carga_erp != null && r.carga_erp !== '' ? String(r.carga_erp) : null,
    cliente: r.cliente != null ? String(r.cliente) : null,
    codigo_cliente: r.codigo_cliente != null ? String(r.codigo_cliente) : null,
    volume: typeof r.volume === 'number' ? r.volume : null,
    valor: typeof r.valor === 'number' ? r.valor : null,
    data_pedido: r.data_pedido || null,
    emissao: r.emissao || null,
    nota_fiscal: r.nota_fiscal != null ? String(r.nota_fiscal) : null,
    cb: r.cb != null ? String(r.cb) : null,
    cobrad: r.cobrad != null ? String(r.cobrad) : null,
    prazo_medio: r.prazo_medio != null ? String(r.prazo_medio) : null,
    crediario: r.crediario != null ? String(r.crediario) : null,
    atualizado_em: new Date().toISOString(),
  }));

  const resultadoInfo = await gravarEmLotes(supabase, 'pedidos_info_erp', paraGravar, 'pedido', LOTE);

  if (resultadoInfo.erros.length > 0) {
    console.error('[atualizar-pedidos-erp] Erros ao gravar pedidos_info_erp:', resultadoInfo.erros.join(' | '));
    return json({
      ok: false,
      erro: 'Erro ao gravar em pedidos_info_erp: ' + resultadoInfo.erros.join('; '),
      total_recebidos: registros.length,
      total_gravados: resultadoInfo.total,
    }, 500);
  }

  let pedidosCriados = 0;
  let pedidosMovidos = 0;
  let pedidosValorAtualizado = 0;
  const cargasAfetadas = new Set<number>();

  const numerosRecebidos = [...new Set(
    registros.map(r => Math.round(Number(r.numero_pedido_erp))).filter(Number.isFinite)
  )];
  const { canceladosSet, pedidosCanceladosRemovidos } = await removerCanceladosDeBaseData(supabase, numerosRecebidos, LOTE);

  const comCarga = registros.filter(r =>
    r.carga_erp != null && r.carga_erp !== '' && typeof r.data_pedido === 'string' && REGEX_DATA.test(r.data_pedido as string)
    && !canceladosSet.has(Math.round(Number(r.numero_pedido_erp)))
  );
  const pedidosComCarga = [...new Set(
    comCarga.map(r => Math.round(Number(r.numero_pedido_erp))).filter(Number.isFinite)
  )];

  if (pedidosComCarga.length) {
    const existenteMap = new Map<number, Record<string, unknown>>();
    for (let i = 0; i < pedidosComCarga.length; i += LOTE) {
      const lote = pedidosComCarga.slice(i, i + LOTE);
      const { data } = await supabase
        .from('base_data')
        .select('*')
        .in('pedido', lote)
        .order('criado_em', { ascending: false });
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const pedido = Math.round(Number(row.pedido));
        if (!existenteMap.has(pedido)) existenteMap.set(pedido, row);
      }
    }

    const todasCargasEnvolvidas = [...new Set(
      comCarga.map(r => Math.round(Number(r.carga_erp))).filter(Number.isFinite)
    )];
    const lancMapPorCarga = await buscarLancamentosPorCarga(supabase, todasCargasEnvolvidas);
    const ROTAS_RI = await buscarRotasRI(supabase);

    const pedidosParaApagar: number[] = [];
    const registrosNovos: Record<string, unknown>[] = [];
    const registrosCriar: Record<string, unknown>[] = [];
    const atualizacoesValorSimples: { pedido: number; carga: number; valor: number | null; vendedor_cod: number | null }[] = [];

    for (const r of comCarga) {
      const pedido = Math.round(Number(r.numero_pedido_erp));
      const novaCarga = Math.round(Number(r.carga_erp));
      if (!Number.isFinite(pedido) || !Number.isFinite(novaCarga)) continue;

      const existente = existenteMap.get(pedido);
      const novoValor = typeof r.valor === 'number' ? r.valor : null;
      const novoVendedorCod = r.vendedor != null && r.vendedor !== '' && Number.isFinite(Number(r.vendedor))
        ? Math.round(Number(r.vendedor)) : null;

      if (!existente) {
        const lanc = lancMapPorCarga.get(novaCarga);
        const rota = lanc ? String(lanc.rota ?? '').trim().slice(0, 50) : '';
        const dataPedido = String(r.data_pedido);
        cargasAfetadas.add(novaCarga);
        registrosCriar.push({
          carga: novaCarga,
          pedido,
          valor: novoValor ?? 0,
          peso_kg: null,
          und: lanc ? String(lanc.und ?? '').trim().slice(0, 50) : '',
          rota,
          placa: lanc ? String(lanc.veiculo ?? '').trim().toUpperCase().slice(0, 20) : '',
          condutor: lanc ? String(lanc.motorista ?? '').trim().toUpperCase().slice(0, 100) : '',
          ajudante: lanc ? String(lanc.ajudante ?? '').trim().slice(0, 100) : '',
          rire: calcularRire(lanc, rota, ROTAS_RI),
          ocorrencia: 0,
          mes_ano: calcularMesAno(dataPedido),
          semana_mes: calcularSemanaMes(dataPedido),
          data_pedido: dataPedido,
          cod_forn: null,
          cliente: r.cliente != null ? String(r.cliente).trim().slice(0, 200) : null,
          bairro: null,
          volume: typeof r.volume === 'number' ? r.volume : null,
          nota_origem: r.nota_fiscal != null ? String(r.nota_fiscal).trim().slice(0, 500) : null,
          vendedor_cod: novoVendedorCod,
        });
        pedidosCriados++;
        continue;
      }

      const cargaAtual = Math.round(Number(existente.carga));
      const cargaMudou = cargaAtual !== novaCarga;
      const valorMudou = novoValor != null && Number(existente.valor) !== novoValor;
      const existenteVendedorCod = existente.vendedor_cod != null ? Number(existente.vendedor_cod) : null;
      const vendedorMudou = novoVendedorCod != null && existenteVendedorCod !== novoVendedorCod;

      if (!cargaMudou && !valorMudou && !vendedorMudou) continue;

      if (cargaMudou) {
        cargasAfetadas.add(cargaAtual);
        cargasAfetadas.add(novaCarga);
        const lanc = lancMapPorCarga.get(novaCarga);
        const rota = lanc ? String(lanc.rota ?? '').trim().slice(0, 50) : String(existente.rota ?? '');
        pedidosParaApagar.push(pedido);
        registrosNovos.push({
          ...existente,
          carga: novaCarga,
          valor: novoValor != null ? novoValor : existente.valor,
          und: lanc ? String(lanc.und ?? '').trim().slice(0, 50) : existente.und,
          rota,
          placa: lanc ? String(lanc.veiculo ?? '').trim().toUpperCase().slice(0, 20) : existente.placa,
          condutor: lanc ? String(lanc.motorista ?? '').trim().toUpperCase().slice(0, 100) : existente.condutor,
          ajudante: lanc ? String(lanc.ajudante ?? '').trim().slice(0, 100) : existente.ajudante,
          rire: lanc ? calcularRire(lanc, rota, ROTAS_RI) : existente.rire,
          vendedor_cod: novoVendedorCod ?? existenteVendedorCod,
        });
        pedidosMovidos++;
      } else {
        cargasAfetadas.add(cargaAtual);
        atualizacoesValorSimples.push({ pedido, carga: cargaAtual, valor: novoValor, vendedor_cod: novoVendedorCod });
        pedidosValorAtualizado++;
      }
    }

    if (pedidosParaApagar.length) {
      await apagarPorPedido(supabase, pedidosParaApagar, LOTE);
      registrosNovos.forEach(r => { delete (r as Record<string, unknown>).id; });
      const resultadoMove = await gravarEmLotes(supabase, 'base_data', registrosNovos, 'carga,pedido', LOTE);
      if (resultadoMove.erros.length > 0) {
        console.error('[atualizar-pedidos-erp] Erros ao mover pedidos:', resultadoMove.erros.join(' | '));
      }
    }

    if (registrosCriar.length) {
      const pedidosNovos = registrosCriar.map(r => r.pedido as number);
      await apagarPedidosSemCarga(supabase, pedidosNovos, LOTE);
      const resultadoCriar = await gravarEmLotes(supabase, 'base_data', registrosCriar, 'carga,pedido', LOTE);
      if (resultadoCriar.erros.length > 0) {
        console.error('[atualizar-pedidos-erp] Erros ao criar pedidos:', resultadoCriar.erros.join(' | '));
      }
    }

    for (const upd of atualizacoesValorSimples) {
      const patch: Record<string, unknown> = {};
      if (upd.valor != null) patch.valor = upd.valor;
      if (upd.vendedor_cod != null) patch.vendedor_cod = upd.vendedor_cod;
      if (!Object.keys(patch).length) continue;
      await supabase.from('base_data').update(patch).eq('pedido', upd.pedido).eq('carga', upd.carga)
        .then(() => {}, () => {});
    }
  }

  if (cargasAfetadas.size) {
    await sincronizarDemandasRota(supabase, [...cargasAfetadas]);
  }

  return json({
    ok: true,
    total_recebidos: registros.length,
    total_gravados: resultadoInfo.total,
    mensagem: `${resultadoInfo.total} registro(s) atualizados com sucesso.`,
    timestamp: new Date().toISOString(),
    pedidosCriados,
    pedidosMovidos,
    pedidosValorAtualizado,
    pedidosCancelados: pedidosCanceladosRemovidos,
  }, 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
