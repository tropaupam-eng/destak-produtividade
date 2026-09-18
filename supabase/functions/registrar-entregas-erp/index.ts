import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// CORRIGIDO 2026-09-19: removido o fallback hardcoded ('destak-erp-2026')
// — mesma variável ERP_API_KEY compartilhada com receber/atualizar/detectar-
// itens-erp. Segredo ausente deve derrubar a função, nunca virar um
// default público.
//    supabase secrets set ERP_API_KEY=<valor novo e aleatório>
const API_KEY = Deno.env.get('ERP_API_KEY');
if (!API_KEY) {
  throw new Error('ERP_API_KEY não configurada. Defina com: supabase secrets set ERP_API_KEY=<valor>');
}

// Planilha de "Entregas Realizadas" — relatório separado da expedição e das
// atualizações, uma linha por entrega confirmada (Entrega, Código Cliente,
// Carregamento, Data Entrega, Situação da Entrega, Notas Fiscais). Não tem
// "Pedido" direto.
//
// Vínculo (decisão + validação com dados reais em 2026-08-17):
// 1) Nota Fiscal — direta (bate com pedidos_info_erp.nota_fiscal) OU
//    decodificada por prefixo de unidade: "100" + pedido ou "300" + pedido
//    (6 dígitos), confirmado batendo carga+cliente em amostras reais.
// 2) Se a nota não resolver, fallback por carga_erp + codigo_cliente direto
//    em pedidos_info_erp (só aceita se achar exatamente 1 pedido).
// Em ambos os casos, carga E cliente têm que bater com o que está em
// pedidos_info_erp antes de aceitar o pedido — evita casar errado quando a
// nota é ambígua ou pertence a outro pedido por coincidência numérica.
//
// Só grava em entrega_datas quando Situação da Entrega = ENTREGUE e a rota
// do pedido é R.E. (Rota Externa) — R.I. não usa essa planilha como fonte.
const MAX_ENTREGAS_POR_REQUISICAO = 500;
const LOTE = 200;

interface EntregaEntrada {
  entrega: string;
  codigo_cliente: string;
  carregamento: string;
  data_entrega: string | null; // "DD/MM/YYYY HH:MM:SS"
  situacao: string | null;
  notas_fiscais: string[];
}

function parseDataEntrega(str: string | null): string | null {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
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

  let entradas: EntregaEntrada[];
  try {
    const body = await req.json();
    entradas = Array.isArray(body) ? body : [body];
  } catch {
    return json({ ok: false, erro: 'Body inválido. Envie um array JSON de entregas.' }, 400);
  }

  if (entradas.length === 0) {
    return json({ ok: false, erro: 'Nenhuma entrega no payload.' }, 400);
  }
  if (entradas.length > MAX_ENTREGAS_POR_REQUISICAO) {
    return json({
      ok: false,
      erro: `Máximo de ${MAX_ENTREGAS_POR_REQUISICAO} entregas por requisição excedido (recebidas: ${entradas.length}).`,
    }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const notasDiretas = new Set<string>();
  const pedidosPorOffset = new Set<number>();
  const cargaClienteChaves = new Set<string>(); // "carga|cliente"

  for (const e of entradas) {
    for (const nota of e.notas_fiscais) {
      const mOffset = nota.match(/^(100|300)(\d{6})$/);
      if (mOffset) pedidosPorOffset.add(parseInt(mOffset[2], 10));
      else notasDiretas.add(nota);
    }
    cargaClienteChaves.add(`${e.carregamento}|${e.codigo_cliente}`);
  }

  const infoPorPedido = new Map<number, Record<string, unknown>>();
  const infoPorNota = new Map<string, Record<string, unknown>>();
  const infoPorCargaCliente = new Map<string, Record<string, unknown>[]>();

  async function buscarInfo(coluna: string, valores: unknown[]) {
    if (!valores.length) return [] as Record<string, unknown>[];
    const resultado: Record<string, unknown>[] = [];
    for (let i = 0; i < valores.length; i += LOTE) {
      const lote = valores.slice(i, i + LOTE);
      const { data } = await supabase
        .from('pedidos_info_erp')
        .select('pedido,carga_erp,codigo_cliente,nota_fiscal')
        .in(coluna, lote);
      if (data) resultado.push(...(data as Record<string, unknown>[]));
    }
    return resultado;
  }

  const [porPedido, porNota] = await Promise.all([
    buscarInfo('pedido', [...pedidosPorOffset]),
    buscarInfo('nota_fiscal', [...notasDiretas]),
  ]);
  porPedido.forEach(r => infoPorPedido.set(Number(r.pedido), r));
  porNota.forEach(r => infoPorNota.set(String(r.nota_fiscal), r));

  const cargasCliente = [...cargaClienteChaves].map(k => {
    const [carga, cliente] = k.split('|');
    return { carga, cliente };
  });
  const cargasUnicas = [...new Set(cargasCliente.map(c => c.carga))];
  for (let i = 0; i < cargasUnicas.length; i += LOTE) {
    const lote = cargasUnicas.slice(i, i + LOTE);
    const { data } = await supabase
      .from('pedidos_info_erp')
      .select('pedido,carga_erp,codigo_cliente,nota_fiscal')
      .in('carga_erp', lote);
    (data ?? []).forEach((r: Record<string, unknown>) => {
      const chave = `${r.carga_erp}|${r.codigo_cliente}`;
      if (!infoPorCargaCliente.has(chave)) infoPorCargaCliente.set(chave, []);
      infoPorCargaCliente.get(chave)!.push(r);
    });
  }

  function resolverPedido(e: EntregaEntrada): number | null {
    for (const nota of e.notas_fiscais) {
      const mOffset = nota.match(/^(100|300)(\d{6})$/);
      let info: Record<string, unknown> | undefined;
      let pedido: number | undefined;
      if (mOffset) {
        pedido = parseInt(mOffset[2], 10);
        info = infoPorPedido.get(pedido);
      } else {
        info = infoPorNota.get(nota);
        pedido = info ? Number(info.pedido) : undefined;
      }
      if (info && pedido != null) {
        const bateCarga = String(info.carga_erp) === String(e.carregamento);
        const bateCliente = String(info.codigo_cliente) === String(e.codigo_cliente);
        if (bateCarga && bateCliente) return pedido;
      }
    }
    const candidatos = infoPorCargaCliente.get(`${e.carregamento}|${e.codigo_cliente}`) ?? [];
    if (candidatos.length === 1) return Number(candidatos[0].pedido);
    return null;
  }

  const resolvidos: { pedido: number; dataEntrega: string }[] = [];
  let semNotaOuPedido = 0, situacaoNaoEntregue = 0, dataInvalida = 0;

  for (const e of entradas) {
    if (e.situacao !== 'ENTREGUE') { situacaoNaoEntregue++; continue; }
    const pedido = resolverPedido(e);
    if (pedido == null) { semNotaOuPedido++; continue; }
    const dataEntrega = parseDataEntrega(e.data_entrega);
    if (!dataEntrega) { dataInvalida++; continue; }
    resolvidos.push({ pedido, dataEntrega });
  }

  let reGravados = 0, riOuSemRireIgnorados = 0;
  const pedidosResolvidos = [...new Set(resolvidos.map(r => r.pedido))];
  const bdMap = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < pedidosResolvidos.length; i += LOTE) {
    const lote = pedidosResolvidos.slice(i, i + LOTE);
    const { data } = await supabase.from('base_data').select('pedido,rire,mes_ano').in('pedido', lote);
    (data ?? []).forEach((r: Record<string, unknown>) => bdMap.set(Number(r.pedido), r));
  }

  const paraGravar: Record<string, unknown>[] = [];
  for (const r of resolvidos) {
    const bd = bdMap.get(r.pedido);
    if (!bd || bd.rire !== 'R.E.') { riOuSemRireIgnorados++; continue; }
    paraGravar.push({
      mes_ano: bd.mes_ano,
      pedido: String(r.pedido),
      data_entrega: `${r.dataEntrega}T12:00:00-03:00`,
    });
    reGravados++;
  }

  const erros: string[] = [];
  for (let i = 0; i < paraGravar.length; i += LOTE) {
    const lote = paraGravar.slice(i, i + LOTE);
    const { error } = await supabase.from('entrega_datas').upsert(lote, { onConflict: 'mes_ano,pedido' });
    if (error) erros.push(error.message);
  }

  return json({
    ok: erros.length === 0,
    total_recebidos: entradas.length,
    situacao_nao_entregue: situacaoNaoEntregue,
    sem_pedido_resolvido: semNotaOuPedido,
    data_invalida: dataInvalida,
    ri_ou_sem_rire_ignorados: riOuSemRireIgnorados,
    re_gravados: reGravados,
    erros,
  }, erros.length ? 207 : 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
