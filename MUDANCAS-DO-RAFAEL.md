# Mudanças feitas pelo Rafael neste repo — registro para quem (ou qual IA) vier depois

> **Para o Daniel e para a IA do Daniel.** O Rafael é colaborador aqui e mexe no código.
> Este arquivo existe para que nenhuma mudança dele chegue sem explicação: o que foi tocado,
> por quê, e o que ficou pendente do lado de vocês. **Regra que o Rafael pediu (10/09/2026):
> toda mudança que sair do lado dele passa a ser anotada aqui, no mesmo commit.**
>
> Ordem: mais recente no topo. `git log --author=rnloliveira1@gmail.com` traz o mesmo em bruto.

---

## O que o Rafael precisa do Cronos (pedido em aberto)

**1. Mandar o CÓDIGO do cliente junto do nome nas cargas.** Hoje a carga sai daqui só com o
nome, e o nome vem **truncado em 40 caracteres**. Do lado do CRM comercial isso obriga a casar
cliente por prefixo de nome, e o prefixo colide: `SENDAS DISTRIBUIDORA S/A - FILIAL ...` são 17
lojas diferentes que viram uma só, `ASSAI ATACADISTA ...` são 35. Com o código (o mesmo do ERP,
que já está no pedido) o casamento passa a ser exato e o problema some na origem.
Não precisa mudar tela nenhuma — basta o campo vir junto no dado da carga.

---

## 2026-08-31 e 2026-09-01 — painel MFV (Mapeamento do Fluxo de Valor)

`7fc604f` `8441e0f` `70acf5d` `771580d` `b7c4072` `a54ce82` `a375515` `da21836` `8182303` `a7b85fe`

Painel novo (Fluxo do Pedido) que mede lead time real por etapa, estoque entre etapas e gargalo,
pedido a pedido. Quatro erros de medição foram achados e corrigidos no caminho — o mais relevante
para vocês: **`PETROLINA` e `Petrolina` são valores distintos no cadastro de rotas**, e sem
normalizar caixa/acento 38% do que o painel chamava de "externa" era interna. Prazo e
classificação passaram a vir do cadastro `rotas`, não mais chumbados no código.

`6c06c12` deixou **7 perguntas de verificação** em `PERGUNTAS-RAFAEL-MFV.md`. Nenhuma pede
implementação — pedem conferência no código e resposta escrita no próprio arquivo.

## 2026-08-20 a 2026-08-22 — auditoria de 5 agentes e 13 correções em produção

`dec55ee` `cee3f76` `6b60e98` `305ac52` (documentação) + as correções:

- `b454701` **carga 100% devolvida pagava integral** e havia **pagamento em duplicidade**.
- `d75aae5` **rota externa (R.E.) pagava R$ 0** — `lancar()` passou a derivar a rota.
- `97eb667` guardas contra perda de dado no loop de promoção de 5s.
- `b23129a` **chave da API do ERP estava literal no repo** (que é público) — virou fail-fast por env.
- `6ebacc3` **guarda de sanidade antes do deploy**: o deploy não tinha verificação nenhuma e já
  derrubou a produção uma vez (`7005a8f`, truncamento do `index.html`).
- `31c6af6` não deslogar no deploy, confirmação antes de apagar mês de OTIF, contraste no tema escuro.
- `0a5e054` `0ca8aa8` `6852705` performance de startup e limpeza.

O relatório inteiro, com `arquivo:linha` e o que é código × o que é banco, está em
`AUDITORIA-SEGURANCA-2026-08-20.md`. **O achado que continua aberto e é do dono decidir:** o app
não tem controle de acesso server-side (sem RLS, sem Supabase Auth, senha em texto puro).
⚠️ Não marcar "Enable RLS" no Supabase antes de migrar a autenticação — derruba o app inteiro,
porque todo request usa a mesma chave `anon` e não existe identidade para a policy avaliar.

`305ac52` é uma **retratação**: uma das conclusões da auditoria (Q7, truncamento) estava errada e
foi corrigida no próprio documento.

## 2026-06-16 e 2026-06-17 — atalho para o Gestor de Tarefas

`0bb7a34` `55b1d78` `c7c3cad` — botão e tile no topo, ligando o Cronos ao Gestor de Tarefas.
Mudança visual, sem efeito em dado.
