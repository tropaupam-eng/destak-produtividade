import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Achado em auditoria de seguranca 2026-09-28: a acao "reservar" nao tinha
// NENHUMA verificacao -- qualquer pessoa com a URL conseguia alterar
// reserva de estoque de qualquer loja, sem senha. Agora exige uma chave de
// acesso compartilhada (pedida uma vez ao entrar na loja, nao por login
// individual -- mantem o fluxo simples pra quem usa). Sem a secret
// configurada, fica bloqueado (fail closed), nao vira acesso livre.
//    supabase secrets set EMB_ACCESS_KEY=<valor novo>
const ACCESS_KEY = Deno.env.get("EMB_ACCESS_KEY") ?? "";

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
<title>Pedidos de Embalagem — Destak Prime</title>
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
    padding:24px 14px 96px;-webkit-font-smoothing:antialiased}
  .doc{max-width:1020px;margin:0 auto;background:var(--papel);border:1px solid var(--borda);border-radius:3px}
  header{padding:26px 30px 22px;border-bottom:1px solid var(--borda)}
  .marca{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--azul)}
  .marca span{display:block;font-weight:500;letter-spacing:.1em;color:var(--suave);margin-top:3px;font-size:10px}
  h1{font-size:23px;font-weight:700;letter-spacing:-.02em;color:var(--tinta);margin-top:18px;line-height:1.2}
  .lead{margin-top:7px;font-size:13.5px;color:var(--suave);max-width:68ch}
  .porta{padding:44px 30px 52px;text-align:center}
  .porta h2{font-size:17px;font-weight:600;color:var(--tinta);margin-bottom:6px}
  .porta p{font-size:13.5px;color:var(--suave);margin-bottom:24px}
  .grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,190px));gap:10px;justify-content:center}
  .grade button{background:var(--papel-alt);border:1px solid var(--borda);color:var(--tinta);
    border-radius:3px;padding:16px 12px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}
  .grade button:hover{border-color:var(--azul);color:var(--azul)}
  input[type=text],input[type=number]{background:#0f141c;border:1px solid var(--borda);color:var(--tinta);
    border-radius:3px;padding:8px 11px;font-family:inherit;font-size:13px}
  input:focus,button:focus-visible{outline:2px solid var(--azul);outline-offset:-1px}
  .btn{background:#212938;border:1px solid var(--borda);color:var(--tinta);border-radius:3px;
    padding:8px 14px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
  .btn:hover{border-color:var(--azul);color:var(--azul)}
  .btn.forte{background:var(--azul);border-color:var(--azul);color:#0d1117;font-weight:600}
  .btn:disabled{opacity:.4;cursor:not-allowed}
  .barra{padding:14px 30px;border-bottom:1px solid var(--borda);background:var(--papel-alt);
    display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .quem{font-size:13px;color:var(--suave)}
  .quem b{color:var(--tinta);font-weight:600}
  .sync{margin-left:auto;display:flex;align-items:center;gap:7px;
    font-family:'Roboto Mono',monospace;font-size:10.5px;color:var(--suave)}
  .ponto{width:7px;height:7px;border-radius:50%;background:var(--verde)}
  .ponto.erro{background:var(--alerta)}
  .filtros{padding:14px 30px;border-bottom:1px solid var(--borda);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .filtros input[type=text]{flex:1;min-width:180px}
  .lista{padding:8px 30px 20px}
  .item{display:grid;grid-template-columns:1fr 190px 138px;gap:16px;align-items:center;
    padding:14px 0;border-bottom:1px solid var(--borda-clara)}
  .item.esgotado{opacity:.45}
  .item h3{font-size:14px;font-weight:500;color:var(--tinta);line-height:1.35}
  .meta{font-family:'Roboto Mono',monospace;font-size:11px;color:var(--suave);margin-top:4px}
  .meta b{color:var(--azul);font-weight:500}
  .medidor{display:flex;flex-direction:column;gap:6px}
  .rot{display:flex;justify-content:space-between;font-size:11px;color:var(--suave)}
  .rot b{font-family:'Roboto Mono',monospace;font-weight:500;color:var(--tinta)}
  .trilho{height:5px;background:#232b3a;border-radius:3px;overflow:hidden}
  .preenche{height:100%;background:var(--verde);border-radius:3px;transition:width .2s}
  .preenche.medio{background:var(--ambar)}
  .preenche.baixo{background:var(--alerta)}
  .selo{display:inline-block;font-family:'Roboto Mono',monospace;font-size:9.5px;font-weight:500;
    letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:2px;border:1px solid;margin-left:6px}
  .selo.ok{color:var(--verde);border-color:#2f5c46;background:var(--verde-fundo)}
  .selo.pouco{color:var(--ambar);border-color:#5c4a26;background:var(--ambar-fundo)}
  .selo.fim{color:var(--alerta);border-color:#5c3230;background:var(--alerta-fundo)}
  .pedir{display:flex;gap:7px;align-items:center;justify-content:flex-end}
  .pedir input{width:76px;font-family:'Roboto Mono',monospace;font-size:14px;text-align:right}
  .pedir input.tem{border-color:var(--verde);color:var(--verde)}
  .max{font-family:'Roboto Mono',monospace;font-size:10px;color:var(--suave);white-space:nowrap}
  .ajuste{font-size:11px;color:var(--ambar);margin-top:5px;text-align:right}
  .carrinho{position:fixed;left:0;right:0;bottom:0;background:var(--papel-alt);
    border-top:1px solid var(--azul);padding:13px 30px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;z-index:10}
  .carrinho .t{font-size:13px;color:var(--suave)}
  .carrinho .t b{font-family:'Roboto Mono',monospace;color:var(--tinta);font-weight:600;font-size:15px}
  .carrinho .dir{margin-left:auto;display:flex;gap:9px;flex-wrap:wrap}
  .resumo{padding:26px 30px 34px;border-top:1px solid var(--borda)}
  .cab-sec{display:flex;align-items:baseline;gap:14px;border-bottom:1.5px solid var(--azul);padding-bottom:9px;margin-bottom:14px}
  .cab-sec h2{font-size:13.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--tinta)}
  .cab-sec .m{margin-left:auto;font-family:'Roboto Mono',monospace;font-size:11px;color:var(--suave)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead th{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--suave);
    text-align:left;padding:10px 8px;border-bottom:1px solid var(--borda)}
  td{padding:8px;border-bottom:1px solid var(--borda-clara)}
  .cod{font-family:'Roboto Mono',monospace;color:var(--azul);white-space:nowrap}
  .num{font-family:'Roboto Mono',monospace;text-align:right;color:var(--tinta);white-space:nowrap}
  .undf{font-family:'Roboto Mono',monospace;font-size:10px;color:var(--suave)}
  tfoot td{border-top:1.5px solid var(--azul);font-weight:600;color:var(--tinta);padding:11px 8px}
  .aviso{font-size:13px;color:var(--suave);padding:14px 0}
  .nota{font-size:11.5px;color:var(--suave);padding:14px 30px 26px;border-top:1px solid var(--borda-clara);line-height:1.65}
  .nota b{color:var(--tinta);font-weight:600}
  footer{padding:14px 30px 22px;border-top:1px solid var(--borda-clara);
    font-family:'Roboto Mono',monospace;font-size:10px;letter-spacing:.07em;color:#5d6673;
    display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .oculto{display:none !important}
  @media (max-width:720px){
    body{padding:10px 6px 118px}
    header,.barra,.filtros,.lista,.resumo,.nota,footer,.carrinho{padding-left:16px;padding-right:16px}
    h1{font-size:19px}
    .item{grid-template-columns:1fr;gap:10px}
    .pedir{justify-content:flex-start}
    .carrinho{flex-direction:column;align-items:stretch;gap:10px}
    .carrinho .dir{margin-left:0}
    .carrinho .dir button{flex:1}
  }
  @media print{
    body{background:#fff;color:#222;padding:0}
    .doc{border:0;background:#fff;max-width:none}
    .barra,.filtros,.lista,.carrinho{display:none !important}
    h1,.cod,.num,td,.cab-sec h2{color:#111}
  }
</style>
</head>
<body>
<div class="doc">
  <header>
    <div class="marca">Destak Prime<span>Logística · Almoxarifado</span></div>
    <h1>Pedidos de material de embalagem</h1>
    <p class="lead">Escolha os itens e as quantidades para a sua loja. O estoque é compartilhado e atualizado em tempo real: o que uma loja reserva sai do disponível das outras.</p>
  </header>

  <div class="porta" id="porta">
    <h2>Qual é a sua loja?</h2>
    <p>Selecione abaixo para começar o pedido.</p>
    <div class="grade" id="grade"></div>
  </div>

  <div id="app" class="oculto">
    <div class="barra">
      <span class="quem">Pedido da loja <b id="nomeLoja"></b></span>
      <button class="btn" id="btnTrocar">Trocar de loja</button>
      <span class="sync"><span class="ponto" id="ponto"></span><span id="status">conectando</span></span>
    </div>
    <div class="filtros">
      <input type="text" id="busca" placeholder="Buscar por código ou descrição">
      <button class="btn" id="btnEsgotados">Ocultar esgotados</button>
      <button class="btn" id="btnAtualizar">Atualizar agora</button>
    </div>
    <div class="lista" id="lista"></div>
    <div class="resumo">
      <div class="cab-sec"><h2>Meu pedido</h2><span class="m" id="metaPedido"></span></div>
      <div id="areaPedido"><p class="aviso">Nenhum item selecionado até agora.</p></div>
    </div>
    <p class="nota">
      <b>Reserva imediata.</b> A quantidade digitada já fica reservada para a sua loja, sem precisar confirmar. Se outra loja reservar antes, o campo trava no que sobrou e você é avisado do ajuste.<br>
      <b>Unidades de medida.</b> Os códigos 75, 2834 e 3246 foram contados em medida diferente da cadastrada. Confirme com o almoxarifado antes de pedir.
    </p>
    <footer><span>Destak Prime · Documento operacional interno</span><span>CTG-EMB-001</span></footer>
  </div>
</div>

<div class="carrinho oculto" id="carrinho">
  <span class="t">Itens selecionados <b id="cItens">0</b></span>
  <span class="t">Quantidade total <b id="cQtd">0</b></span>
  <span class="dir">
    <button class="btn" id="btnCSV">Baixar CSV</button>
    <button class="btn" id="btnImprimir">Imprimir pedido</button>
  </span>
</div>

<script>
var LOJAS = ["Petrolina","Patos","Salvador","Destak Ceasa","Prime Ceasa","Caleb"];
var estado = [], minhaLoja = null, editando = null, ocultar = false, avisos = {};
var API = location.pathname;
var chaveAcesso = sessionStorage.getItem('emb_chave') || null;

function fmt(n){ return Number(n).toLocaleString('pt-BR'); }
function sinal(cls, txt){
  document.getElementById('ponto').className = 'ponto' + (cls === 'erro' ? ' erro' : '');
  document.getElementById('status').textContent = txt;
}
function hora(){
  return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function minhaQtd(it){
  var m = it.por_loja || {};
  return m[minhaLoja] || 0;
}

function carregar(){
  return fetch(API + '?acao=estado', {cache:'no-store'})
    .then(function(r){ return r.json(); })
    .then(function(d){
      estado = d;
      sinal('ok','atualizado ' + hora());
      desenhar();
    })
    .catch(function(){ sinal('erro','sem conexão'); });
}

function reservar(codigo, qtd){
  sinal('ok','salvando');
  return fetch(API + '?acao=reservar', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'x-emb-key': chaveAcesso || ''},
    body: JSON.stringify({loja: minhaLoja, codigo: codigo, quantidade: qtd})
  }).then(function(r){
    if(r.status === 401){
      sessionStorage.removeItem('emb_chave');
      chaveAcesso = null;
      alert('Chave de acesso incorreta ou expirada. Digite novamente.');
      return carregar();
    }
    return r.json();
  }).then(function(res){
      if(res && res.ajustado){
        avisos[codigo] = 'Só restaram ' + fmt(res.aplicado) + '. Pedido ajustado.';
      } else {
        delete avisos[codigo];
      }
      return carregar();
    })
    .catch(function(){ sinal('erro','falha ao salvar'); });
}

var timers = {};
function agendar(codigo, qtd){
  clearTimeout(timers[codigo]);
  timers[codigo] = setTimeout(function(){ reservar(codigo, qtd); }, 600);
}

function desenhar(){
  var busca = document.getElementById('busca').value.trim().toLowerCase();
  var lista = document.getElementById('lista');
  lista.innerHTML = '';

  estado.forEach(function(it){
    var minha = minhaQtd(it);
    var disp = it.disponivel;
    var teto = disp + minha;
    if(busca && it.codigo.indexOf(busca) < 0 && it.descricao.toLowerCase().indexOf(busca) < 0) return;
    if(ocultar && disp <= 0 && minha === 0) return;

    var pct = it.contagem > 0 ? Math.max(0, Math.min(100, (disp / it.contagem) * 100)) : 0;
    var nivel = (disp <= 0 || pct <= 15) ? 'baixo' : (pct <= 40 ? 'medio' : '');
    var selo = disp <= 0 ? ['fim','Esgotado'] : (pct <= 15 ? ['pouco','Últimas unidades'] : ['ok','Disponível']);

    var linha = document.createElement('div');
    linha.className = 'item' + (disp <= 0 && minha === 0 ? ' esgotado' : '');

    var info = document.createElement('div');
    var h3 = document.createElement('h3');
    h3.textContent = it.descricao;
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = 'cód <b>' + it.codigo + '</b> · ' + it.undf + ' · contagem ' + fmt(it.contagem);
    var sp = document.createElement('span');
    sp.className = 'selo ' + selo[0];
    sp.textContent = selo[1];
    meta.appendChild(sp);
    info.appendChild(h3); info.appendChild(meta);

    var med = document.createElement('div');
    med.className = 'medidor';
    med.innerHTML =
      '<div class="rot"><span>Disponível</span><b>' + fmt(Math.max(0,disp)) + ' de ' + fmt(it.contagem) + '</b></div>' +
      '<div class="trilho"><div class="preenche ' + nivel + '" style="width:' + pct + '%"></div></div>' +
      '<div class="rot"><span>Reservado por outras lojas</span><b>' + fmt(it.reservado - minha) + '</b></div>';

    var caixa = document.createElement('div');
    var pedir = document.createElement('div');
    pedir.className = 'pedir';
    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '1'; inp.max = String(teto);
    inp.value = minha ? minha : '';
    inp.placeholder = '0';
    inp.className = minha > 0 ? 'tem' : '';
    inp.disabled = (teto <= 0);
    inp.setAttribute('aria-label','Quantidade de ' + it.descricao);
    inp.onfocus = function(){ editando = it.codigo; };
    inp.onblur = function(){ editando = null; };
    inp.oninput = function(){
      var v = parseInt(inp.value || '0', 10);
      if(isNaN(v) || v < 0) v = 0;
      if(v > teto){ v = teto; inp.value = v; }
      inp.className = v > 0 ? 'tem' : '';
      agendar(it.codigo, v);
    };
    var max = document.createElement('span');
    max.className = 'max';
    max.textContent = teto <= 0 ? 'sem saldo' : 'máx ' + fmt(teto);
    pedir.appendChild(inp); pedir.appendChild(max);
    caixa.appendChild(pedir);
    if(avisos[it.codigo]){
      var av = document.createElement('div');
      av.className = 'ajuste';
      av.textContent = avisos[it.codigo];
      caixa.appendChild(av);
    }

    linha.appendChild(info); linha.appendChild(med); linha.appendChild(caixa);
    lista.appendChild(linha);
  });

  resumo();
}

function meus(){
  return estado.filter(function(i){ return minhaQtd(i) > 0; });
}

function resumo(){
  var lista = meus();
  var total = 0;
  lista.forEach(function(i){ total += minhaQtd(i); });
  document.getElementById('cItens').textContent = lista.length;
  document.getElementById('cQtd').textContent = fmt(total);

  var area = document.getElementById('areaPedido');
  var meta = document.getElementById('metaPedido');
  if(!lista.length){
    area.innerHTML = '<p class="aviso">Nenhum item selecionado até agora.</p>';
    meta.textContent = '';
    return;
  }
  meta.textContent = minhaLoja + ' · ' + lista.length + ' itens · ' + fmt(total) + ' un';
  var corpo = '';
  lista.forEach(function(i, n){
    corpo += '<tr><td class="num">' + (n+1) + '</td><td class="cod">' + i.codigo + '</td><td>' +
      i.descricao + '</td><td class="undf">' + i.undf + '</td><td class="num">' + fmt(minhaQtd(i)) + '</td></tr>';
  });
  area.innerHTML = '<table><thead><tr><th style="width:32px">#</th><th style="width:72px">Código</th>' +
    '<th>Descrição</th><th style="width:46px">Undf</th><th style="width:88px;text-align:right">Quantidade</th>' +
    '</tr></thead><tbody>' + corpo + '</tbody><tfoot><tr><td colspan="4" style="text-align:right">Total</td>' +
    '<td class="num">' + fmt(total) + '</td></tr></tfoot></table>';
}

function entrar(loja){
  if(!chaveAcesso){
    chaveAcesso = window.prompt('Chave de acesso do almoxarifado (peça ao seu gerente):') || '';
    if(!chaveAcesso) return;
    sessionStorage.setItem('emb_chave', chaveAcesso);
  }
  minhaLoja = loja;
  document.getElementById('nomeLoja').textContent = loja;
  document.getElementById('porta').className = 'porta oculto';
  document.getElementById('app').className = '';
  document.getElementById('carrinho').className = 'carrinho';
  carregar();
}

var grade = document.getElementById('grade');
LOJAS.forEach(function(l){
  var b = document.createElement('button');
  b.textContent = l;
  b.onclick = function(){ entrar(l); };
  grade.appendChild(b);
});
document.getElementById('btnTrocar').onclick = function(){
  document.getElementById('app').className = 'oculto';
  document.getElementById('carrinho').className = 'carrinho oculto';
  document.getElementById('porta').className = 'porta';
};
document.getElementById('busca').addEventListener('input', desenhar);
document.getElementById('btnEsgotados').onclick = function(e){
  ocultar = !ocultar;
  e.target.textContent = ocultar ? 'Mostrar todos' : 'Ocultar esgotados';
  e.target.className = 'btn' + (ocultar ? ' forte' : '');
  desenhar();
};
document.getElementById('btnAtualizar').onclick = function(){ carregar(); };
document.getElementById('btnImprimir').onclick = function(){ window.print(); };
document.getElementById('btnCSV').onclick = function(){
  var lista = meus();
  if(!lista.length){ alert('Nenhum item selecionado.'); return; }
  var linhas = [['Loja','Codigo','Descricao','Undf','Quantidade']];
  lista.forEach(function(i){ linhas.push([minhaLoja, i.codigo, i.descricao, i.undf, minhaQtd(i)]); });
  var csv = '﻿' + linhas.map(function(r){
    return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(';');
  }).join('\r\n');
  var url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  var a = document.createElement('a');
  a.href = url;
  a.download = 'pedido_' + minhaLoja.toLowerCase().replace(/\s+/g,'_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
};

setInterval(function(){ if(minhaLoja && !editando) carregar(); }, 6000);
</script>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");

  try {
    if (acao === "estado") {
      const dados = await rpc("emb_estado", {});
      return new Response(JSON.stringify(dados), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (acao === "reservar" && req.method === "POST") {
      if (!ACCESS_KEY || req.headers.get("x-emb-key") !== ACCESS_KEY) {
        return new Response(JSON.stringify({ erro: "Não autorizado" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const corpo = await req.json();
      const loja = String(corpo.loja ?? "").trim().slice(0, 40);
      const codigo = String(corpo.codigo ?? "").trim();
      const qtd = Math.max(0, parseInt(String(corpo.quantidade ?? "0"), 10) || 0);
      if (!loja || !codigo) {
        return new Response(JSON.stringify({ erro: "Dados incompletos" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const r = await rpc("emb_reservar", {
        p_loja: loja,
        p_codigo: codigo,
        p_quantidade: qtd,
      });
      return new Response(JSON.stringify(Array.isArray(r) ? r[0] : r), {
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
