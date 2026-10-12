// Chamada ao AI Gateway. Nunca registra a chave, prompt, mensagens ou dados do cliente.
export class LlmError extends Error { constructor(code, message) { super(message); this.code = code; } }
export const aiConfigured = () => !!process.env.AI_GATEWAY_API_KEY;
export async function chat({ system, messages, maxTokens = 500, timeoutMs = 15000 }) {
  const token = process.env.AI_GATEWAY_API_KEY;
  if (!token) throw new LlmError("not_configured", "IA não configurada.");
  const model = process.env.AI_MODEL || "openai/gpt-5-mini";
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] })
    });
    if (r.status === 401 || r.status === 403) {
      console.error("[demo-chat] AI Gateway authentication rejected", { status: r.status, model });
      throw new LlmError("gateway_auth", "O AI Gateway recusou a chave. Confira AI_GATEWAY_API_KEY no ambiente Production.");
    }
    if (r.status === 404) {
      console.error("[demo-chat] AI Gateway model/route not found", { status: r.status, model });
      throw new LlmError("model_unavailable", "O modelo configurado não foi encontrado. Remova AI_MODEL ou configure um modelo disponível no AI Gateway.");
    }
    if (r.status === 429) throw new LlmError("rate_limited", "Limite do provedor de IA.");
    if (!r.ok) {
      console.error("[demo-chat] AI Gateway HTTP error", { status: r.status, model });
      throw new LlmError("gateway_http_" + r.status, "O AI Gateway retornou HTTP " + r.status + ".");
    }
    const d = await r.json().catch(() => null);
    const text = d?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      console.error("[demo-chat] AI Gateway returned an empty/invalid completion", { model });
      throw new LlmError("bad_response", "Resposta inválida da IA.");
    }
    return { text: text.trim(), tokens: Number(d?.usage?.total_tokens) || 0 };
  } catch (e) {
    if (e instanceof LlmError) throw e;
    throw new LlmError(e?.name === "AbortError" ? "timeout" : "unavailable", e?.name === "AbortError" ? "Tempo limite ao chamar o AI Gateway." : "Falha de conexão com o AI Gateway.");
  } finally { clearTimeout(t); }
}
