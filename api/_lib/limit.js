// Limitador de uso. Com Upstash/Vercel KV configurado (KV_REST_API_URL + KV_REST_API_TOKEN) o limite é GLOBAL entre instâncias.
// Sem KV, cai para memória (por instância: reduz abuso, mas não é garantia forte). Limites são sempre checados no servidor.
const mem = new Map();
function memHit(key, max, windowSec, now = Date.now()) {
  const e = mem.get(key); if (!e || e.reset <= now) { mem.set(key, { n: 1, reset: now + windowSec * 1000 }); if (mem.size > 20000) for (const [k, v] of mem) if (v.reset <= now) mem.delete(k); return { ok: true, n: 1, retryAfter: 0 }; }
  e.n++; return { ok: e.n <= max, n: e.n, retryAfter: Math.ceil((e.reset - now) / 1000) };
}
export const kvConfigured = () => !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
export async function hit(key, max, windowSec) {
  if (kvConfigured()) {
    try {
      const r = await fetch(`${process.env.KV_REST_API_URL}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec), "NX"], ["TTL", key]]) });
      const j = await r.json(); const n = Number(j?.[0]?.result), ttl = Number(j?.[2]?.result);
      if (r.ok && Number.isFinite(n)) return { ok: n <= max, n, retryAfter: ttl > 0 ? ttl : windowSec };
    } catch { /* KV indisponível: cai para memória */ }
  }
  return memHit(key, max, windowSec);
}
export const _resetMem = () => mem.clear();
export function clientIp(req) {
  const h = req.headers || {};
  return String(h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "unknown").split(",")[0].trim().slice(0, 64);
}
/** CORS restrito à origem do app, Vercel e origens extras explicitamente configuradas. */
export function cors(req, res) {
  const o = req.headers?.origin;
  if (!o) return true;
  try {
    const u = new URL(o), host = String(req.headers.host || "");
    const extra = (process.env.DEMO_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const allowed = u.host === host || u.origin === "https://rlgomes92.github.io" || extra.includes(u.origin);
    if (!allowed) return false;
    res.setHeader("Access-Control-Allow-Origin", u.origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  } catch { return false; }
}
/** Compatibilidade com os handlers antigos. */
export function sameOrigin(req) {
  const o = req.headers?.origin; if (!o) return true;
  try {
    const u = new URL(o), host = String(req.headers.host || "");
    const extra = (process.env.DEMO_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    return u.host === host || u.origin === "https://rlgomes92.github.io" || extra.includes(u.origin);
  } catch { return false; }
}
