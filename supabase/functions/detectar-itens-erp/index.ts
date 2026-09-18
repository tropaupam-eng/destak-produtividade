import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// CORRIGIDO 2026-09-19: removido o fallback hardcoded ('destak-erp-2026')
// — mesma variável ERP_API_KEY compartilhada com receber/atualizar/registrar-
// pedidos-erp. Segredo ausente deve derrubar a função, nunca virar um
// default público.
//    supabase secrets set ERP_API_KEY=<valor novo e aleatório>
const API_KEY = Deno.env.get('ERP_API_KEY');
if (!API_KEY) {
  throw new Error('ERP_API_KEY não configurada. Defina com: supabase secrets set ERP_API_KEY=<valor>');
}

// A partir de 2026-08-15 a planilha de "atualizações" do ERP passou a
// exportar uma linha por ITEM do pedido (Mercadoria/Descricao/Referencia/
// Quantidade), não mais uma linha por pedido. Esse endpoint é separado de
// atualizar-pedidos-erp (que continua tratando o pedido como nível-pedido,
// deduplicado) — aqui a granularidade de item é o que importa: comparamos
// cada exportação nova contra o que já vimos desse pedido pra detectar
// corte de quantidade ou troca/remoção de mercadoria. Decisão do usuário em
// 2026-08-15: baseline de "quantidade original" = primeira vez que o item
// foi visto (não a exportação imediatamente anterior), e por enquanto isso
// só alimenta um relatório de revisão manual — não entra no cálculo de OTIF.
const MAX_PEDIDOS_POR_REQUISICAO = 200;
const CONCORRENCIA = 8;

interface ItemEntrada {
  mercadoria: string;
  descricao?: string | null;
  referencia?: string | null;
  quantidade: number;
}

interface PedidoEntrada {
  pedido: number;
  itens: ItemEntrada[];
}

// Achado em 2026-09-18: o código do produto às vezes chega com ruído
// decimal ("16921.0", "1322.1") em vez do inteiro puro ("16921") — mesmo
// item, formatação diferente entre uma exportação e outra (Excel/Power
// Query e o export CSV do ERP têm o mesmo problema, independente da fonte).
// Sem normalizar aqui, a comparação por string exata via Map enxerga isso
// como "item removido" + "item novo" a cada vez que o formato muda —
// gerou 127 mil linhas e 39 mil pares falsos de troca antes de ser achado
// e limpo. Normalizando aqui, na Edge Function, protege contra qualquer
// fonte futura que mande o código sem essa limpeza, não só as duas já
// corrigidas (nucleo-conversor-painel-vendas.js, nucleo-conversor-atualizacoes.js).
function normalizarMercadoria(bruto: string): string {
  const texto = String(bruto ?? '').trim();
  const num = Number(texto);
  return Number.isFinite(num) && texto !== '' ? String(Math.trunc(num)) : texto;
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

  let pedidosEntrada: PedidoEntrada[];
  try {
    const body = await req.json();
    pedidosEntrada = Array.isArray(body) ? body : [body];
  } catch {
    return json({ ok: false, erro: 'Body inválido. Envie um array JSON de { pedido, itens[] }.' }, 400);
  }

  if (pedidosEntrada.length === 0) {
    return json({ ok: false, erro: 'Nenhum pedido no payload.' }, 400);
  }

  if (pedidosEntrada.length > MAX_PEDIDOS_POR_REQUISICAO) {
    return json({
      ok: false,
      erro: `Máximo de ${MAX_PEDIDOS_POR_REQUISICAO} pedidos por requisição excedido (recebidos: ${pedidosEntrada.length}).`,
    }, 400);
  }

  for (let idx = 0; idx < pedidosEntrada.length; idx++) {
    const p = pedidosEntrada[idx];
    if (typeof p.pedido !== 'number' || !Array.isArray(p.itens)) {
      return json({ ok: false, erro: `Formato inválido no índice ${idx}: esperado { pedido: number, itens: [] }`, indice: idx }, 400);
    }
    for (const it of p.itens) {
      if (typeof it.mercadoria !== 'string' || typeof it.quantidade !== 'number') {
        return json({ ok: false, erro: `Item inválido no pedido ${p.pedido}: mercadoria/quantidade faltando`, indice: idx }, 400);
      }
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let itensNovos = 0;
  let cortesDetectados = 0;
  let removidosDetectados = 0;
  let adicionadosDetectados = 0;
  let restauradosDetectados = 0;
  const erros: string[] = [];

  for (let i = 0; i < pedidosEntrada.length; i += CONCORRENCIA) {
    const grupo = pedidosEntrada.slice(i, i + CONCORRENCIA);
    await Promise.all(grupo.map(async (entrada) => {
      try {
        const resultado = await processarPedido(supabase, entrada);
        itensNovos += resultado.itensNovos;
        cortesDetectados += resultado.cortes;
        removidosDetectados += resultado.removidos;
        adicionadosDetectados += resultado.adicionados;
        restauradosDetectados += resultado.restaurados;
      } catch (e) {
        erros.push(`pedido ${entrada.pedido}: ${(e as Error).message}`);
      }
    }));
  }

  return json({
    ok: erros.length === 0,
    total_pedidos: pedidosEntrada.length,
    itens_novos: itensNovos,
    cortes_detectados: cortesDetectados,
    removidos_detectados: removidosDetectados,
    adicionados_detectados: adicionadosDetectados,
    restaurados_detectados: restauradosDetectados,
    erros,
  }, erros.length ? 207 : 200);
});

async function processarPedido(
  supabase: ReturnType<typeof createClient>,
  entrada: PedidoEntrada,
): Promise<{ itensNovos: number; cortes: number; removidos: number; adicionados: number; restaurados: number }> {
  const { pedido, itens } = entrada;

  const { data: existentesRaw } = await supabase
    .from('pedidos_itens_erp')
    .select('*')
    .eq('pedido', pedido);
  const existentes = (existentesRaw ?? []) as Record<string, unknown>[];
  const existenteMap = new Map<string, Record<string, unknown>>(
    existentes.map(e => [String(e.mercadoria), e])
  );
  const pedidoJaConhecido = existentes.length > 0;

  const agora = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];
  const alteracoes: Record<string, unknown>[] = [];
  const vistosNesteEnvio = new Set<string>();

  let itensNovos = 0, cortes = 0, removidos = 0, adicionados = 0, restaurados = 0;

  for (const item of itens) {
    const chave = normalizarMercadoria(item.mercadoria);
    vistosNesteEnvio.add(chave);
    const existente = existenteMap.get(chave);

    if (!existente) {
      upserts.push({
        pedido, mercadoria: chave,
        descricao: item.descricao ?? null,
        referencia: item.referencia ?? null,
        quantidade_original: item.quantidade,
        quantidade_atual: item.quantidade,
        status: 'ativo',
        atualizado_em: agora,
      });
      itensNovos++;
      if (pedidoJaConhecido) {
        alteracoes.push({
          pedido, mercadoria: chave, descricao: item.descricao ?? null, referencia: item.referencia ?? null,
          tipo: 'adicionado', quantidade_antes: null, quantidade_depois: item.quantidade, detectado_em: agora,
        });
        adicionados++;
      }
      continue;
    }

    const qtdOriginal = Number(existente.quantidade_original);
    const qtdAtualAntes = Number(existente.quantidade_atual);
    const eraRemovido = existente.status === 'removido';

    if (eraRemovido) {
      upserts.push({
        pedido, mercadoria: chave,
        descricao: item.descricao ?? existente.descricao,
        referencia: item.referencia ?? existente.referencia,
        quantidade_original: qtdOriginal,
        quantidade_atual: item.quantidade,
        status: 'ativo',
        atualizado_em: agora,
      });
      alteracoes.push({
        pedido, mercadoria: chave, descricao: item.descricao ?? null, referencia: item.referencia ?? null,
        tipo: 'restaurado', quantidade_antes: 0, quantidade_depois: item.quantidade, detectado_em: agora,
      });
      restaurados++;
      continue;
    }

    if (item.quantidade !== qtdAtualAntes) {
      upserts.push({
        pedido, mercadoria: chave,
        descricao: item.descricao ?? existente.descricao,
        referencia: item.referencia ?? existente.referencia,
        quantidade_original: qtdOriginal,
        quantidade_atual: item.quantidade,
        status: 'ativo',
        atualizado_em: agora,
      });
      if (item.quantidade < qtdOriginal) {
        alteracoes.push({
          pedido, mercadoria: chave, descricao: item.descricao ?? null, referencia: item.referencia ?? null,
          tipo: 'corte', quantidade_antes: qtdOriginal, quantidade_depois: item.quantidade, detectado_em: agora,
        });
        cortes++;
      }
    }
  }

  for (const [chave, existente] of existenteMap) {
    if (vistosNesteEnvio.has(chave) || existente.status === 'removido') continue;
    upserts.push({
      pedido, mercadoria: chave,
      descricao: existente.descricao, referencia: existente.referencia,
      quantidade_original: Number(existente.quantidade_original),
      quantidade_atual: 0,
      status: 'removido',
      atualizado_em: agora,
    });
    alteracoes.push({
      pedido, mercadoria: chave, descricao: existente.descricao as string ?? null, referencia: existente.referencia as string ?? null,
      tipo: 'removido', quantidade_antes: Number(existente.quantidade_atual), quantidade_depois: 0, detectado_em: agora,
    });
    removidos++;
  }

  if (upserts.length) {
    const { error } = await supabase.from('pedidos_itens_erp').upsert(upserts, { onConflict: 'pedido,mercadoria' });
    if (error) throw error;
  }
  if (alteracoes.length) {
    const { error } = await supabase.from('pedidos_alteracoes_erp').insert(alteracoes);
    if (error) throw error;
  }

  return { itensNovos, cortes, removidos, adicionados, restaurados };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
