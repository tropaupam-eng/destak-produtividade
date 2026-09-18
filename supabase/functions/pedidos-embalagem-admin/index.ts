import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// CORRIGIDO 2026-09-19: as ações destrutivas (limpar/remover) não tinham
// NENHUMA verificação de autorização no servidor — só um confirm() no
// navegador, que qualquer POST direto ignora. Sem ADMIN_KEY configurada,
// essas duas ações ficam bloqueadas (fail closed); leitura (?acao=dados)
// continua livre, é só visualização.
//    supabase secrets set EMB_ADMIN_KEY=<valor novo e aleatório>
const ADMIN_KEY = Deno.env.get("EMB_ADMIN_KEY") ?? "";

async function rpc(nome: string, corpo: unknown) {
  const r = await fetch(URL_SB + "/rest/v1/rpc/" + nome, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CHAVE,
      Authorization: "Bearer " + CHAVE,
    },
    body: JSON.stringify(corpo ?? {}),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(texto);
  return texto ? JSON.parse(texto) : null;
}

const PAGINA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel Administrativo — Pedidos de Embalagem</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --fundo:#0d1117;--papel:#161b22;--papel-alt:#1c2230;
    --tinta:#e8eaed;--texto:#b6bcc6;--suave:#7d8694;
    --borda:#2a3140;--borda-clara:#222836;
    --azul:#6ea8d8;--verde:#63b58a;--verde-fundo:#16241d;
    --ambar:#d8ab5f;--ambar-fundo:#251f13;
    --alerta:#d97a6c;--alerta-fundo:#241716;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--fundo);color:var(--texto);
    font-family:'Inter',-apple-system,Arial,sans-serif;font-size:14px;line-height:1.5;
    padding:24px 14px 60px;-webkit-font-smoothing:antialiased}
  .doc{max-width:1240px;margin:0 auto;background:var(--papel);border:1px solid var(--borda);border-radius:3px}
  header{padding:26px 30px 22px;border-bottom:1px solid var(--borda)}
  .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
  .marca{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--azul)}
  .marca span{display:block;font-weight:500;letter-spacing:.1em;color:var(--suave);margin-top:3px;font-size:10px}
  .ref{font-family:'Roboto Mono',monospace;font-size:10px;letter-spacing:.08em;color:var(--suave);text-align:right;line-height:1.9}
  h1{font-size:23px;font-weight:700;letter-spacing:-.02em;color:var(--tinta);margin-top:18px;line-height:1.2}
  .lead{margin-top:7px;font-size:13.5px;color:var(--suave);max-width:70ch}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--borda);background:var(--papel-alt)}
  .kpi{padding:18px 30px;border-right:1px solid var(--borda-clara)}
  .kpi:last-child{border-right:0}
  .kpi .v{font-family:'Roboto Mono',monospace;font-size:28px;font-weight:500;color:var(--tinta);line-height:1}
  .kpi .l{font-size:10px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--suave);margin-top:7px}
  .barra{padding:14px 30px;border-bottom:1px solid var(--borda);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .barra input[type=text]{flex:1;min-width:170px}
  input[type=text]{background:#0f141c;border:1px solid var(--borda);color:var(--tinta);
    border-radius:3px;padding:8px 11px;font-family:inherit;font-size:13px}
  input:focus,button:focus-visible{outline:2px solid var(--azul);outline-offset:-1px}
  .btn{background:#212938;border:1px solid var(--borda);color:var(--tinta);border-radius:3px;
    padding:8px 14px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
  .btn:hover{border-color:var(--azul);color:var(--azul)}
  .btn.forte{background:var(--azul);border-color:var(--azul);color:#0d1117;font-weight:600}
  .btn.perigo:hover{border-color:var(--alerta);color:var(--alerta)}
  .btn.mini{padding:3px 8px;font-size:11px}
  .sync{margin-left:auto;display:flex;align-items:center;gap:7px;
    font-family:'Roboto Mono',monospace;font-size:10.5px;color:var(--suave)}
  .ponto{width:7px;height:7px;border-radius:50%;background:var(--verde)}
  .ponto.erro{background:var(--alerta)}
  section{padding:26px 30px 10px}
  .cab-sec{display:flex;align-items:baseline;gap:14px;border-bottom:1.5px solid var(--azul);padding-bottom:9px;margin-bottom:14px}
  .cab-sec h2{font-size:13.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tinta)}
  .cab-sec .m{margin-left:auto;font-family:'Roboto Mono',monospace;font-size:11px;color:var(--suave)}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px}
  .card{background:var(--papel-alt);border:1px solid var(--borda);border-radius:3px;padding:15px 16px}
  .card h3{font-size:13px;font-weight:600;color:var(--tinta);margin-bottom:10px;display:flex;justify-content:space-between;gap:8px}
  .card h3 em{font-family:'Roboto Mono',monospace;font-style:normal;font-size:10px;color:var(--azul)}
  .card .l{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:var(--suave)}
  .card .l b{font-family:'Roboto Mono',monospace;font-weight:500;color:var(--tinta)}
  .card .acoes{margin-top:11px;display:flex;gap:6px}
  .card .acoes button{flex:1;font-size:11px;padding:6px}
  .vazio{padding:16px 0;font-size:13px;color:var(--suave)}
  .rolagem{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}
  thead th{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--suave);
    text-align:left;padding:11px 8px;border-bottom:1px solid var(--borda);background:var(--papel);position:sticky;top:0;z-index:2}
  th.loja{text-align:center;color:var(--azul);min-width:82px}
  td{padding:8px;border-bottom:1px solid var(--borda-clara)}
  tbody tr:nth-child(even){background:#1a202c}
  tbody tr:hover{background:#17222e}
  .cod{font-family:'Roboto Mono',monospace;color:var(--azul);white-space:nowrap}
  .num{font-family:'Roboto Mono',monospace;text-align:right;color:var(--tinta);white-space:nowrap}
  .undf{font-family:'Roboto Mono',monospace;font-size:10px;color:var(--suave)}
  .zero{color:#4c5563}
  .cel{text-align:center;font-family:'Roboto Mono',monospace}
  .cel b{color:var(--verde);font-weight:500}
  tr.esgotado td{color:var(--alerta)}
  tr.esgotado .cod{color:var(--alerta)}
  tfoot td{border-top:1.5px solid var(--azul);font-weight:600;color:var(--tinta);padding:11px 8px;background:var(--papel-alt);
    font-family:'Roboto Mono',monospace}
  tfoot td.rot{font-family:'Inter',sans-serif;text-align:right}
  .selo{display:inline-block;font-family:'Roboto Mono',monospace;font-size:9px;letter-spacing:.07em;
    text-transform:uppercase;padding:1px 6px;border-radius:2px;border:1px solid;margin-left:7px}
  .selo.fim{color:var(--alerta);border-color:#5c3230;background:var(--alerta-fundo)}
  .selo.pouco{color:var(--ambar);border-color:#5c4a26;background:var(--ambar-fundo)}
  .nota{font-size:11.5px;color:var(--suave);padding:16px 30px 24px;border-top:1px solid var(--borda-clara);line-height:1.65}
  .nota b{color:var(--tinta);font-weight:600}
  footer{padding:14px 30px 22px;border-top:1px solid var(--borda-clara);
    font-family:'Roboto Mono',monospace;font-size:10px;letter-spacing:.07em;color:#5d6673;
    display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
  @media (max-width:760px){
    body{padding:10px 6px 40px}
    header,.barra,section,.nota,footer{padding-left:16px;padding-right:16px}
    .kpis{grid-template-columns:1fr 1fr}
    .kpi{padding:15px 16px;border-bottom:1px solid var(--borda-clara)}
    h1{font-size:19px}
  }
  @media print{
    body{background:#fff;color:#222;padding:0}
    .doc{border:0;background:#fff;max-width:none}
    .barra,.acoes,.nao-imprime{display:none !important}
    h1,.cod,.num,td,.cab-sec h2,.card h3,tfoot td{color:#111}
    .kpis,.card,tfoot td,thead th{background:#f4f4f4}
    tbody tr:nth-child(even){background:#fafafa}
  }
</style>
</head>
<body>
<div class="doc">
  <header>
    <div class="topo">
      <div class="marca">Destak Prime<span>Logística · Almoxarifado</span></div>
      <div class="ref">Painel administrativo<br>Documento &nbsp;CTG-EMB-001<br><span id="agora"></span></div>
    </div>
    <h1>Pedidos de embalagem — acompanhamento</h1>
    <p class="lead">Posição em tempo real do que cada loja reservou, quanto ainda resta no CD e quais itens já esgotaram. Os dados vêm da mesma base que os gerentes usam.</p>
  </header>

  <div class="kpis">
    <div class="kpi"><div class="v" id="kItens">–</div><div class="l">Itens no catálogo</div></div>
    <div class="kpi"><div class="v" id="kLojas">–</div><div class="l">Lojas com pedido</div></div>
    <div class="kpi"><div class="v" id="kReservado">–</div><div class="l">Quantidade reservada</div></div>
    <div class="kpi"><div class="v" id="kEsgotados">–</div><div class="l">Itens esgotados</div></div>
  </div>

  <div class="barra nao-imprime">
    <input type="text" id="busca" placeholder="Filtrar por código ou descrição">
    <button class="btn" id="btnSoPedidos">Só itens com pedido</button>
    <button class="btn" id="btnAtualizar">Atualizar</button>
    <button class="btn" id="btnCSV">Exportar CSV</button>
    <button class="btn" id="btnImprimir">Imprimir</button>
    <button class="btn perigo" id="btnZerarTudo">Encerrar período</button>
    <span class="sync"><span class="ponto" id="ponto"></span><span id="status">carregando</span></span>
  </div>

  <section>
    <div class="cab-sec"><h2>Resumo por loja</h2><span class="m" id="mLojas"></span></div>
    <div id="cards" class="cards"></div>
  </section>

  <section>
    <div class="cab-sec"><h2>Posição por item</h2><span class="m" id="mItens"></span></div>
    <div class="rolagem">
      <table>
        <thead><tr id="cabecalho"></tr></thead>
        <tbody id="corpo"></tbody>
        <tfoot><tr id="rodape"></tr></tfoot>
      </table>
    </div>
  </section>

  <p class="nota">
    <b>Encerrar período</b> apaga todas as reservas e devolve o estoque inteiro para a lista dos gerentes. Exporte o CSV antes. Pede a senha de administrador.<br>
    <b>Unidades de medida.</b> Os códigos 75, 2834 e 3246 foram contados em medida diferente da cadastrada. Converter antes de lançar no Winthor.
  </p>
  <footer><span>Destak Prime · Documento operacional interno</span><span>CTG-EMB-001</span></footer>
</div>

<script>
var estado = [], lojas = [], resumoLojas = [], soPedidos = false;
var API = location.pathname;
var chaveAdmin = null;

function fmt(n){ return Number(n).toLocaleString('pt-BR'); }
function sinal(cls, txt){
  document.getElementById('ponto').className = 'ponto' + (cls === 'erro' ? ' erro' : '');
  document.getElementById('status').textContent = txt;
}
function hora(){ return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function qtd(it, loja){ return (it.por_loja || {})[loja] || 0; }

function carregar(){
  return fetch(API + '?acao=dados', {cache:'no-store'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      estado = d.itens || [];
      resumoLojas = d.lojas || [];
      var vistas = {};
      estado.forEach(function(it){
        Object.keys(it.por_loja || {}).forEach(function(l){ vistas[l] = true; });
      });
      lojas = Object.keys(vistas).sort();
      sinal('ok','atualizado ' + hora());
      desenhar();
    })
    .catch(function(){ sinal('erro','sem conexão'); });
}

// Ações destrutivas (limpar/remover) exigem a senha de administrador,
// pedida uma vez por sessão da página e reenviada no header x-admin-key.
// Se o servidor rejeitar (senha errada), limpa o cache pra pedir de novo.
function acaoProtegida(nome, corpo){
  if(!chaveAdmin){
    chaveAdmin = window.prompt('Senha de administrador para "' + nome + '":') || '';
    if(!chaveAdmin) return Promise.reject(new Error('cancelado'));
  }
  return fetch(API + '?acao=' + nome, {
    method:'POST',
    headers:{'Content-Type':'application/json', 'x-admin-key': chaveAdmin},
    body: JSON.stringify(corpo)
  }).then(function(r){
    if(r.status === 401){ chaveAdmin = null; alert('Senha de administrador incorreta.'); return Promise.reject(new Error('não autorizado')); }
    return r.json();
  }).then(function(){ return carregar(); });
}

function desenhar(){
  var totalReservado = 0, esgotados = 0;
  estado.forEach(function(it){
    totalReservado += it.reservado;
    if(it.disponivel <= 0) esgotados++;
  });
  document.getElementById('kItens').textContent = estado.length;
  document.getElementById('kLojas').textContent = lojas.length;
  document.getElementById('kReservado').textContent = fmt(totalReservado);
  document.getElementById('kEsgotados').textContent = esgotados;
  document.getElementById('agora').textContent = new Date().toLocaleString('pt-BR');

  var cards = document.getElementById('cards');
  cards.innerHTML = '';
  if(!resumoLojas.length){
    cards.innerHTML = '<p class="vazio">Nenhuma loja lançou pedido até agora.</p>';
    document.getElementById('mLojas').textContent = '';
  } else {
    document.getElementById('mLojas').textContent = resumoLojas.length + ' lojas';
    resumoLojas.forEach(function(l){
      var c = document.createElement('div');
      c.className = 'card';
      var ultima = l.ultima ? new Date(l.ultima).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '–';
      c.innerHTML = '<h3>' + l.loja + ' <em>' + l.itens + ' itens</em></h3>' +
        '<div class="l"><span>Quantidade</span><b>' + fmt(l.quantidade) + '</b></div>' +
        '<div class="l"><span>Último lançamento</span><b>' + ultima + '</b></div>';
      var acoes = document.createElement('div');
      acoes.className = 'acoes nao-imprime';
      var bCsv = document.createElement('button');
      bCsv.className = 'btn mini';
      bCsv.textContent = 'CSV';
      bCsv.onclick = function(){ exportar(l.loja); };
      var bDel = document.createElement('button');
      bDel.className = 'btn mini perigo';
      bDel.textContent = 'Zerar';
      bDel.onclick = function(){
        if(confirm('Apagar todo o pedido da loja ' + l.loja + '?')) acaoProtegida('limpar', {loja: l.loja});
      };
      acoes.appendChild(bCsv); acoes.appendChild(bDel);
      c.appendChild(acoes);
      cards.appendChild(c);
    });
  }

  var cab = document.getElementById('cabecalho');
  cab.innerHTML = '<th style="width:70px">Código</th><th style="min-width:230px">Descrição</th>' +
    '<th style="width:44px">Undf</th><th style="width:76px;text-align:right">Contagem</th>' +
    lojas.map(function(l){ return '<th class="loja">' + l + '</th>'; }).join('') +
    '<th style="width:80px;text-align:right">Reservado</th><th style="width:76px;text-align:right">Saldo CD</th>';

  var busca = document.getElementById('busca').value.trim().toLowerCase();
  var corpo = document.getElementById('corpo');
  corpo.innerHTML = '';
  var visiveis = 0;

  estado.forEach(function(it){
    if(busca && it.codigo.indexOf(busca) < 0 && it.descricao.toLowerCase().indexOf(busca) < 0) return;
    if(soPedidos && it.reservado === 0) return;
    visiveis++;
    var tr = document.createElement('tr');
    if(it.disponivel <= 0) tr.className = 'esgotado';
    var selo = it.disponivel <= 0 ? '<span class="selo fim">Esgotado</span>' :
      (it.contagem > 0 && (it.disponivel / it.contagem) <= 0.15 ? '<span class="selo pouco">Pouco</span>' : '');
    var cels = lojas.map(function(l){
      var q = qtd(it, l);
      return '<td class="cel">' + (q ? '<b>' + fmt(q) + '</b>' : '<span class="zero">–</span>') + '</td>';
    }).join('');
    tr.innerHTML = '<td class="cod">' + it.codigo + '</td><td>' + it.descricao + selo + '</td>' +
      '<td class="undf">' + it.undf + '</td><td class="num">' + fmt(it.contagem) + '</td>' + cels +
      '<td class="num">' + (it.reservado ? fmt(it.reservado) : '<span class="zero">–</span>') + '</td>' +
      '<td class="num">' + fmt(it.disponivel) + '</td>';
    corpo.appendChild(tr);
  });

  document.getElementById('mItens').textContent = visiveis + ' de ' + estado.length + ' itens';

  var totCont = 0, totRes = 0;
  estado.forEach(function(it){ totCont += it.contagem; totRes += it.reservado; });
  document.getElementById('rodape').innerHTML =
    '<td colspan="3" class="rot">Totais</td><td class="num">' + fmt(totCont) + '</td>' +
    lojas.map(function(l){
      var s = 0;
      estado.forEach(function(it){ s += qtd(it, l); });
      return '<td class="cel">' + (s ? fmt(s) : '–') + '</td>';
    }).join('') +
    '<td class="num">' + fmt(totRes) + '</td><td class="num">' + fmt(totCont - totRes) + '</td>';
}

function exportar(soLoja){
  var linhas = [['Loja','Codigo','Descricao','Undf','Quantidade']];
  var alvo = soLoja ? [soLoja] : lojas;
  alvo.forEach(function(l){
    estado.forEach(function(it){
      var q = qtd(it, l);
      if(q > 0) linhas.push([l, it.codigo, it.descricao, it.undf, q]);
    });
  });
  if(linhas.length === 1){ alert('Nenhum pedido lançado.'); return; }
  var csv = '\\uFEFF' + linhas.map(function(r){
    return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(';');
  }).join('\\r\\n');
  var url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  var a = document.createElement('a');
  a.href = url;
  a.download = soLoja ? 'pedido_' + soLoja.toLowerCase().replace(/\\s+/g,'_') + '.csv' : 'pedidos_todas_lojas.csv';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('busca').addEventListener('input', desenhar);
document.getElementById('btnSoPedidos').onclick = function(e){
  soPedidos = !soPedidos;
  e.target.textContent = soPedidos ? 'Mostrar todos' : 'Só itens com pedido';
  e.target.className = 'btn' + (soPedidos ? ' forte' : '');
  desenhar();
};
document.getElementById('btnAtualizar').onclick = function(){ carregar(); };
document.getElementById('btnCSV').onclick = function(){ exportar(null); };
document.getElementById('btnImprimir').onclick = function(){ window.print(); };
document.getElementById('btnZerarTudo').onclick = function(){
  if(!confirm('Isso apaga os pedidos de TODAS as lojas e libera o estoque inteiro. Confirma?')) return;
  if(!confirm('Confirma novamente? A ação não pode ser desfeita.')) return;
  acaoProtegida('limpar', {});
};

carregar();
setInterval(carregar, 10000);
<\/script>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");

  try {
    if (acao === "dados") {
      const [itens, lojas] = await Promise.all([
        rpc("emb_estado", {}),
        rpc("emb_resumo_lojas", {}),
      ]);
      return new Response(JSON.stringify({ itens, lojas }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (acao === "limpar" && req.method === "POST") {
      if (!ADMIN_KEY || req.headers.get("x-admin-key") !== ADMIN_KEY) {
        return new Response(JSON.stringify({ erro: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const corpo = await req.json().catch(() => ({}));
      const loja = corpo.loja ? String(corpo.loja).trim().slice(0, 40) : null;
      const r = await rpc("emb_admin_limpar", { p_loja: loja });
      return new Response(JSON.stringify(r), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (acao === "remover" && req.method === "POST") {
      if (!ADMIN_KEY || req.headers.get("x-admin-key") !== ADMIN_KEY) {
        return new Response(JSON.stringify({ erro: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const corpo = await req.json();
      const r = await rpc("emb_admin_remover", {
        p_loja: String(corpo.loja ?? "").trim(),
        p_codigo: String(corpo.codigo ?? "").trim(),
      });
      return new Response(JSON.stringify(r), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    return new Response(PAGINA, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
