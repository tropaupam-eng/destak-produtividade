// Funcoes compartilhadas entre atualizar-pedidos-erp e receber-pedidos-erp.

// deno-lint-ignore no-explicit-any
export type SupabaseClientAny = any;

export async function gravarEmLotes(
  supabase: SupabaseClientAny,
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
        .then(({ error }: { error: { message: string } | null }) => ({ tamanho: lote.length, error }))
    )
  );
  const comErro = resultados.filter(r => r.error);
  const total = resultados.filter(r => !r.error).reduce((soma, r) => soma + r.tamanho, 0);
  return { total, erros: comErro.map(r => r.error!.message) };
}

export async function apagarPorPedido(
  supabase: SupabaseClientAny,
  numerosPedido: number[],
  tamanhoLote: number,
) {
  for (let i = 0; i < numerosPedido.length; i += tamanhoLote) {
    const lote = numerosPedido.slice(i, i + tamanhoLote);
    await supabase.from('base_data').delete().in('pedido', lote);
  }
}

export async function apagarPedidosSemCarga(
  supabase: SupabaseClientAny,
  numerosPedido: number[],
  tamanhoLote: number,
) {
  for (let i = 0; i < numerosPedido.length; i += tamanhoLote) {
    const lote = numerosPedido.slice(i, i + tamanhoLote);
    await supabase.from('pedidos_sem_carga').delete().in('pedido', lote);
  }
}

export function calcularMesAno(dataPedido: string): string {
  return dataPedido.slice(0, 7);
}

export function calcularSemanaMes(dataPedido: string): number {
  const [ano, mes, dia] = dataPedido.split('-').map(Number);
  const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1));
  let isodowPrimeiro = primeiroDia.getUTCDay();
  if (isodowPrimeiro === 0) isodowPrimeiro = 7;
  return Math.ceil((dia + isodowPrimeiro - 1) / 7);
}

// Achado em auditoria 2026-09-28: tentei duas vezes fazer esta funcao
// AUTO-CRIAR a linha de demandas_rota quando ela nao existia (a partir de
// 'lancamentos', primeiro sem checar 'vinculado', depois checando
// vinculado=true) -- as duas vezes criou cards fantasma na Expedicao
// ("CEASA"/"PETROLINA"/"RETIRA"/"JUAZEIRO" que o usuario confirmou NUNCA
// terem sido lancados na aba Expedicao de verdade). Causa: 'lancamentos' e
// 'demandas_rota' sao conceitos DIFERENTES -- lancamentos e o registro de
// motorista/veiculo pra produtividade/pagamento, demandas_rota e o board
// de Expedicao, criado SOMENTE pela acao humana em acaoRotaUnificada
// ('Adicionar a Pre-Carga') ou pelo formulario manual de lancamento. Uma
// carga pode ter lancamento (e ate vinculado=true) sem nunca ter passado
// pela Expedicao. Voltou a ser SO update, nunca insert -- carga sem linha
// em demandas_rota so ganha uma quando alguem realmente a lanca na tela.
export async function sincronizarDemandasRota(supabase: SupabaseClientAny, cargas: number[]) {
  for (let i = 0; i < cargas.length; i += 5) {
    await Promise.all(
      cargas.slice(i, i + 5).map(async (carga) => {
        const { data: agregado, error: erroAgregado } = await supabase.from('base_data').select('valor').eq('carga', carga);
        if (erroAgregado) {
          console.error(`[sincronizarDemandasRota] Falha ao agregar carga ${carga}:`, erroAgregado.message);
          return;
        }
        const quantidade = agregado ? agregado.length : 0;
        const valorTotal = (agregado ?? []).reduce((soma: number, r: Record<string, unknown>) => soma + (Number(r.valor) || 0), 0);
        const { error } = await supabase
          .from('demandas_rota')
          .update({ quantidade_pedidos: quantidade, valor_total: valorTotal })
          .eq('carga', carga);
        if (error) console.error(`[sincronizarDemandasRota] Falha ao atualizar carga ${carga}:`, error.message);
      })
    );
  }
}

export async function buscarRotasRI(supabase: SupabaseClientAny): Promise<Set<string>> {
  const { data: rotasRows } = await supabase.from('rotas').select('nome,tipo');
  return new Set(
    ((rotasRows ?? []) as Record<string, unknown>[])
      .filter(r => String(r.tipo ?? '').toUpperCase().replace(/\./g, '') === 'RI')
      .map(r => String(r.nome ?? '').toUpperCase())
  );
}

export function calcularRire(lanc: Record<string, unknown> | undefined, rota: string, rotasRI: Set<string>): string {
  const rireDoLancamento = lanc?.rire ? String(lanc.rire) : '';
  if (rireDoLancamento) return rireDoLancamento;
  if (!rota) return '';
  return rotasRI.has(rota.toUpperCase()) ? 'R.I.' : 'R.E.';
}

export async function buscarLancamentosPorCarga(
  supabase: SupabaseClientAny,
  cargas: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  if (!cargas.length) return map;
  const { data: lancRows } = await supabase
    .from('lancamentos')
    .select('carga,motorista,ajudante,veiculo,rota,und,rire,ts')
    .in('carga', cargas)
    .order('ts', { ascending: false });
  for (const l of (lancRows ?? []) as Record<string, unknown>[]) {
    const c = Math.round(Number(l.carga));
    if (!map.has(c)) map.set(c, l);
  }
  return map;
}

export async function removerCanceladosDeBaseData(
  supabase: SupabaseClientAny,
  numerosPedido: number[],
  tamanhoLote: number,
): Promise<{ canceladosSet: Set<number>; pedidosCanceladosRemovidos: number }> {
  const canceladosSet = new Set<number>();
  let pedidosCanceladosRemovidos = 0;
  if (!numerosPedido.length) return { canceladosSet, pedidosCanceladosRemovidos };

  for (let i = 0; i < numerosPedido.length; i += tamanhoLote) {
    const lote = numerosPedido.slice(i, i + tamanhoLote);
    const { data, error } = await supabase
      .from('pedidos_info_erp')
      .select('pedido')
      .in('pedido', lote)
      .eq('situacao', 'CA');
    if (error) {
      throw new Error(`Falha ao consultar pedidos cancelados (lote ${i}-${i + lote.length}): ${error.message}`);
    }
    (data ?? []).forEach((r: Record<string, unknown>) => canceladosSet.add(Math.round(Number(r.pedido))));
  }
  if (!canceladosSet.size) return { canceladosSet, pedidosCanceladosRemovidos };

  const canceladosLista = [...canceladosSet];
  for (let i = 0; i < canceladosLista.length; i += tamanhoLote) {
    const lote = canceladosLista.slice(i, i + tamanhoLote);
    const { data: existentesCancelados, error: erroExistentes } = await supabase
      .from('base_data')
      .select('pedido,carga')
      .in('pedido', lote);
    if (erroExistentes) {
      throw new Error(`Falha ao buscar pedidos cancelados em base_data (lote ${i}-${i + lote.length}): ${erroExistentes.message}`);
    }
    const encontrados = (existentesCancelados ?? []) as Record<string, unknown>[];
    if (!encontrados.length) continue;
    await apagarPorPedido(supabase, encontrados.map(r => Math.round(Number(r.pedido))), tamanhoLote);
    pedidosCanceladosRemovidos += encontrados.length;
    const cargasParaResync = [...new Set(encontrados.map(r => Math.round(Number(r.carga))))];
    await sincronizarDemandasRota(supabase, cargasParaResync);
  }
  return { canceladosSet, pedidosCanceladosRemovidos };
}

// Pedido que o ERP TIROU da carga (carga_erp vazio) nao pode continuar contando
// na carga do Cronos. Decisao do usuario em 2026-10-27: o que vale e o que a
// integracao manda; valor de planilha nao conta. Antes disso a integracao so
// processava pedido COM carga, entao pedido retirado no ERP ficava preso na
// carga e o card da Expedicao divergia do ERP (cargas 16065, 16113, 16171).
// Regras de seguranca:
//  - so mexe em carga que tem card ABERTO na Expedicao (formacao, pendente,
//    separacao, carregamento, aguardando_nf, aguardando_manifesto,
//    pronto_viagem); carga sem card, ou com card que ja saiu/concluiu/foi
//    cancelado, mantem o historico como esta;
//  - so considera cards da unidade 1 (ou sem unidade);
//  - antes de apagar, copia a linha inteira para base_data_removidos_erp; se a
//    copia falhar, NAO apaga;
//  - qualquer erro de consulta pula o lote em vez de apagar no escuro.
const STATUS_CARD_ABERTO = new Set([
  'formacao', 'pendente', 'separacao', 'carregamento', 'aguardando_nf', 'aguardando_manifesto', 'pronto_viagem',
]);

export async function removerPedidosQueSairamDaCarga(
  supabase: SupabaseClientAny,
  numerosPedido: number[],
  tamanhoLote: number,
): Promise<{ removidos: number; cargasAfetadas: number[] }> {
  const cargasAfetadas = new Set<number>();
  let removidos = 0;

  for (let i = 0; i < numerosPedido.length; i += tamanhoLote) {
    const lote = numerosPedido.slice(i, i + tamanhoLote);
    const { data: linhas, error: erroLinhas } = await supabase.from('base_data').select('*').in('pedido', lote);
    if (erroLinhas) {
      console.error('[removerPedidosQueSairamDaCarga] Falha ao ler base_data:', erroLinhas.message);
      continue;
    }
    const candidatas = (linhas ?? []) as Record<string, unknown>[];
    if (!candidatas.length) continue;

    const cargas = [...new Set(candidatas.map(r => Math.round(Number(r.carga))).filter(Number.isFinite))];
    const { data: cards, error: erroCards } = await supabase
      .from('demandas_rota')
      .select('carga,status,unidade')
      .in('carga', cargas);
    if (erroCards) {
      console.error('[removerPedidosQueSairamDaCarga] Falha ao ler demandas_rota:', erroCards.message);
      continue;
    }
    const abertas = new Set<number>();
    const fechadas = new Set<number>();
    for (const c of (cards ?? []) as Record<string, unknown>[]) {
      const und = String(c.unidade ?? '').trim();
      if (und && !und.startsWith('1')) continue;
      const carga = Math.round(Number(c.carga));
      if (STATUS_CARD_ABERTO.has(String(c.status))) abertas.add(carga); else fechadas.add(carga);
    }
    const alvo = candidatas.filter(r => {
      const carga = Math.round(Number(r.carga));
      return abertas.has(carga) && !fechadas.has(carga);
    });
    if (!alvo.length) continue;

    const agora = new Date().toISOString();
    const { error: erroArquivo } = await supabase.from('base_data_removidos_erp').insert(
      alvo.map(r => ({ ...r, removido_em: agora, motivo: 'ERP tirou o pedido da carga (carga_erp vazio) - integracao' })),
    );
    if (erroArquivo) {
      console.error('[removerPedidosQueSairamDaCarga] Falha ao arquivar, nada apagado:', erroArquivo.message);
      continue;
    }
    const { error: erroApagar } = await supabase.from('base_data').delete().in('id', alvo.map(r => r.id));
    if (erroApagar) {
      console.error('[removerPedidosQueSairamDaCarga] Falha ao apagar de base_data:', erroApagar.message);
      continue;
    }
    removidos += alvo.length;
    alvo.forEach(r => cargasAfetadas.add(Math.round(Number(r.carga))));
  }
  return { removidos, cargasAfetadas: [...cargasAfetadas] };
}
