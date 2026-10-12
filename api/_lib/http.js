export function body(req, maxChars = 20000) {
  let b = req.body; if (typeof b === "string") { if (b.length > maxChars) return { error: 413 }; try { b = JSON.parse(b || "{}"); } catch { return { error: 400 }; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: 400 };
  try { if (JSON.stringify(b).length > maxChars) return { error: 413 }; } catch { return { error: 400 }; }
  return { data: b };
}
export const num = (name, def) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : def; };
export const dayKey = () => new Date().toISOString().slice(0, 10);
