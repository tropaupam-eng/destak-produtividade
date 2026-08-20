// Guarda de deploy: barra publicação de arquivo truncado ou com erro de sintaxe JS.
// Motivo real: o commit 7005a8f (30/06) publicou um index.html de 11 bytes ("placeholder")
// e derrubou a produção ~5min. Tamanho pega o truncamento; vm.Script pega o erro de sintaxe.
const fs = require('fs'), vm = require('vm');
let falhou = 0;
for (const f of ['index.html', 'gerot.html']) {
  let src;
  try { src = fs.readFileSync(f, 'utf8'); }
  catch (e) { console.error(`${f}: não consegui ler — ${e.message}`); falhou = 1; continue; }
  if (src.length < 100000) { console.error(`${f}: SUSPEITO — só ${src.length} bytes (esperado > 100000)`); falhou = 1; continue; }
  const blocos = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocos.length) { console.error(`${f}: nenhum <script> inline encontrado`); falhou = 1; continue; }
  blocos.forEach((m, i) => {
    try { new vm.Script(m[1]); }
    catch (e) { console.error(`${f} script#${i + 1}: ${e.message}`); falhou = 1; }
  });
  if (!falhou) console.log(`${f}: ok (${src.length} bytes, ${blocos.length} bloco(s) de script)`);
}
process.exit(falhou);
