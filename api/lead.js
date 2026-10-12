// POST /api/lead — VALIDA o pedido de contato e devolve o texto para WhatsApp. NÃO armazena nada e NÃO envia a lugar nenhum:
// o envio só acontece quando o visitante toca em "enviar" no próprio WhatsApp. (Persistência/CRM ainda não existem neste projeto.)
import { hit, clientIp, sameOrigin } from "./_lib/limit.js";
import { body } from "./_lib/http.js";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u200B-\u200F\u202A-\u202E]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Origem não permitida." });
  const b = body(req, 4000); if (b.error) return res.status(b.error).json({ error: "Requisição inválida." });
  const d = b.data;
  if (clean(d.website, 50)) return res.status(200).json({ ok: true, saved: false, ignored: true });          // honeypot: bots preenchem
  const ip = clientIp(req); const r = await hit(`lead:ip:${ip}`, 8, 3600);
  if (!r.ok) return res.status(429).json({ error: "Muitas tentativas. Tente novamente mais tarde." });
  const name = clean(d.name, 80), company = clean(d.company, 80), contact = clean(d.contact, 120), kind = d.kind === "quote" ? "quote" : "hire", host = clean(d.host, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: "Informe seu nome.", field: "name" });
  const digits = contact.replace(/\D/g, ""); const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact), isPhone = !isEmail && digits.length >= 10 && digits.length <= 13;
  if (!isEmail && !isPhone) return res.status(400).json({ error: "Informe um e-mail ou telefone (com DDD) válido.", field: "contact" });
  if (d.consent !== true) return res.status(400).json({ error: "Autorize o retorno comercial para continuar.", field: "consent" });
  const intro = kind === "quote" ? "Olá Rodrigo! Gostaria de solicitar um orçamento." : "Olá Rodrigo! Vi o AI Sales Agent e quero contratar minha IA.";
  const text = [intro, host ? `Testei a demonstração com o site ${host}.` : "", `Nome: ${name}`, company ? `Empresa: ${company}` : "", `Contato: ${contact}`, "Autorizo o retorno comercial."].filter(Boolean).join("\n");
  return res.status(200).json({ ok: true, saved: false, whatsappText: text });
}
