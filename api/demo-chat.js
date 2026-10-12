// POST /api/demo-chat  { message, history[], profile }  → resposta do agente personalizado (sempre no servidor, chave nunca no navegador).
import { chat, LlmError, aiConfigured } from "./_lib/llm.js";
import { sanitizeProfile, demoSystem, guardDemoReply } from "./_lib/profile.js";
import { hit, clientIp, cors } from "./_lib/limit.js";
import { body, num, dayKey } from "./_lib/http.js";

export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!cors(req, res)) return res.status(403).json({ error: "Origem não permitida." });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  const b = body(req, 16000); if (b.error) return res.status(b.error).json({ error: "Requisição inválida." });
  const message = typeof b.data.message === "string" ? b.data.message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() : "";
  if (!message) return res.status(400).json({ error: "Escreva uma mensagem." });
  if (message.length > 300) return res.status(400).json({ error: "A mensagem pode ter até 300 caracteres." });
  const profile = sanitizeProfile(b.data.profile); if (!profile) return res.status(400).json({ error: "Dados da empresa insuficientes para a demonstração." });
  const history = (Array.isArray(b.data.history) ? b.data.history : []).slice(-8).filter(h => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .map(h => ({ role: h.role, content: h.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 400) })).filter(h => h.content.trim());

  if (!aiConfigured()) return res.status(503).json({ error: "A IA da demonstração ainda não está configurada neste ambiente.", code: "not_configured" });
  const ip = clientIp(req);
  const a = await hit(`ch:ip:${ip}`, num("CHAT_PER_HOUR_IP", 40), 3600);
  const s = await hit(`ch:sess:${ip}:${profile.host || profile.name}`, num("CHAT_PER_SESSION", 25), 3600);
  if (!a.ok || !s.ok) { res.setHeader("Retry-After", String(Math.max(a.retryAfter, s.retryAfter))); return res.status(429).json({ error: "Você atingiu o limite de mensagens da demonstração. Fale com a Rodrigo Dev para continuar.", code: "rate_limited" }); }
  const d = await hit(`ch:day:${dayKey()}`, num("DEMO_DAILY_AI_LIMIT", 600), 86400);
  if (!d.ok) return res.status(503).json({ error: "A demonstração atingiu o limite de uso de hoje. Tente amanhã.", code: "daily_limit" });

  try {
    const r = await chat({ system: demoSystem(profile), messages: [...history, { role: "user", content: message }], maxTokens: num("DEMO_MAX_TOKENS", 500), timeoutMs: 15000 });
    return res.status(200).json({ reply: guardDemoReply(r.text, profile), usage: { total_tokens: r.tokens } });
  } catch (e) {
    const code = e instanceof LlmError ? e.code : "unavailable";
    const map = { rate_limited: [429, "A IA está com muitas solicitações agora. Tente novamente em instantes."], timeout: [504, "A IA demorou para responder. Tente novamente."], bad_response: [502, "A IA devolveu uma resposta inválida. Tente novamente."], not_configured: [503, "IA não configurada."] };
    const [st, msg] = map[code] || [502, "A IA está indisponível agora. Tente novamente em instantes."];
    return res.status(st).json({ error: msg, code });
  }
}
