// Chamada ao AI Gateway já usado pelo projeto (mesma variável AI_GATEWAY_API_KEY, mesmo endpoint). Nunca registra conteúdo em log.
export class LlmError extends Error { constructor(code, message) { super(message); this.code = code; } }
export const aiConfigured = () => !!process.env.AI_GATEWAY_API_KEY;
export async function chat({ system, messages, maxTokens = 500, timeoutMs = 15000 }) {
  const token = process.env.AI_GATEWAY_API_KEY; if (!token) throw new LlmError("not_configured", "IA não configurada.");
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ model: process.env.AI_MODEL || "openai/gpt-5-mini", max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }) });
    if (r.status === 429) throw new LlmError("rate_limited", "Limite do provedor de IA.");
    if (!r.ok) throw new LlmError("unavailable", "IA indisponível.");
    const d = await r.json().catch(() => null); const text = d?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new LlmError("bad_response", "Resposta inválida da IA.");
    return { text: text.trim(), tokens: Number(d?.usage?.total_tokens) || 0 };
  } catch (e) { if (e instanceof LlmError) throw e; throw new LlmError(e?.name === "AbortError" ? "timeout" : "unavailable", "Falha ao falar com a IA."); } finally { clearTimeout(t); }
}
