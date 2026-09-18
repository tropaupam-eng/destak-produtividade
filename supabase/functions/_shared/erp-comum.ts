// Funções compartilhadas entre atualizar-pedidos-erp e receber-pedidos-erp —
// extraídas em 2026-08-21 depois que a regra de "cancelado não fica em carga"
// (2026-08-20) foi implementada só num dos dois endpoints na primeira
// tentativa e um bug real aconteceu em produção enquanto a segunda correção
// ainda não tinha sido feita. Qualquer regra que precise valer nos dois
// pontos de entrada do ERP deve morar aqui, não duplicada em cada index.ts.

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

export async function sincronizarDemandasRota(supabase: SupabaseClientAny, cargas: number[]) {
  for (let i = 0; i < cargas.length; i += 5) {
    await Promise.all(
      cargas.slice(i, i + 5).map(async (carga) => {
        const { data: agregado } = await supabase.from('base_data').select('valor').eq('carga', carga);
        const quantidade = agregado ? agregado.length : 0;
        const valorTotal = (agregado ?? []).reduce((soma: number, r: Record<string, unknown>) => soma + (Number(r.valor) || 0), 0);
        await supabase
          .from('demandas_rota')
          .update({ quantidade_pedidos: quantidade, valor_total: valorTotal })
          .eq('carga', carga)
          .then(() => {}, () => {});
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

// Pedido cancelado no ERP (Situacao = CA, gravada em pedidos_info_erp pela
// planilha de atualizações) não deve continuar nem ser recriado em carga —
// decisão do usuário em 2026-08-20. Chamado nos dois endpoints que podem
// criar/mover pedido em base_data. Se o pedido já estiver em base_data,
// remove e ressincroniza a(s) carga(s) afetada(s).
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
    const { data } = await supabase
      .from('pedidos_info_erp')
      .select('pedido')
      .in('pedido', lote)
      .eq('situacao', 'CA');
    (data ?? []).forEach((r: Record<string, unknown>) => canceladosSet.add(Math.round(Number(r.pedido))));
  }
  if (!canceladosSet.size) return { canceladosSet, pedidosCanceladosRemovidos };

  const canceladosLista = [...canceladosSet];
  for (let i = 0; i < canceladosLista.length; i += tamanhoLote) {
    const lote = canceladosLista.slice(i, i + tamanhoLote);
    const { data: existentesCancelados } = await supabase
      .from('base_data')
      .select('pedido,carga')
      .in('pedido', lote);
    const encontrados = (existentesCancelados ?? []) as Record<string, unknown>[];
    if (!encontrados.length) continue;
    await apagarPorPedido(supabase, encontrados.map(r => Math.round(Number(r.pedido))), tamanhoLote);
    pedidosCanceladosRemovidos += encontrados.length;
    const cargasParaResync = [...new Set(encontrados.map(r => Math.round(Number(r.carga))))];
    await sincronizarDemandasRota(supabase, cargasParaResync);
  }
  return { canceladosSet, pedidosCanceladosRemovidos };
}
