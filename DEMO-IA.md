# Demonstração "Teste uma IA no seu negócio"

Seção nova na landing (`#demo-ia`): o visitante informa o site → análise real no servidor com progresso por etapas → confere e corrige os dados → conversa com um agente que usa só esses dados → CTA (“Gostou de ver uma IA funcionando…”) → WhatsApp.
O CRM de demonstração, as 8 conversas/leads, o pipeline e a interface mobile **não foram alterados** (o script do CRM é idêntico ao do repositório).

## Arquivos
| Arquivo | Papel |
|---|---|
| `index.html` | + seção, CSS e JS da demonstração (3 linhas alteradas fora dos blocos novos: botão no menu e botões do hero) |
| `api/analyze.js` | POST `{url}` → stream NDJSON com progresso real e o perfil encontrado |
| `api/demo-chat.js` | agente personalizado (IA só no servidor) |
| `api/lead.js` | valida o pedido de contato e devolve o texto do WhatsApp (**não salva nada**) |
| `api/_lib/net.js` | proteção SSRF + fetcher seguro |
| `api/_lib/crawl.js`, `extract.js`, `robots.js`, `profile.js` | análise, extração, robots.txt, perfil/prompt/guardas |
| `api/_lib/limit.js`, `llm.js`, `http.js` | limites (KV opcional), AI Gateway, utilitários |
| `package.json` | `type: module` + `npm test` (sem dependências) |
| `tests/*.test.js` | 54 testes (backend + interface) |
| `api/agent.js` | **inalterado** (continua alimentando o CRM) |

## Segurança (como foi feito)
- URL: só http/https, sem credenciais, porta padrão, sem `localhost`/`.local`/`.internal`/metadados; IP em formas disfarçadas (decimal, hex, octal, `[::ffff:…]`) é normalizado e checado.
- DNS: **todos** os IPs resolvidos são validados e a conexão usa exatamente o IP validado (sem segunda resolução → sem DNS rebinding). Cada redirecionamento é revalidado (máx. 4).
- Limites: 8 s por página, 1 MB por página, 4 páginas por análise, orçamento total de ~36 s; só `text/html`; sem JavaScript, sem cookies, `Accept-Encoding: identity`.
- Respeita `robots.txt` (identifica-se como `RodrigoDevDemoBot`). Sites que bloqueiam (401/403/429) recebem mensagem clara e saída manual.
- Conteúdo do site e mensagens do visitante são **dados**: ficam fora do prompt de sistema, entre marcadores neutralizados, e a saída da IA é filtrada (preço que não está nos dados vira “não encontrei”; vazamento do prompt é barrado).
- Refinamento por IA (opcional) só estrutura texto: cada item precisa aparecer **no texto real** do site, senão é descartado.
- Front-end usa `textContent`/`value` para conteúdo externo (sem `innerHTML`).
- Chave de IA só no servidor; nenhum segredo no navegador ou no repositório.

## O que precisa ser configurado
1. Confirmar na Vercel que `AI_GATEWAY_API_KEY` existe (já usada por `api/agent.js`).
2. **Recomendado:** ligar um Upstash Redis/Vercel KV (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). Sem isso os limites funcionam só **por instância** (serverless), o que reduz abuso mas não é garantia.
3. Conferir se o plano da Vercel permite `maxDuration: 40` nas funções `analyze`/`demo-chat`.

## Limitações
- Nada foi publicado/testado na Vercel; streaming em função Node da Vercel foi assumido, não verificado.
- Sites que montam o conteúdo com JavaScript (SPA) ou protegidos por WAF/anti-bot podem retornar pouco ou nada: o usuário completa manualmente.
- A extração é heurística (palavras-chave, JSON-LD, padrões); o usuário sempre revisa antes do agente usar.
- Leads **não são salvos** nem enviados a CRM: o botão abre o WhatsApp com a mensagem pronta. Para persistir leads é preciso banco/CRM.
- Sem IA configurada, o agente responde só perguntas simples (serviços, contatos, horários) com os dados confirmados e **rotula** a resposta como “SEM IA”.
- O texto das perguntas do visitante vai ao provedor de IA via AI Gateway; inclua isso na política de privacidade.
- Não houve teste visual em celular real (apenas jsdom + CSS responsivo).
