// Extração de informações públicas. Nada do site é executado: HTML é tratado como TEXTO não confiável.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", Ccedil: "Ç", Aacute: "Á", Eacute: "É", ndash: "–", mdash: "—", hellip: "…", middot: "·", copy: "©" };
export const decode = s => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ""; }
  return ENT[e] ?? ENT[e.toLowerCase()] ?? m;
});
const ws = s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "").replace(/\s+/g, " ").trim();

export function htmlToText(html, max = 60000) {
  let h = String(html).slice(0, 1_200_000)
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe|object|embed|canvas|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/dd|\/dt|\/summary|\/details|\/header|\/footer|\/ul|\/ol)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  return decode(h).split("\n").map(ws).filter(Boolean).join("\n").slice(0, max);
}
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag); return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : ""; };
const tagsOf = (html, re) => [...html.matchAll(re)];

export function metaOf(html) {
  const head = html.slice(0, 200000); const out = {};
  out.title = ws(decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1] || ""));
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const k = (attr(m[0], "name") || attr(m[0], "property")).toLowerCase(), v = ws(attr(m[0], "content"));
    if (k && v && !(k in out)) out[k] = v;
  }
  return out;
}
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim().slice(0, 200000)); const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { out.push(n); if (n["@graph"]) walk(n["@graph"]); } }; walk(j); } catch { /* JSON-LD inválido: ignora */ }
  }
  return out;
}
const typesOf = n => [].concat(n["@type"] || []).map(String);
const SEG_SCHEMA = { Dentist: "Odontologia", MedicalClinic: "Saúde / clínica", Physician: "Saúde / medicina", Hospital: "Saúde", Pharmacy: "Farmácia", Restaurant: "Gastronomia", CafeOrCoffeeShop: "Cafeteria", Bakery: "Padaria", LegalService: "Advocacia / serviços jurídicos", Attorney: "Advocacia", RealEstateAgent: "Imobiliária", AccountingService: "Contabilidade", HealthClub: "Academia / fitness", GymOrHealthClub: "Academia / fitness", BeautySalon: "Beleza e estética", HairSalon: "Salão de beleza", DaySpa: "Estética / spa", AutoRepair: "Oficina mecânica", AutomotiveBusiness: "Automotivo", PetStore: "Pet shop", VeterinaryCare: "Veterinária", School: "Educação", EducationalOrganization: "Educação", Store: "Comércio / loja", HomeAndConstructionBusiness: "Construção e reformas", TravelAgency: "Turismo", FinancialService: "Serviços financeiros", ProfessionalService: "Serviços profissionais", SoftwareApplication: "Tecnologia / software" };
const SEG_WORDS = [["Odontologia", /odont|dentist|ortodont|implante dent/gi], ["Saúde / clínica", /cl[ií]nica|consult[oó]rio|m[eé]dic|exames?\b|fisioterap|psicolog/gi], ["Advocacia / serviços jurídicos", /advog|jur[ií]dic|escrit[oó]rio de advocacia|direito (civil|trabalhista|penal)/gi], ["Imobiliária", /imobili[aá]ri|im[oó]veis|corretor de im|aluguel|loca[cç][aã]o de im/gi], ["Gastronomia", /restaurante|card[aá]pio|delivery|pizzaria|hamburgueria|culin[aá]ri/gi], ["Academia / fitness", /academia|muscula[cç][aã]o|personal trainer|treino|crossfit|pilates/gi], ["Educação", /escola|curso|aulas|matr[ií]cula|col[eé]gio|faculdade|ensino/gi], ["Contabilidade", /cont[aá]bil|contabilidade|imposto de renda|abertura de empresa/gi], ["Beleza e estética", /est[eé]tica|sal[aã]o|cabelo|manicure|depila[cç][aã]o|barbearia|beleza/gi], ["Pet shop / veterinária", /pet shop|veterin[aá]ri|banho e tosa|animais/gi], ["Automotivo", /oficina|mec[aâ]nica|auto ?pe[cç]as|funilaria|concession[aá]ri/gi], ["Comércio / loja virtual", /loja virtual|e-commerce|carrinho|comprar|frete gr[aá]tis|ofertas/gi], ["Construção e reformas", /constru[cç][aã]o|reforma|engenharia|arquitetura|projetos? residencia/gi], ["Tecnologia / software", /software|sistemas?\b|aplicativo|desenvolvimento web|ti\b|automa[cç][aã]o/gi], ["Turismo", /turismo|viagens?|pacotes|hospedagem|pousada|hotel/gi]];
export function guessSegment(ld, text) {
  for (const n of ld) for (const t of typesOf(n)) if (SEG_SCHEMA[t]) return { segment: SEG_SCHEMA[t], via: "dados estruturados do site" };
  const sample = text.slice(0, 20000); let best = null;
  for (const [name, re] of SEG_WORDS) { const n = (sample.match(re) || []).length; if (n >= 3 && (!best || n > best.n)) best = { name, n }; }
  return best ? { segment: best.name, via: "palavras-chave do conteúdo" } : { segment: null, via: null };
}

const GENERIC = /^(home|início|inicio|menu|contato|contatos|fale conosco|saiba mais|leia mais|ver mais|entrar|login|cadastre-se|blog|carrinho|buscar|pesquisar|whatsapp|clique aqui|voltar|próximo|anterior|política de privacidade|termos de uso|sobre( nós)?|quem somos|serviços|produtos|equipe|galeria|depoimentos|newsletter|siga-nos|redes sociais|todos os direitos reservados)$/i;
const cleanItem = s => ws(s).replace(/^[\-–•·*▪►›»✓✔]+\s*/, "").replace(/[.:;]+$/, "");
const NOISE = /^(navigation menu|toggle navigation|skip to content|pular para o conte[uú]do|alternar navega[cç][aã]o|logotipos?\b.*|logos?\b.*|menu( principal)?|abrir menu|fechar menu)$/i;
const okItem = s => s.length >= 3 && s.length <= 80 && !GENERIC.test(s) && !NOISE.test(s) && !/^https?:|@|\d{4,}|©|copyright/i.test(s) && s.split(" ").length <= 10;

export function emailsOf(html, text) {
  const set = new Set();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) set.add(decode(m[1]).toLowerCase());
  for (const m of text.matchAll(/[a-z0-9._%+-]{2,}@[a-z0-9.-]+\.[a-z]{2,}/gi)) set.add(m[0].toLowerCase());
  return [...set].filter(e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) && !/(example|sentry|wixpress|domain\.com|seudominio|email\.com$|@2x)/.test(e)).slice(0, 3);
}
export function phonesOf(html, text) {
  const set = new Map(); const add = raw => { const d = raw.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); if (d.length === 10 || d.length === 11) { if (/^(\d)\1+$/.test(d)) return; set.set(d, raw.trim()); } };
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) add(decode(m[1]));
  for (const m of text.matchAll(/(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g)) add(m[0]);
  return [...set.entries()].slice(0, 3).map(([d, raw]) => fmtPhone(d, raw));
}
const fmtPhone = (d, raw) => d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : raw;
export function whatsappOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?[^"']*phone=|whatsapp:\/\/send\?[^"']*phone=)\+?(\d{10,13})/gi)) out.add(m[1]);
  return [...out].slice(0, 2).map(d => { const n = d.replace(/^55(?=\d{10,11}$)/, ""); return fmtPhone(n, d); });
}
export function hoursOf(text, ld) {
  const out = [];
  for (const n of ld) {
    for (const h of [].concat(n.openingHours || [])) if (typeof h === "string") out.push(ws(h).slice(0, 120));
    for (const s of [].concat(n.openingHoursSpecification || [])) if (s && s.opens && s.closes) out.push(`${[].concat(s.dayOfWeek || []).map(d => String(d).split("/").pop()).join(", ")} ${s.opens}–${s.closes}`.slice(0, 120));
  }
  const day = /(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|\bseg\b|\bsex\b|\bs[aá]b\b|\bdom\b|todos os dias|24 ?h)/i, time = /(\d{1,2}\s?h(\d{2})?|\d{1,2}:\d{2}|das? \d)/i;
  for (const line of text.split("\n")) if (line.length < 140 && day.test(line) && time.test(line)) out.push(line);
  return [...new Set(out.map(ws))].slice(0, 4);
}
export function addressOf(ld, text) {
  for (const n of ld) { const a = n.address; if (a && typeof a === "object") { const s = [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(", "); if (s) return ws(s).slice(0, 160); } }
  const m = /((?:Rua|R\.|Av\.?|Avenida|Alameda|Travessa|Rodovia|Pra[cç]a)\s[^\n]{5,110}?(?:,\s?\d+|\bn[ºo°]\s?\d+)[^\n]{0,60})/i.exec(text);
  return m ? ws(m[1]).slice(0, 160) : null;
}
export function faqsOf(html, ld) {
  const out = [];
  for (const n of ld) if (typesOf(n).includes("FAQPage")) for (const q of [].concat(n.mainEntity || [])) { const a = q?.acceptedAnswer?.text; if (q?.name && a) out.push({ q: ws(decode(String(q.name))).slice(0, 160), a: htmlToText(String(a), 400).replace(/\n/g, " ") }); }
  for (const m of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) { const q = htmlToText(m[1], 200).replace(/\n/g, " "), a = htmlToText(m[2], 400).replace(/\n/g, " "); if (q && a && q.length > 8) out.push({ q, a }); }
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) { const q = htmlToText(m[1], 200).replace(/\n/g, " "), a = htmlToText(m[2], 400).replace(/\n/g, " "); if (q.endsWith("?") && a) out.push({ q, a }); }
  for (const m of html.matchAll(/<h[2-4]\b[^>]*>([^<]*\?)\s*<\/h[2-4]>\s*<(p|div)\b[^>]*>([\s\S]*?)<\/\2>/gi)) { const q = ws(decode(m[1])), a = htmlToText(m[3], 400).replace(/\n/g, " "); if (q.length > 8 && a) out.push({ q, a }); }
  const seen = new Set(); return out.filter(f => f.q && f.a && !seen.has(f.q.toLowerCase()) && seen.add(f.q.toLowerCase())).slice(0, 6).map(f => ({ q: f.q.slice(0, 160), a: f.a.slice(0, 320) }));
}
export function headingsOf(html) {
  return tagsOf(html, /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi).map(m => ({ level: +m[1], text: cleanItem(htmlToText(m[2], 200).replace(/\n/g, " ")) })).filter(h => h.text).slice(0, 60);
}
export function listItemsOf(html) {
  return tagsOf(html.replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, " "), /<li\b[^>]*>([\s\S]*?)<\/li>/gi).map(m => cleanItem(htmlToText(m[1], 200).replace(/\n/g, " "))).filter(okItem).slice(0, 40);
}
const PAGE_KEYS = [["servi", 5], ["produto", 5], ["solu", 4], ["especialidade", 4], ["tratamento", 4], ["atua", 3], ["sobre", 4], ["empresa", 3], ["quem-somos", 4], ["quem_somos", 4], ["institucional", 3], ["contato", 4], ["fale", 2], ["faq", 5], ["perguntas", 5], ["duvidas", 4], ["dúvidas", 4], ["orcamento", 3], ["orçamento", 3], ["horario", 3], ["localiza", 2], ["unidade", 2], ["cardapio", 3], ["planos", 2]];
const BAD_PATH = /(login|signin|entrar|cart|carrinho|checkout|wp-admin|wp-login|admin|conta|minha-conta|account|privacy|privacidade|termos|politica|cookies|\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|mp4|mp3|docx?|xlsx?|pptx?)$|\/tag\/|\/category\/|\/page\/\d|feed|\/blog\/.+)/i;
export function relevantLinks(html, baseUrl, max = 3) {
  const base = new URL(baseUrl), seen = new Map();
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[0], "href"); if (!href || /^(#|mailto:|tel:|javascript:|data:|whatsapp:)/i.test(href)) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) continue;
    const sameSite = u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, ""); if (!sameSite) continue;
    u.hash = ""; const path = decodeURIComponent(u.pathname).toLowerCase(); if (path === "/" || path === base.pathname.toLowerCase() || BAD_PATH.test(path + u.search)) continue;
    const label = cleanItem(htmlToText(m[1], 120).replace(/\n/g, " ")).toLowerCase(); let score = 0;
    for (const [k, w] of PAGE_KEYS) { if (path.includes(k)) score += w; if (label.includes(k)) score += 1; }
    if (score > 0) { const key = u.origin + u.pathname; const prev = seen.get(key); if (!prev || prev.score < score) seen.set(key, { url: u.href, label: label.slice(0, 60) || path, score, kind: PAGE_KEYS.find(([k]) => path.includes(k))?.[0] ?? "" }); }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, max);
}
export function nameOf(meta, ld, host) {
  for (const n of ld) if (n.name && typesOf(n).some(t => /Organization|LocalBusiness|Business|Store|Clinic|Dentist|Restaurant|Service|Corporation|School/i.test(t))) return ws(String(n.name)).slice(0, 80);
  if (meta["og:site_name"]) return meta["og:site_name"].slice(0, 80);
  const parts = (meta.title || "").split(/\s[|\-–—·•:]\s|\s?[|·•]\s?/).map(ws).filter(p => p.length >= 2 && !/^(home|início|inicio|página inicial|bem[- ]vindo)/i.test(p));
  if (parts.length) return parts.sort((a, b) => a.length - b.length)[0].slice(0, 80);
  const label = host.replace(/^www\./, "").split(".")[0]; return label ? label[0].toUpperCase() + label.slice(1) : null;
}
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
/** Item só vale se a FRASE (ou quase toda ela, com ao menos duas palavras seguidas) aparece no texto real do site.
 *  Sobreposição solta de palavras não basta: texto malicioso do próprio site poderia "validar" um serviço inventado. */
export function grounded(item, sourceText) {
  const n = norm(item).replace(/\s+/g, " ").trim(); if (!n) return false;
  const src = " " + norm(sourceText).replace(/\s+/g, " ") + " ";
  if (src.includes(" " + n + " ") || src.includes(n)) return true;
  const toks = n.split(" "), long = toks.filter(t => t.length >= 4); if (!long.length || long.length === toks.filter(Boolean).length && toks.length < 2) return false;
  if (long.filter(t => src.includes(t)).length / long.length < 0.8) return false;
  for (let i = 0; i < toks.length - 1; i++) if (toks[i].length >= 3 && toks[i + 1].length >= 3 && src.includes(toks[i] + " " + toks[i + 1])) return true;
  return false;
}

/** pages: [{url, html}] — a primeira é a página inicial. */
export function buildProfile(pages, host) {
  const home = pages[0], texts = pages.map(p => htmlToText(p.html)), all = texts.join("\n");
  const meta = metaOf(home.html), ld = pages.flatMap(p => jsonLd(p.html));
  const seg = guessSegment(ld, all);
  const services = new Set();
  for (const n of ld) for (const o of [].concat(n.makesOffer || [], n.hasOfferCatalog?.itemListElement || [])) { const nm = o?.itemOffered?.name || o?.name; if (nm && okItem(cleanItem(String(nm)))) services.add(cleanItem(String(nm))); }
  pages.forEach((p, i) => {
    const isSvc = /servi|produto|solu|especialidade|tratamento|atua|cardapio|planos/i.test(new URL(p.url).pathname);
    const hs = headingsOf(p.html);
    if (isSvc) { hs.filter(h => h.level >= 2 && okItem(h.text)).forEach(h => services.add(h.text)); listItemsOf(p.html).slice(0, 12).forEach(x => services.add(x)); }
    else { let on = false; for (const h of hs) { if (/servi[cç]os|produtos|solu[cç][oõ]es|especialidades|tratamentos|o que fazemos|[aá]reas de atua|nossos planos/i.test(h.text)) { on = true; continue; } if (on && h.level >= 2 && okItem(h.text) && !/\?$/.test(h.text)) services.add(h.text); if (on && h.level === 1) on = false; } }
  });
  const services_ = [...services].slice(0, 8);
  const contacts = { phones: phonesOf(pages.map(p => p.html).join("\n"), all), whatsapp: whatsappOf(pages.map(p => p.html).join("\n")), emails: emailsOf(pages.map(p => p.html).join("\n"), all), address: addressOf(ld, all) };
  const hours = hoursOf(all, ld), faqs = pages.flatMap(p => faqsOf(p.html, jsonLd(p.html))).slice(0, 6);
  const description = (meta.description || meta["og:description"] || (ld.find(n => n.description)?.description) || "").toString();
  const profile = {
    url: home.url, host, name: nameOf(meta, ld, host), segment: seg.segment, segmentVia: seg.via,
    description: ws(decode(description)).slice(0, 300) || null, services: services_, differentiators: [], contacts, hours, faqs,
    links: pages.slice(1).map(p => ({ url: p.url, label: p.label || "" })), pagesAnalyzed: pages.map(p => p.url),
  };
  profile.missing = missingOf(profile);
  return { profile, textForAi: texts.map((t, i) => t.slice(0, i === 0 ? 3500 : 1200)).join("\n---\n").slice(0, 7000), allText: all };
}
export function missingOf(p) {
  const m = [];
  if (!p.name) m.push("nome da empresa"); if (!p.segment) m.push("segmento"); if (!p.description) m.push("descrição"); if (!p.services?.length) m.push("produtos e serviços");
  if (!p.contacts?.phones?.length && !p.contacts?.whatsapp?.length) m.push("telefone"); if (!p.contacts?.emails?.length) m.push("e-mail"); if (!p.contacts?.address) m.push("endereço");
  if (!p.hours?.length) m.push("horário de atendimento"); if (!p.faqs?.length) m.push("perguntas frequentes");
  return m;
}
