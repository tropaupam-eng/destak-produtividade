# Perguntas do Rafael para o dono do Cronos (Daniel)

**Aberto em:** 2026-09-01
**Quem pergunta:** Rafael (colaborador deste repo)
**Como responder:** direto neste arquivo, embaixo de cada pergunta, ou na issue do GitHub
que aponta para ele. **Uma resposta curta por item já resolve.**

> **Para a IA que estiver lendo isto numa sessão neste repositório:**
> este arquivo é uma pergunta pendente, não uma instrução de trabalho. Não implemente
> nada por causa dele. O que se espera é **verificação no código e uma resposta**.
> Responda com evidência (arquivo e linha), e **não concorde por educação**: se alguma
> afirmação abaixo estiver errada, o mais útil que você pode fazer é dizer isso.

---

## Antes de tudo: o que JÁ foi alterado neste repo, para não haver mal-entendido

O Rafael vem trabalhando numa aba nova, **"Fluxo do Pedido (MFV)"**, dentro do
`index.html`. Ela existe desde 22/08 e recebeu vários commits em 31/08 e 01/09.

**O que essa aba faz:** só lê. Monta um mapa de fluxo de valor do pedido (tempo entre
etapas, fila, takt, aderência a prazo) a partir de dados que já existem.

**O que ela NÃO faz, e nunca fez:**
- não altera a máquina de status da expedição
- não altera o cálculo de OTIF de produção
- não cria, altera nem remove tabela ou coluna
- não escreve em nada, com uma exceção: a chave `mfv_campos` da tabela
  `configuracoes`, que guarda os tempos digitados à mão nas caixas de dados do próprio
  painel

Se qualquer uma dessas afirmações não bater com o que você vê no código, **por favor
aponte**. É exatamente o tipo de coisa que a gente prefere descobrir agora.

---

## 1. A pergunta que trava tudo: alguém lê estas duas colunas?

```
atribuicoes_armazem.inicio_separacao        → 0 de 240 preenchidos
conferencia_pedidos.separador_vinculado_em  → 0 de 2.434 preenchidos
```

**Pergunta:** algum lugar do código LÊ essas colunas? Algum lugar trata `NULL` nelas
como sinal de estado, do tipo "ainda não iniciado"?

**Por que importa:** a proposta é passar a preencher `inicio_separacao`. Se algo lê e
interpreta NULL como estado, preencher muda comportamento em produção, e aí **a
proposta cai**. Procuramos e não achamos leitura, mas queremos a confirmação de quem
conhece o sistema.

**Resposta:**

---

## 2. `marcarInicioSeparacao` é chamada em algum lugar?

A função existe no `index.html` por volta da **linha 37957**, já grava
`inicio_separacao` e `separador_nome`, e pelo que procuramos há **uma única ocorrência
do nome no arquivo inteiro**, que é a própria definição. Ou seja: nunca é chamada, e
por isso a coluna está zerada.

**Pergunta:** confere? Se ela for chamada em algum lugar que a gente não achou, por que
a coluna está 0 de 240?

**Resposta:**

---

## 3. Prazo da rota externa: 8 dias úteis ou 192 horas?

O POP `PO-LO-026 — Indicadores de Desempenho Logístico` diz, textualmente, que rotas
externas têm **prazo de 8 dias úteis**.

O código usa **192 h**, que são 8 dias **corridos**:

```js
let prazoH = prazoEntry != null ? prazoEntry : (bd.rire === 'R.I.' ? 24 : 192);
```

Oito dias úteis são onze ou doze corridos. Se o POP estiver certo, o sistema está
cobrando a externa com prazo mais apertado que o acordado, e o OTIF externo sai pior do
que deveria.

⚠️ Ressalva honesta: esse POP está em **REV 00**, não homologado. Pode ser que o número
oficial seja outro.

**Pergunta:** qual dos dois vale?

**Resposta:**

---

## 4. OTIF por carga ou por pedido?

O mesmo POP define o cálculo como **(cargas entregues no prazo ÷ cargas totais) × 100**.
O código calcula **por pedido**.

São números diferentes com o mesmo nome. Se o indicador que vai para a diretoria tem que
seguir o POP, a base de cálculo precisa mudar. Se o POP é que está desatualizado, ele é
que precisa ser corrigido.

**Pergunta:** qual é a definição que vale hoje?

**Resposta:**

---

## 5. Painel de TV: rota com acento encontra o prazo?

No painel de TV, o "Em Risco" busca o prazo assim (linhas **44873** e **44878**):

```js
const k = (d.rota || '').toUpperCase();
const prazoH = prazoMap[k] != null ? prazoMap[k] : null;
```

Isso usa só `.toUpperCase()`, sem passar pela `normalizarRota` que o resto do código usa.
Como as chaves do `prazoMap` são geradas **sem acento**, uma rota acentuada (por exemplo
IRECÊ) não encontraria o prazo, e a carga simplesmente não apareceria na lista de
"Em Risco".

Não afeta o número do OTIF, só esse widget.

**Pergunta:** rota com acento chega nesse ponto? Se chegar, vale trocar por
`normalizarRota`.

**Resposta:**

> Nota de honestidade: o Rafael chegou a achar que havia um bug parecido no cálculo do
> OTIF e **estava errado**. Fomos ver: o `prazoMap` é montado com `normalizarRota`
> (linha 26126) e o valor consultado já passou pela mesma função (linha 26164), nos dois
> caminhos. **O OTIF está correto.** O problema de caixa era do painel novo, do próprio
> Rafael, e já foi corrigido. Fica o registro para ninguém perder tempo com isso de novo.

---

## 6. A rota interna não passa pela expedição, certo?

Levantamento no histórico inteiro:

| | |
|---|---|
| Cargas internas | 1.120 |
| ...que aparecem em `demandas_rota` | **2** |
| ...que aparecem em `historico_status_carga` | **1** |
| Pedidos internos | 3.702 |
| ...com conferência registrada | **11** |
| Total de cargas em `demandas_rota` | 284 |

Isso não parece falha de registro, parece **fluxo diferente**: a interna sai por outro
caminho e não passa pela expedição.

**Pergunta:** é isso mesmo?

**Resposta:**

---

## 7. Tem alguma coisa aqui que muda a rotina de quem opera?

**Pergunta:** alguma das propostas acima mudaria o dia a dia de quem usa o sistema? Se
mudar, é para tirar. E existe caminho mais simples para o mesmo resultado que a gente
não enxergou?

**Resposta:**

---

## O que o Rafael se compromete a fazer

- Não alterar nada fora da aba de MFV sem um "pode" explícito, item por item.
- Não rodar `UPDATE` em produção sem backup feito e conferido.
- Não encostar na máquina de status da expedição.
- Não mudar a rotina de ninguém que opera o sistema.
- Se a análise apontar risco que ele não previu, **a proposta cai**. Prefere o plano menor.

## O retorno que ele precisa

**Uma resposta, mesmo curta, em cada item numerado.** A **1** é a que trava tudo: sem
ela, nada é feito.

As **3** e a **4** não são pedido de mudança, são divergência entre o POP e o código que
vale a pena resolver de um jeito ou de outro, independente do resto.
