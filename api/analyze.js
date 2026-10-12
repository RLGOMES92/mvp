// POST /api/analyze  { url }  → stream NDJSON com o progresso REAL da análise e, no fim, o perfil encontrado.
import { analyzeSite, CrawlError } from "./_lib/crawl.js";
import { safeFetcher } from "./_lib/net.js";
import { hit, clientIp, sameOrigin } from "./_lib/limit.js";
import { body, num, dayKey } from "./_lib/http.js";

export const config = { maxDuration: 40 };
export const deps = { fetcher: safeFetcher };          // substituível apenas em testes
const cache = new Map();                                 // host → { at, payload }; retenção mínima (1 h, sem dados pessoais)

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
  const b = body(req, 2000); if (b.error) return res.status(b.error).json({ error: "Requisição inválida." });
  const url = typeof b.data.url === "string" ? b.data.url : ""; if (!url || url.length > 2048) return res.status(400).json({ error: "Informe o endereço do site." });

  const ip = clientIp(req);
  const per = await hit(`an:ip:${ip}`, num("ANALYZE_PER_HOUR", 6), 3600);
  if (!per.ok) { res.setHeader("Retry-After", String(per.retryAfter)); return res.status(429).json({ error: "Você atingiu o limite de análises por hora. Tente mais tarde ou fale com a Rodrigo Dev.", code: "rate_limited" }); }
  const day = await hit(`an:day:${dayKey()}`, num("DEMO_DAILY_ANALYZE_LIMIT", 300), 86400);
  if (!day.ok) return res.status(503).json({ error: "A demonstração atingiu o limite de uso de hoje. Tente amanhã ou fale com a Rodrigo Dev.", code: "daily_limit" });

  res.statusCode = 200; res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8"); res.setHeader("X-Accel-Buffering", "no");
  const emit = ev => { try { res.write(JSON.stringify(ev) + "\n"); } catch { /* cliente saiu */ } };
  try {
    const out = await analyzeSite(url, { fetcher: deps.fetcher, emit: ev => { if (ev.type === "step" && ev.status === "active") emit(ev); else emit(ev); } });
    const key = out.profile.host;
    cache.set(key, { at: Date.now(), payload: out }); if (cache.size > 100) cache.delete(cache.keys().next().value);
    emit({ type: "done", profile: out.profile, notes: out.notes, partial: out.partial, insufficient: out.insufficient });
  } catch (e) {
    const known = e instanceof CrawlError;
    emit({ type: "error", code: known ? e.code : "internal", message: known ? e.message : "Não foi possível concluir a análise agora. Você pode preencher os dados manualmente.", manual: known ? e.manual : true });
  }
  res.end();
}
