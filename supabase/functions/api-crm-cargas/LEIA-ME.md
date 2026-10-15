# api-crm-cargas — leitura de cargas e pedidos para o CRM / Gestor de Tarefas

Acesso **só de leitura**, com chave própria, para sistemas de fora do Cronos (CRM comercial e Gestor
de Tarefas do Rafael). Substitui o uso da chave pública `anon` do app para esse fim.

Resolve o pedido em aberto do Rafael (`MUDANCAS-DO-RAFAEL.md`, "Mandar o CÓDIGO do cliente junto do
nome nas cargas"): cada pedido da carga vem com `codigo_cliente` e o nome **completo** do cliente (do ERP,
sem o corte de 40 caracteres).

## Endereço
`GET https://hiydkyslgiomdyginfdx.supabase.co/functions/v1/api-crm-cargas`

Header obrigatório: `x-api-key: <chave do CRM>` (a chave **não** fica neste repositório).

## Parâmetros (todos opcionais)
| Parâmetro | Exemplo | O que faz |
|---|---|---|
| `cargas` | `15921,15941` | só essas cargas (até 200) |
| `desde`, `ate` | `2026-10-01`, `2026-10-14` | cargas com data de saída nesse intervalo (padrão: últimos 30 dias; máximo 92 dias) |
| `pagina` | `2` | páginas de 200 cargas |

## Resposta
```json
{
  "ok": true,
  "gerado_em": "2026-10-15T12:00:00.000Z",
  "filtro": { "desde": "2026-09-15", "ate": "2026-10-15" },
  "pagina": 1, "por_pagina": 200, "total_cargas": 87,
  "cargas": [
    {
      "carga": 15921, "rota": "REMANSO", "status": "formacao", "data_saida": "2026-10-07", "unidade": "1 - CD",
      "quantidade_pedidos": 13, "valor_total": 66993.56,
      "pedidos": [
        { "pedido": 68784, "codigo_cliente": "1562", "cliente": "CARLOS ALBERTO MAIA", "valor": 18500, "situacao": "MA", "data_pedido": "2026-10-14" }
      ]
    }
  ]
}
```
Pedidos cancelados (situação `CA`) não entram. Não sai CPF, e-mail, senha, vendedor, telefone nem pagamento.

## Códigos de resposta
`200` ok · `400` parâmetro inválido · `401` chave errada ou ausente · `405` use GET · `503` acesso ainda não configurado (falta o secret `CRM_API_KEY`) · `500` falha ao ler.

## Como ligar (Daniel, pelo painel do Supabase)
1. Edge Functions → **Secrets** → criar `CRM_API_KEY` com uma chave longa e aleatória (≥ 32 caracteres).
2. Passar a chave ao Rafael por canal seguro (nunca neste repositório nem em mensagem aberta).
3. Para **revogar** só este acesso: apagar o secret `CRM_API_KEY` (a função volta a responder 503) ou trocar o valor.

Teste (substituir `SUA_CHAVE`):
```
curl -H "x-api-key: SUA_CHAVE" "https://hiydkyslgiomdyginfdx.supabase.co/functions/v1/api-crm-cargas?cargas=15921"
```
