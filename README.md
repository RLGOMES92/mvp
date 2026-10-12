# AI Sales Agent — Rodrigo Dev

Demonstração comercial de um CRM com agente de IA (leads, pipeline, follow-ups, conversas).

## Estado atual (verdade sobre o que existe)
| Item | Estado |
|---|---|
| Leads (criar/editar/excluir/buscar/filtrar), duplicidade, validação | ✅ Funciona (dados no `localStorage` do navegador) |
| Pipeline, follow-ups (adiar/concluir/cancelar), dashboard calculado | ✅ Funciona (mesmo armazenamento) |
| IA real (`/api/agent`) | ⚠️ Só funciona na **Vercel** com `AI_GATEWAY_API_KEY`. No GitHub Pages cai no agente local (regras) |
| Login, multiempresa, banco, RLS, auditoria | ❌ Não existe (exige backend, ex.: Supabase) |
| WhatsApp oficial, Zoho CRM, pagamento recorrente | ❌ Não existe (apenas preparado/documentado) |

Dados e vendas exibidos são **fictícios**. Os dados do usuário ficam só no navegador dele.

## Deploy da IA real (Vercel)
1. Importe o repositório na Vercel.
2. Configure `AI_GATEWAY_API_KEY` (veja `.env.example`) e, se quiser, `ALLOWED_ORIGINS`.
3. A chave nunca vai para o navegador nem para o repositório.

## Regras do agente
Só responde com a "Base de conhecimento" (aba Config), não inventa preço, encaminha a um especialista quando não souber, não responde a quem pediu para não receber mensagens e, por padrão, **apenas sugere** respostas (envio automático só se autorizado em Config).

## Testes
`npm i jsdom && node tests/run.js` — roda o `index.html` em jsdom e a API com `fetch` simulado. Não substitui teste em celular real.

## Limitações conhecidas
- Rate limit da API é em memória (por instância); em produção use Upstash/Vercel KV.
- Consumo de IA mostra tokens, não custo em R$.
- Resumo de conversa e mensagens de follow-up por IA ainda não implementados (follow-up usa modelo simples).

## Próximos passos
Next.js + Supabase (auth, RLS por empresa, auditoria) → WhatsApp Cloud API (webhook com assinatura) → Zoho → cobrança recorrente.
