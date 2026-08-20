import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// ⚠️ ANTES DE REDEPLOYAR ESTA FUNÇÃO: defina o secret, senão o ERP para de autenticar.
//    supabase secrets set ERP_API_KEY=<valor novo e aleatório>
// O fallback hardcoded ('destak-erp-2026') foi removido — estava num repo PÚBLICO
// protegendo um endpoint que usa service_role. Segredo ausente deve derrubar a função,
// nunca virar um default público.
const API_KEY = Deno.env.get('ERP_API_KEY');
if (!API_KEY) {
  throw new Error('ERP_API_KEY não configurada. Defina com: supabase secrets set ERP_API_KEY=<valor>');
}

// Campos obrigatórios definidos com o time de negócio (13 campos — contrato
// combinado com o ERP no documento "INTEGRAÇÃO DESTAK — GUIA PARA O ERP" v2.0)
const CAMPOS_OBRIGATORIOS = [
  'id','numero_pedido_erp','carga_erp','cliente_id','unidade_erp',
  'data_pedido','nome_destinatario','fantasia',
  'valor_liquido','valor_bruto','peso_bruto','peso_liquido','volumes'
];

const MAX_PEDIDOS_POR_REQUISICAO = 500;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

function calcularMesAno(dataPedido: string): string {
  return dataPedido.slice(0, 7); // "YYYY-MM"
}

function calcularSemanaMes(dataPedido: string): number {
  // Semana do mês contando a partir de segunda-feira (mesma regra já usada
  // nos lançamentos existentes de base_data).
  const [ano, mes, dia] = dataPedido.split('-').map(Number);
  const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1));
  let isodowPrimeiro = primeiroDia.getUTCDay(); // 0=domingo..6=sábado
  if (isodowPrimeiro === 0) isodowPrimeiro = 7; // 1=segunda..7=domingo
  return Math.ceil((dia + isodowPrimeiro - 1) / 7);
}

async function gravarEmLotes(
  supabase: ReturnType<typeof createClient>,
  tabela: string,
  registros: Record<string, unknown>[],
  onConflict: string,
  tamanhoLote: number,
) {
  const lotes: Record<string, unknown>[][] = [];
  for (let i = 0; i < registros.length; i += tamanhoLote) {
    lotes.push(registros.slice(i, i + tamanhoLote));
  }

  const resultados = await Promise.all(
    lotes.map(lote =>
      supabase
        .from(tabela)
        .upsert(lote, { onConflict })
        .then(({ error }) => ({ tamanho: lote.length, error }))
    )
  );

  const comErro = resultados.filter(r => r.error);
  const total = resultados.filter(r => !r.error).reduce((soma, r) => soma + r.tamanho, 0);
  return { total, erros: comErro.map(r => r.error!.message) };
}

async function apagarPedidosAntigos(
  supabase: ReturnType<typeof createClient>,
  numerosPedido: number[],
  tamanhoLote: number,
) {
  // Se um pedido já existia em outra carga (reimportação com mudança de
  // carga), o upsert por carga+pedido não apaga a linha antiga — ela ficaria
  // órfã/duplicada. Por isso apaga por número de pedido antes de reinserir,
  // igual ao botão "Promover" do Cronos faz.
  for (let i = 0; i < numerosPedido.length; i += tamanhoLote) {
    const lote = numerosPedido.slice(i, i + tamanhoLote);
    await supabase.from('base_data').delete().in('pedido', lote);
  }
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

  // Validação — para no primeiro pedido inválido (campo faltando, tipo
  // errado ou data em formato inválido), igual ao contrato combinado com o ERP.
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

    // data_entrega é opcional — só vem preenchida quando o pedido já foi
    // entregue (normalmente num reenvio do mesmo pedido, não no envio inicial)
    if (p.data_entrega != null && p.data_entrega !== '' && (typeof p.data_entrega !== 'string' || !REGEX_DATA.test(p.data_entrega))) {
      return json({
        ok: false,
        erro: `data_entrega inválida no pedido ${idx}: use YYYY-MM-DD`,
      }, 400);
    }
  }

  // Registro de auditoria (formato bruto do ERP, igual sempre foi)
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
    carga_erp:         String(p.carga_erp),
    lat:               p.lat               != null ? Number(p.lat) : null,
    lng:               p.lng               != null ? Number(p.lng) : null,
    status:            p.status            ?? 'pendente',
    data_entrega:      p.data_entrega != null && p.data_entrega !== '' ? String(p.data_entrega) : null,
    criado_em:         p.criado_em         ?? null,
  }));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const LOTE = 200;

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

  // ── Produção: replica exatamente a lógica do botão "Promover Produção" do
  // Cronos (erpPromoverParaProducao + pushBaseData) — herda rota/veículo/
  // motorista/ajudante do lançamento mais recente daquela carga, cod_forn
  // sempre nulo, nota_origem sempre nulo, e apaga pedido antigo antes de
  // reinserir se a carga mudou. Feito na mesma requisição (não em polling
  // separado) — os dados já chegam prontos em produção antes da resposta.
  const cargasUnicas = [...new Set(
    pedidos.map(p => Math.round(Number(p.carga_erp))).filter(Number.isFinite)
  )];
  const pedidosUnicos = [...new Set(
    pedidos.map(p => Math.round(Number(p.numero_pedido_erp))).filter(Number.isFinite)
  )];
  const semCarga = pedidos.filter(p => p.carga_erp == null || p.carga_erp === '').length;

  const lancMapPorCarga = new Map<number, Record<string, unknown>>();
  if (cargasUnicas.length) {
    const { data: lancRows } = await supabase
      .from('lancamentos')
      .select('carga,motorista,ajudante,veiculo,rota,und,rire,ts')
      .in('carga', cargasUnicas)
      .order('ts', { ascending: false });
    for (const l of lancRows ?? []) {
      const c = Math.round(Number((l as Record<string, unknown>).carga));
      if (!lancMapPorCarga.has(c)) lancMapPorCarga.set(c, l as Record<string, unknown>);
    }
  }

  const { data: rotasRows } = await supabase.from('rotas').select('nome,tipo');
  const ROTAS_RI = new Set(
    (rotasRows ?? [])
      .filter(r => String((r as Record<string, unknown>).tipo ?? '').toUpperCase().replace(/\./g, '') === 'RI')
      .map(r => String((r as Record<string, unknown>).nome ?? '').toUpperCase())
  );

  function calcularRire(lanc: Record<string, unknown> | undefined, rota: string): string {
    const rireDoLancamento = lanc?.rire ? String(lanc.rire) : '';
    if (rireDoLancamento) return rireDoLancamento;
    if (!rota) return '';
    return ROTAS_RI.has(rota.toUpperCase()) ? 'R.I.' : 'R.E.';
  }

  // Estado ANTERIOR de base_data pros pedidos deste lote — usado só pra
  // validar conflito de cliente antes de propagar data_entrega (abaixo).
  // Precisa ser lido ANTES do apagarPedidosAntigos/upsert desta requisição
  // sobrescreverem essas linhas.
  const baseDataExistenteMap = new Map<number, { cliente: string | null; mes_ano: string | null }>();
  if (pedidosUnicos.length) {
    const { data: existentesRows } = await supabase
      .from('base_data')
      .select('pedido,cliente,mes_ano')
      .in('pedido', pedidosUnicos);
    for (const r of existentesRows ?? []) {
      const row = r as Record<string, unknown>;
      baseDataExistenteMap.set(Math.round(Number(row.pedido)), {
        cliente: (row.cliente as string) ?? null,
        mes_ano: (row.mes_ano as string) ?? null,
      });
    }
  }

  const registrosProducao: Record<string, unknown>[] = [];
  const mesAnoPorPedido = new Map<number, string>();
  for (const p of pedidos) {
    const carga = Math.round(Number(p.carga_erp));
    const pedido = Math.round(Number(p.numero_pedido_erp));
    if (!Number.isFinite(carga) || !Number.isFinite(pedido)) continue;

    const dataPedido = String(p.data_pedido);
    const mesAno = calcularMesAno(dataPedido);
    if (!/^\d{4}-\d{2}$/.test(mesAno)) continue; // mesma validação do pushBaseData
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
      rire: calcularRire(lanc, rota),
      ocorrencia: 0,
      mes_ano: mesAno,
      semana_mes: calcularSemanaMes(dataPedido),
      data_pedido: dataPedido,
      cod_forn: null,
      cliente: String(p.nome_destinatario ?? '').trim().slice(0, 200) || null,
      bairro: String(p.bairro ?? '').trim().slice(0, 100) || null,
      volume: Math.max(0, Number(p.volumes) || 0) || null,
      nota_origem: p.numero_documento != null ? String(p.numero_documento).trim().slice(0, 500) || null : null,
    });
  }

  if (pedidosUnicos.length) {
    await apagarPedidosAntigos(supabase, pedidosUnicos, LOTE);
  }
  const resultadoProducao = await gravarEmLotes(supabase, 'base_data', registrosProducao, 'carga,pedido', LOTE);

  // ── Sincroniza o cache quantidade_pedidos/valor_total em demandas_rota
  // (tela de Expedição) — mesmo objetivo do passo que o upload manual de
  // planilha do Cronos faz depois de gravar em base_data, mas calculando o
  // total REAL da tabela (não só do que veio nesta requisição) — assim uma
  // carga que recebe pedidos em envios separados (dias diferentes) não tem
  // a contagem de um envio anterior apagada pelo envio seguinte. Só
  // atualiza cargas que já têm uma linha em demandas_rota (Pré-Carga
  // criada); se ainda não existir, não faz nada.
  if (cargasUnicas.length) {
    for (let i = 0; i < cargasUnicas.length; i += 5) {
      await Promise.all(
        cargasUnicas.slice(i, i + 5).map(async (carga) => {
          const { data: agregado } = await supabase
            .from('base_data')
            .select('valor')
            .eq('carga', carga);
          if (!agregado) return;
          const quantidade = agregado.length;
          const valorTotal = agregado.reduce((soma, r) => soma + (Number((r as Record<string, unknown>).valor) || 0), 0);
          await supabase
            .from('demandas_rota')
            .update({ quantidade_pedidos: quantidade, valor_total: valorTotal })
            .eq('carga', carga)
            .then(() => {}, () => {});
        })
      );
    }
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

  // ── Data de entrega — quando o ERP reenvia um pedido já promovido (mesmo
  // numero_pedido_erp) agora com `data_entrega` preenchido (pedido
  // entregue), propaga pra entrega_datas, fonte única do OTIF — mesmo
  // padrão que confirmarSaidaRota() já usa no Cronos pra propagar
  // data_saida (on_conflict=mes_ano,pedido, merge-duplicates).
  // Validação: só grava se o cliente que JÁ estava em base_data pra esse
  // pedido (antes desta requisição sobrescrever) bater com
  // nome_destinatario que veio agora — evita sobrescrever a data de um
  // pedido errado por duplicidade/erro de numeração no ERP. Pedidos
  // cancelados nunca gravam data de entrega (mesmo filtro do PR #223 de
  // cancelamento). Conflito não bloqueia a resposta (produção já foi
  // gravada) — só fica de fora do entrega_datas e vira um alerta visível
  // em erros_sistema (mesma tabela/badge que o resto do sistema já usa).
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

  if (registrosEntregaDatas.length) {
    await gravarEmLotes(supabase, 'entrega_datas', registrosEntregaDatas, 'mes_ano,pedido', LOTE)
      .catch((e) => console.error('[receber-pedidos-erp] Falha ao gravar entrega_datas:', (e as Error)?.message ?? e));
  }

  if (conflitosDataEntrega.length) {
    await supabase.from('erros_sistema').insert({
      usuario_nome: 'Integração ERP',
      pagina: 'erp-teste',
      tipo: 'erp_conflito_data_entrega',
      mensagem: `Integração ERP: ${conflitosDataEntrega.length} pedido(s) com data de entrega bloqueada(s) por conflito de cliente`,
      contexto: JSON.stringify({ conflitos: conflitosDataEntrega }),
      resolvido: false,
    }).then(() => {}, () => {});
  }

  return json({
    ok: true,
    total_recebidos: pedidos.length,
    total_gravados: resultadoProducao.total,
    ignorados: pedidos.length - resultadoProducao.total,
    mensagem: `${resultadoProducao.total} pedido(s) gravados com sucesso.`,
    timestamp: new Date().toISOString(),
    semCarga,
    datasEntregaGravadas: registrosEntregaDatas.length,
    conflitosDataEntrega: conflitosDataEntrega.length,
  }, 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
