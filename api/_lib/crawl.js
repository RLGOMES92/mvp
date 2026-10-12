// Orquestra a análise: valida URL → robots.txt → página inicial → páginas internas relevantes → extração → refinamento opcional por IA.
import { NetError, validateUrl, createFetcher, safeFetcher } from "./net.js";
import { parseRobots, robotsAllows } from "./robots.js";
import { buildProfile, relevantLinks, htmlToText, missingOf } from "./extract.js";
import { refineWithAi } from "./profile.js";

export class CrawlError extends Error { constructor(code, message) { super(message); this.code = code; this.manual = true; } }
const BUDGET_MS = 36000, MAX_PAGES = 4;

function statusProblem(status) {
  if ([401, 403, 429, 999].includes(status)) return new CrawlError("blocked", "O site bloqueia acessos automatizados (código " + status + "). Você pode preencher os dados manualmente.");
  if (status === 404 || status === 410) return new CrawlError("not_found", "A página não foi encontrada (erro 404). Confira o endereço.");
  if (status >= 500) return new CrawlError("site_error", "O site retornou um erro (código " + status + ") e pode estar fora do ar. Tente novamente mais tarde ou preencha manualmente.");
  if (status >= 400) return new CrawlError("http_error", "O site recusou o acesso (código " + status + "). Você pode preencher os dados manualmente.");
  return null;
}

export async function analyzeSite(input, { fetcher = safeFetcher, emit = () => {}, aiRefine = refineWithAi } = {}) {
  const t0 = Date.now(), left = () => BUDGET_MS - (Date.now() - t0), notes = [];
  const step = (id, label, status = "active", detail) => emit({ type: "step", id, label, status, ...(detail ? { detail } : {}) });
  const fail = e => { throw e instanceof CrawlError ? e : (e instanceof NetError ? Object.assign(new CrawlError(e.code, e.message)) : e); };

  step("validate", "Validando o endereço");
  let start; try { start = validateUrl(input); } catch (e) { const ce = new CrawlError(e.code || "invalid_url", e.message); ce.manual = false; throw ce; }
  step("validate", "Validando o endereço", "done", start.host);

  // robots.txt: respeitamos o pedido do site
  step("robots", "Verificando as regras de acesso do site (robots.txt)");
  const robotsCache = new Map();
  const robotsFor = async u => {
    if (robotsCache.has(u.origin)) return robotsCache.get(u.origin);
    let parsed = { rules: [] };
    try { const r = await fetcher.get(u.origin + "/robots.txt", { types: [], limit: 100000, accept: "text/plain,*/*;q=0.5" }); if (r.status === 200) parsed = parseRobots(r.body); else if (r.status >= 500) notes.push("Não foi possível ler o robots.txt; analisamos apenas páginas públicas básicas."); } catch (e) { if (e.code === "blocked_ip") fail(e); }
    robotsCache.set(u.origin, parsed); return parsed;
  };
  const pq = u => u.pathname + u.search;
  let rob = await robotsFor(start.url);
  if (!robotsAllows(rob, pq(start.url))) throw new CrawlError("robots", "O site pede (robots.txt) que robôs não leiam esta página. Respeitamos esse pedido. Preencha os dados manualmente.");
  step("robots", "Verificando as regras de acesso do site (robots.txt)", "done");

  step("home", "Lendo a página inicial");
  let home; try { home = await fetcher.get(start.url.href); } catch (e) { fail(e); }
  const prob = statusProblem(home.status); if (prob) throw prob;
  const finalUrl = new URL(home.url);
  if (finalUrl.origin !== start.url.origin) { rob = await robotsFor(finalUrl); if (!robotsAllows(rob, pq(finalUrl))) throw new CrawlError("robots", "O site pede (robots.txt) que robôs não leiam esta página. Preencha os dados manualmente."); }
  if (home.truncated) notes.push("A página inicial é grande; analisamos apenas o começo dela.");
  step("home", "Lendo a página inicial", "done", `${Math.round(home.bytes / 1024)} KB`);
  const pages = [{ url: home.url, html: home.body }];

  step("pages", "Lendo páginas internas relevantes");
  const links = relevantLinks(home.body, home.url, MAX_PAGES - 1).filter(l => { try { return robotsAllows(rob, pq(new URL(l.url))); } catch { return false; } });
  if (left() > 12000 && links.length) {
    const got = await Promise.all(links.map(async l => { try { const r = await fetcher.get(l.url); if (r.status >= 200 && r.status < 300) return { url: r.url, html: r.body, label: l.label }; } catch (e) { if (e.code === "blocked_ip") return null; } return null; }));
    got.filter(Boolean).forEach(g => pages.push(g));
    if (got.some(g => !g)) notes.push("Algumas páginas internas não puderam ser lidas.");
  } else if (!links.length) notes.push("Não encontramos páginas internas relevantes além da inicial.");
  step("pages", "Lendo páginas internas relevantes", "done", `${pages.length - 1} página(s)`);

  step("structure", "Organizando as informações encontradas");
  const { profile, textForAi, allText } = buildProfile(pages, finalUrl.hostname);
  profile.ai = { used: false };
  if (left() > 9000) {
    try { const r = await aiRefine(profile, textForAi, allText); if (r) { profile.ai = { used: true }; } } catch { notes.push("O refinamento por IA não estava disponível; mostramos apenas o que foi extraído diretamente das páginas."); }
  } else notes.push("Tempo limite próximo: pulamos o refinamento por IA.");
  profile.missing = missingOf(profile);
  const homeText = htmlToText(home.body, 4000);
  const insufficient = homeText.length < 250 && !profile.services.length && !profile.description;
  if (insufficient) notes.push("Encontramos pouco texto na página (alguns sites carregam o conteúdo com JavaScript, que não executamos). Complete os dados abaixo.");
  step("structure", "Organizando as informações encontradas", "done");
  return { profile, notes, partial: insufficient || profile.missing.length >= 5, insufficient };
}
export { createFetcher };
