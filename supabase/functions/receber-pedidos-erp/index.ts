// Supabase Edge Function: receber-pedidos-erp (v2.0 COM LOGGING E HISTÓRICO)
// Deploy: supabase functions deploy receber-pedidos-erp
// URL: https://hiydkyslgiomdyginfdx.supabase.co/functions/v1/receber-pedidos-erp

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const API_KEY = "destak-erp-2026";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

interface PedidoERP {
  id: number;
  numero_pedido_erp: number;
  carga_erp?: string | null;
  cliente_id: number;
  unidade_erp: number;
  data_pedido: string;
  nome_destinatario: string;
  fantasia: string;
  valor_liquido: number;
  valor_bruto: number;
  peso_bruto: number;
  peso_liquido: number;
  volumes: number;
  numero_documento?: string;
  tipo_pedido?: string;
  data_documento?: string;
  codigo_cliente?: string;
  endereco_texto?: string;
  bairro?: string;
  cep?: string;
  rota_erp?: string;
  lat?: number;
  lng?: number;
  status?: string;
  criado_em?: string;
}

const CAMPOS_OBRIGATORIOS = [
  'id', 'numero_pedido_erp', 'carga_erp', 'cliente_id', 'unidade_erp',
  'data_pedido', 'nome_destinatario', 'fantasia', 'valor_liquido',
  'valor_bruto', 'peso_bruto', 'peso_liquido', 'volumes'
];

async function validarAutenticacao(req: Request): Promise<{ ok: boolean; erro?: string }> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || apiKey !== API_KEY) {
    return {
      ok: false,
      erro: 'Não autorizado. Header x-api-key inválido ou ausente.'
    };
  }
  return { ok: true };
}

function validarPedido(pedido: any, indice: number): { ok: boolean; erro?: string } {
  for (const campo of CAMPOS_OBRIGATORIOS) {
    const valor = pedido[campo];
    if (valor === undefined || valor === null || valor === '') {
      return {
        ok: false,
        erro: `Campo obrigatório faltando no pedido ${indice}: ${campo}`
      };
    }
  }

  if (typeof pedido.id !== 'number' || typeof pedido.numero_pedido_erp !== 'number') {
    return { ok: false, erro: `Tipos inválidos no pedido ${indice}: id e numero_pedido_erp devem ser numbers` };
  }

  if (typeof pedido.valor_liquido !== 'number' || pedido.valor_liquido < 0) {
    return { ok: false, erro: `Valor inválido no pedido ${indice}: valor_liquido deve ser >= 0` };
  }

  if (typeof pedido.peso_bruto !== 'number' || pedido.peso_bruto < 0) {
    return { ok: false, erro: `Peso inválido no pedido ${indice}: peso_bruto deve ser >= 0` };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(pedido.data_pedido)) {
    return { ok: false, erro: `Data inválida no pedido ${indice}: use YYYY-MM-DD` };
  }

  return { ok: true };
}

async function verificarSeExiste(pedidoId: number): Promise<{ existe: boolean; versaoAnterior?: any }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/base_data_erp_teste?id=eq.${pedidoId}&select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) return { existe: false };

    const data = await response.json();
    return {
      existe: data.length > 0,
      versaoAnterior: data[0] || null
    };
  } catch {
    return { existe: false };
  }
}

async function registrarHistorico(pedidoId: number, acao: string, detalhes: any): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/erp_historico`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        pedido_id: pedidoId,
        acao: acao,
        detalhes: JSON.stringify(detalhes),
        timestamp_acao: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn(`[HISTÓRICO] Erro ao registrar: ${err.message}`);
  }
}

async function gravarEmSupabase(pedidos: PedidoERP[]): Promise<{
  total: number;
  novos: number;
  atualizados: number;
  erros: string[];
  detalhes: any[];
}> {
  const client = fetch;
  const erros: string[] = [];
  let novos = 0;
  let atualizados = 0;
  const detalhes: any[] = [];

  try {
    // Deletar registros antigos (keep only latest batch)
    await client(`${SUPABASE_URL}/rest/v1/base_data_erp_teste`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'gte.0' }),
    }).catch(() => null);

    // Processar cada pedido
    for (const pedido of pedidos) {
      // Verificar se já existe
      const verificacao = await verificarSeExiste(pedido.id);

      const acao = verificacao.existe ? 'ATUALIZADO' : 'NOVO';
      const timestamp_recebimento = new Date().toISOString();

      // Preparar dados
      const dadosPedido = {
        id: pedido.id,
        numero_pedido_erp: pedido.numero_pedido_erp,
        carga_erp: pedido.carga_erp || null,
        cliente_id: pedido.cliente_id,
        unidade_erp: pedido.unidade_erp,
        data_pedido: pedido.data_pedido,
        nome_destinatario: pedido.nome_destinatario?.trim() || '',
        fantasia: pedido.fantasia?.trim() || '',
        valor_liquido: pedido.valor_liquido,
        valor_bruto: pedido.valor_bruto,
        peso_bruto: pedido.peso_bruto,
        peso_liquido: pedido.peso_liquido,
        volumes: pedido.volumes,
        numero_documento: pedido.numero_documento || null,
        tipo_pedido: pedido.tipo_pedido || null,
        data_documento: pedido.data_documento || null,
        codigo_cliente: pedido.codigo_cliente || null,
        endereco_texto: pedido.endereco_texto || null,
        bairro: pedido.bairro || null,
        cep: pedido.cep || null,
        rota_erp: pedido.rota_erp || null,
        lat: pedido.lat || null,
        lng: pedido.lng || null,
        status: pedido.status || 'pendente',
        criado_em: verificacao.versaoAnterior?.criado_em || timestamp_recebimento,
        atualizado_em: timestamp_recebimento,
        acao_ultima: acao,
      };

      // Registrar no histórico
      await registrarHistorico(pedido.id, acao, {
        numero_pedido_erp: pedido.numero_pedido_erp,
        carga_erp: pedido.carga_erp,
        valor_liquido: pedido.valor_liquido,
        mudancas: verificacao.versaoAnterior ? {
          anterior: {
            carga_erp: verificacao.versaoAnterior.carga_erp,
            valor_liquido: verificacao.versaoAnterior.valor_liquido,
          },
          novo: {
            carga_erp: pedido.carga_erp,
            valor_liquido: pedido.valor_liquido,
          }
        } : null,
      });

      // Inserir/Atualizar no Supabase
      const response = await client(`${SUPABASE_URL}/rest/v1/base_data_erp_teste?on_conflict=id`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(dadosPedido),
      });

      if (response.ok) {
        if (acao === 'NOVO') novos++;
        else atualizados++;

        detalhes.push({
          id: pedido.id,
          numero_pedido_erp: pedido.numero_pedido_erp,
          acao: acao,
          timestamp: timestamp_recebimento,
        });
      } else {
        erros.push(`Erro ao processar pedido ${pedido.id}: ${response.status}`);
      }
    }
  } catch (err) {
    erros.push(`Erro na gravação: ${err.message}`);
  }

  return {
    total: pedidos.length,
    novos,
    atualizados,
    erros,
    detalhes
  };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, erro: 'Apenas POST é permitido' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validar autenticação
  const authCheck = await validarAutenticacao(req);
  if (!authCheck.ok) {
    return new Response(
      JSON.stringify(authCheck),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();

    if (!Array.isArray(body)) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Body deve ser um array de pedidos' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Array de pedidos vazio' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.length > 500) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Máximo 500 pedidos por requisição' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar cada pedido
    const pedidosValidos: PedidoERP[] = [];
    const errosValidacao: string[] = [];

    for (let i = 0; i < body.length; i++) {
      const pedido = body[i];
      const validacao = validarPedido(pedido, i);

      if (!validacao.ok) {
        errosValidacao.push(validacao.erro);
      } else {
        pedidosValidos.push(pedido);
      }
    }

    if (errosValidacao.length > 0 && pedidosValidos.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          erro: errosValidacao[0],
          indice: body.findIndex((p, i) => {
            const v = validarPedido(p, i);
            return !v.ok;
          })
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Gravar em Supabase
    const resultado = await gravarEmSupabase(pedidosValidos);

    if (resultado.erros.length > 0 && resultado.total === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          erro: resultado.erros[0],
          total_recebidos: body.length,
          total_gravados: 0,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Sucesso
    return new Response(
      JSON.stringify({
        ok: true,
        total_recebidos: body.length,
        total_gravados: resultado.total,
        novos: resultado.novos,
        atualizados: resultado.atualizados,
        ignorados: body.length - resultado.total,
        mensagem: `${resultado.novos} novo(s) + ${resultado.atualizados} atualizado(s)`,
        timestamp: new Date().toISOString(),
        semCarga: pedidosValidos.filter(p => !p.carga_erp).length,
        detalhes: resultado.detalhes,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        erro: `Erro ao processar requisição: ${err.message}`
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
